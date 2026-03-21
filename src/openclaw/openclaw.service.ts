import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  resolveOpenClawPaths,
  type OpenClawResolvedPaths,
} from './openclaw-paths.resolver';
import { buildStatusOverviewFromHealth } from './gateway-overview-health';
import { mergeGatewayOverviewFromSessionsStore } from './gateway-overview-sessions-store';
import { type StatusOverviewResult } from './gateway-rpc';
import { GatewayConnectionService } from './gateway-connection.service';
import {
  buildBreakdownFromReport,
  parseSystemPromptSections,
  type SystemPromptProbeResult,
  type WorkspaceFileContent,
} from './system-prompt-probe';
import { rebuildSystemPromptMarkdown } from './system-prompt-rebuild';
import { inferInvokedSkillsFromToolCalls } from '../skill-invocation';
import { loadModelPricing, type ModelPricing } from '../config/model-pricing.config';
import { FileSystemSessionStorage, type SessionData, type SessionStorage } from '../storage/session-storage';
import * as fs from 'fs';
import * as path from 'path';

// 加载价格配置（支持配置文件覆盖）
const MODEL_PRICING = loadModelPricing();

/** 从 sessionKey 或 model 字符串中提取模型名称 */
function extractModelFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split('/');
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
      return part;
    }
    if (lower.includes('gpt-')) {
      return part;
    }
    if (lower.includes('gemini')) {
      return part;
    }
    if (lower.includes('grok')) {
      return part;
    }
    if (lower.includes('qwen')) {
      return part;
    }
    if (lower.includes('deepseek')) {
      return part;
    }
    if (lower.includes('kimi') || lower.includes('moonshot')) {
      return part;
    }
  }
  return null;
}

/** 计算 token 对应的费用（USD） */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): number {
  if (!model) return 0;

  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5'];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = cacheReadTokens ? (cacheReadTokens / 1_000_000) * (pricing.cacheRead || 0) : 0;
  const cacheWriteCost = cacheWriteTokens ? (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite || 0) : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

export interface OpenClawSession {
  sessionKey: string;
  sessionId: string;
  userId?: string;
  /** 系统先发问候（/new、/reset 等触发的 greeting） */
  systemSent?: boolean;
  status: 'active' | 'idle' | 'completed' | 'failed';
  createdAt: number;
  lastActiveAt: number;
  /** 总 token 数（来自 sessions.json） */
  totalTokens?: number;
  /** 模型 context 上限（用于计算利用率） */
  contextTokens?: number;
  /** 使用的模型 */
  model?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    limit?: number;
    utilization?: number;
    /**
     * false：sessions.json 中 totalTokensFresh === false，或列表/合并后无法对「当前上下文窗口」给出可信的 total/limit 占比；此时勿展示利用率进度条为准确值。
     */
    contextUtilizationReliable?: boolean;
  };
  /**
   * 计费信息（来自 transcript 的 usage.cost）
   * 注意：tokens 的汇总/展示口径必须只用 usage tokens；cost 只用于费用概念告警/展示。
   */
  usageCost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };

  /** JSONL 中带 entry.message 的行数（与详情页 messages 口径一致） */
  messageCount?: number;
  /** 当前会话 transcript .jsonl 文件大小（字节） */
  transcriptFileSizeBytes?: number;
  /**
   * 从 transcript 扫描得到的去重参与者摘要（群聊等多人时），供列表「参与者」列展示。
   * 例如 `ou_xxx (+2)` 表示首位 + 另 2 人；单人时不设，沿用 userId。
   */
  participantSummary?: string;

  /**
   * transcript 中按出现顺序去重后的真人参与者 id（与 participantSummary 同源）；列表 API 不返回，仅详情合并。
   */
  participantIds?: string[];

  /**
   * 内部：参与者扫描实现版本（storage 缓存失效用）；listSessions 会剥离，不对外暴露。
   */
  transcriptParticipantScanVersion?: number;

  /**
   * tokens 计数口径/数据来源说明。
   * 用于在 tokens=0 等情况下给用户一个可核验的解释。
   */
  tokenUsageMeta?: {
    /**
     * tokens 最终来自哪里：
     * - `transcript`: 来自 transcript 扫描到的 message.usage（即便全是 0）
     * - `sessions.json`: 来自 sessions.json 的 totalTokens/inputTokens/outputTokens
     * - `mixed`: 两者都有（但最终以最终合并结果为准）
     */
    source: 'transcript' | 'sessions.json' | 'mixed' | 'unknown';
    /** transcript 中是否观测到 usage.totalTokens 字段（观测到但可能为 0） */
    transcriptUsageObserved?: boolean;
    /** sessions.json 中是否存在 totalTokens/inputTokens/outputTokens（存在即为非缺失 token 字段） */
    storeTokenFieldsPresent?: boolean;
    /** sessions.json 里 totalTokensFresh：显式 false 表示索引内 totalTokens 不宜作为当前上下文占用依据 */
    totalTokensFresh?: boolean;
    /** 会话日志相对状态根目录的路径（agents/&lt;agent&gt;/sessions/&lt;id&gt;.jsonl） */
    transcriptPath?: string;
    /** 与服务当前解析一致的 OpenClaw 状态根目录绝对路径（便于本地打开核对） */
    stateRootAbsolute?: string;
    /** 本会话 .jsonl 日志文件的绝对路径 */
    sessionLogAbsolutePath?: string;
    /** 同 agent 下 sessions.json 相对状态根路径（agents/&lt;agent&gt;/sessions/sessions.json） */
    sessionsIndexRelativePath?: string;
    /** 与 transcriptFileSizeBytes 同源，便于前端在顶层字段缺失时回退展示 */
    sessionLogFileSizeBytes?: number;
  };
}

export interface InvokedSkill {
  skillName: string;
  readCount: number;
}

/** 会话创建时注入的 skills 快照（来自 sessions.json skillsSnapshot） */
export interface SkillsSnapshotData {
  prompt?: string;
  skills?: Array<{ name: string; primaryEnv?: string; requiredEnv?: string[] }>;
  skillFilter?: string[];
  resolvedSkills?: Array<{ name?: string; description?: string; location?: string }>;
  version?: number;
}

export interface OpenClawSessionDetail extends OpenClawSession {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokenCount?: number;
    /** 发送者标识（从消息内容中提取，仅 user 消息可能有） */
    sender?: string;
  }>;
  toolCalls: Array<{
    name: string;
    input: any;
    output: any;
    durationMs: number;
    success: boolean;
    error?: string;
    /** JSONL 行上的时间戳（毫秒），用于排序与展示调用时间 */
    timestamp?: number;
  }>;
  /** 基于 read path 反推的 skill 调用（path 含 skills/xxx/SKILL.md） */
  invokedSkills?: InvokedSkill[];
  events: Array<{
    type: string;
    timestamp: number;
    payload: any;
  }>;
  /** 当前会话 .jsonl 日志文件大小（字节），便于前端展示预期 */
  transcriptFileSizeBytes: number;
  /**
   * full：整文件读入并逐行解析；
   * head_tail：文件超过阈值时仅读取首尾字节窗口，只解析首部/尾部分片内的 JSONL 行（消息列表仅反映尾部）
   */
  transcriptParseMode: 'full' | 'head_tail';
  /** 全量解析时的 JSONL 行数（非空行） */
  transcriptJsonlLineCount?: number;
  /** 首尾模式：头部分片内解析到的 JSONL 行数（用于元信息/首条 user 等） */
  transcriptHeadJsonlLineCount?: number;
  /** 首尾模式：尾部分片内解析到的 JSONL 行数（消息/工具主要来自此段） */
  transcriptTailJsonlLineCount?: number;
}

type SessionJsonlScan = {
  messages: OpenClawSessionDetail['messages'];
  toolCalls: OpenClawSessionDetail['toolCalls'];
  events: OpenClawSessionDetail['events'];
  firstUserData: any;
  tokenUsage: any;
  transcriptUsageObserved: boolean;
  sumInput: number;
  sumOutput: number;
  lastTotal: number;
  hasCostField: boolean;
  sumCostInput: number;
  sumCostOutput: number;
  sumCostCacheRead: number;
  sumCostCacheWrite: number;
  sumCostTotal: number;
};

export interface OpenClawHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  memoryUsage: number;
  activeSessions: number;
  maxConcurrentSessions: number;
  skills: Array<{
    name: string;
    enabled: boolean;
    lastCalledAt?: number;
  }>;
}

interface SessionFile {
  sessionId: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 从消息内容中提取 sender（用户标识）。
 * 消息可能包含：1) senderLabel 属性 2) 元数据块 3) 群聊格式 "SenderName: body"
 */
function extractSenderFromMessageContent(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Sender (untrusted metadata) 块
  const senderBlockMatch = trimmed.match(
    /Sender \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/
  );
  if (senderBlockMatch) {
    try {
      const obj = JSON.parse(senderBlockMatch[1]);
      const v = obj?.label || obj?.name || obj?.username || obj?.e164 || obj?.id;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  // 2. Conversation info 块中的 sender
  const convBlockMatch = trimmed.match(
    /Conversation info \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/
  );
  if (convBlockMatch) {
    try {
      const obj = JSON.parse(convBlockMatch[1]);
      const v = obj?.sender;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  // 3. 群聊 envelope 格式: [Channel from ts] SenderName: body 或 SenderName: body
  const afterEnvelope = trimmed.replace(/^\[[^\]]+\]\s*/, '');
  const colonMatch = afterEnvelope.match(/^([^:\n]+):\s/);
  if (colonMatch) {
    const sender = colonMatch[1].trim();
    if (sender === '(self)') return 'self';
    if (sender.length > 0 && sender.length < 200) return sender;
  }

  return null;
}

/**
 * 从 transcript 推断是否为 greeting 会话（系统先发问候、用户尚未回复）。
 * 当首条有效 assistant 消息内容像问候语时，视为 systemSent，用于 unknown→greeting 映射。
 */
function inferSystemSentFromTranscript(lines: string[]): boolean {
  const GREETING_PATTERNS = [
    /你好|有什么可以帮|有什么需要|需要我帮忙|需要帮助/,
    /hello|how can I help|what can I do for you|need help/i,
  ];
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    try {
      const entry = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown } };
      if (entry?.type !== 'message' || entry?.message?.role !== 'assistant') continue;
      const content = entry.message?.content;
      let text = '';
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        for (const item of content as Array<{ type?: string; text?: string }>) {
          if (item?.type === 'text' && typeof item.text === 'string') text += item.text;
        }
      }
      if (text.trim().length < 5) continue; // 跳过过短内容（如 "New session started"）
      return GREETING_PATTERNS.some((re) => re.test(text));
    } catch {
      /* ignore */
    }
  }
  return false;
}

function extractSenderFromMessageEntry(entry: {
  message?: { role?: string; content?: unknown; senderLabel?: string };
  user?: string;
}): string | null {
  if (entry?.user && typeof entry.user === 'string' && entry.user.trim()) {
    return entry.user.trim();
  }
  const msg = entry?.message;
  if (!msg) return null;
  if (typeof msg.senderLabel === 'string' && msg.senderLabel.trim()) {
    return msg.senderLabel.trim();
  }
  if (msg.role !== 'user') return null;
  const content = msg.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        text += item.text;
      }
    }
  }
  return extractSenderFromMessageContent(text) || null;
}

@Injectable()
export class OpenClawService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawService.name);
  private baseUrl: string;
  /** 解析缓存，避免每次请求都 exec openclaw */
  private pathsCache: { at: number; paths: OpenClawResolvedPaths } | null = null;
  private static readonly PATHS_TTL_MS = 60_000;

  /** 会话存储（KV 缓存 + 定时轮询） */
  private sessionStorage: SessionStorage;
  /** 后台轮询定时器 */
  private backgroundSyncTimer: NodeJS.Timeout | null = null;
  /** 轮询间隔（毫秒） */
  private static readonly SYNC_INTERVAL_MS = 10_000;
  /** 缓存 TTL（毫秒） */
  private static readonly CACHE_TTL_MS = 10_000;
  /** 小于此大小的 .jsonl 一次性读入并全量解析 */
  private static readonly SESSION_JSONL_FULL_SCAN_MAX_BYTES = 5 * 1024 * 1024;
  /** 大文件时读取文件头部字节数（用于首条 user / 元信息） */
  private static readonly SESSION_JSONL_HEAD_MAX_BYTES = 128 * 1024;
  /** 大文件时读取文件尾部字节数（近期消息、usage 多在尾部） */
  private static readonly SESSION_JSONL_TAIL_MAX_BYTES = 16 * 1024 * 1024;
  /** Promise 级别缓存（防并发重复） */
  private pendingRefresh: Promise<void> | null = null;

  constructor(
    private configService: ConfigService,
    private gatewayConnection: GatewayConnectionService,
  ) {
    this.baseUrl = this.configService.getConfig().openclawGatewayUrl;
    this.sessionStorage = new FileSystemSessionStorage();
  }

  /** 模块初始化时启动后台轮询 */
  async onModuleInit() {
    this.logger.log('OpenClawService: starting background sync...');
    const paths = await this.getResolvedPaths();
    if (paths.stateDir) {
      (this.sessionStorage as FileSystemSessionStorage).setStateDir(paths.stateDir);
      // 初始加载
      await this.refreshCache();
      // 启动定时轮询
      this.startBackgroundSync();
    }
  }

  /** 模块销毁时清理定时器 */
  onModuleDestroy() {
    if (this.backgroundSyncTimer) {
      clearInterval(this.backgroundSyncTimer);
      this.backgroundSyncTimer = null;
    }
  }

  /** 启动后台定时轮询 */
  private startBackgroundSync() {
    this.backgroundSyncTimer = setInterval(() => {
      this.refreshCache().catch((err) => {
        this.logger.error('Background sync failed:', err);
      });
    }, OpenClawService.SYNC_INTERVAL_MS);
    this.logger.log(`OpenClawService: background sync started (interval=${OpenClawService.SYNC_INTERVAL_MS}ms)`);
  }

  /** 刷新缓存（带 Promise 级别锁） */
  private async refreshCache(): Promise<void> {
    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.pendingRefresh = (async () => {
      try {
        const paths = await this.getResolvedPaths();
        if (paths.stateDir) {
          (this.sessionStorage as FileSystemSessionStorage).setStateDir(paths.stateDir);
        }

        if (this.sessionStorage instanceof FileSystemSessionStorage) {
          const sessions = await this.sessionStorage.loadFromFileSystem();
          await this.sessionStorage.upsertBatch(sessions);
          this.logger.debug(`OpenClawService: cache refreshed (${sessions.size} sessions)`);
        }
      } finally {
        this.pendingRefresh = null;
      }
    })();

    return this.pendingRefresh;
  }

  /** 清除路径缓存（配置更新后调用） */
  clearPathsCache(): void {
    this.pathsCache = null;
  }

  /**
   * 获取单个会话（O(1) 查找）
   */
  async getSession(sessionKey: string): Promise<SessionData | null> {
    // 如果缓存过期，触发刷新
    if (Date.now() - this.sessionStorage.getCacheTimestamp() > OpenClawService.CACHE_TTL_MS) {
      await this.refreshCache();
    }
    return this.sessionStorage.get(sessionKey);
  }

  /**
   * 解析 OpenClaw 的 stateDir / configPath / workspaceDir（CLI + 环境变量 + 启发式）
   */
  async getResolvedPaths(forceRefresh = false): Promise<OpenClawResolvedPaths> {
    if (
      !forceRefresh &&
      this.pathsCache &&
      Date.now() - this.pathsCache.at < OpenClawService.PATHS_TTL_MS
    ) {
      return this.pathsCache.paths;
    }
    const cfg = this.configService.getConfig();
    const paths = await resolveOpenClawPaths({
      explicitStateDir: cfg.openclawStateDir,
      explicitWorkspaceDir: cfg.openclawWorkspaceDir,
      gatewayHttpUrl: cfg.openclawGatewayUrl,
      gatewayToken: cfg.openclawGatewayToken,
      gatewayPassword: cfg.openclawGatewayPassword,
    });
    this.pathsCache = { at: Date.now(), paths };
    if (paths.stateDir) {
      this.logger.debug(
        `OpenClaw paths: stateDir=${paths.stateDir} config=${paths.configPath ?? 'n/a'} workspace=${paths.workspaceDir ?? 'n/a'} (${JSON.stringify(paths.source)})`,
      );
    } else if (paths.cliHint) {
      this.logger.warn(`OpenClaw path discovery: ${paths.cliHint}`);
    }
    if (paths.gatewayHint && paths.source.stateDir !== 'gateway') {
      this.logger.debug(`Gateway path hint: ${paths.gatewayHint}`);
    }
    return paths;
  }

  private async stateDir(): Promise<string> {
    const p = await this.getResolvedPaths();
    return p.stateDir ?? '';
  }

  /**
   * 从 OpenClaw 配置文件中读取 agents 配置的模型列表
   */
  async getConfiguredModels(): Promise<{ models: string[]; source?: string } | null> {
    try {
      const paths = await this.getResolvedPaths();
      if (!paths.configPath || !fs.existsSync(paths.configPath)) {
        return null;
      }

      const raw = fs.readFileSync(paths.configPath, 'utf8');
      const cfg = JSON.parse(raw) as {
        agents?: Array<{ model?: string }> | Record<string, { model?: string }>;
      };

      const models = new Set<string>();

      if (Array.isArray(cfg.agents)) {
        // agents: [{ model: 'xxx' }, ...]
        for (const agent of cfg.agents) {
          if (agent?.model && typeof agent.model === 'string') {
            models.add(agent.model);
          }
        }
      } else if (cfg.agents && typeof cfg.agents === 'object') {
        // agents: { name: { model: 'xxx' }, ... }
        for (const agent of Object.values(cfg.agents)) {
          if (agent && typeof agent === 'object' && 'model' in agent) {
            const model = (agent as { model?: string }).model;
            if (model && typeof model === 'string') {
              models.add(model);
            }
          }
        }
      }

      if (models.size === 0) {
        return null;
      }

      return {
        models: Array.from(models),
        source: paths.configPath,
      };
    } catch (error) {
      this.logger.warn('Failed to read configured models from OpenClaw config:', error);
      return null;
    }
  }

  /**
   * 检查 OpenClaw Gateway 连接状态
   * 参考 openclaw 的 control-ui：通过 WebSocket connect 握手验证，包含 token/password 鉴权
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    const cfg = this.configService.getConfig();
    const gatewayUrl = cfg.openclawGatewayUrl?.trim();
    if (!gatewayUrl) {
      return { connected: false, error: 'Gateway URL 未配置' };
    }

    const token = cfg.openclawGatewayToken?.trim();
    const password = cfg.openclawGatewayPassword?.trim();
    let result:
      | {
          ok: true;
          stateDir: string;
          configPath: string | null;
          workspaceDir: string | null;
        }
      | { ok: false; error: string };
    try {
      result = await this.gatewayConnection.fetchRuntimePaths();
    } catch (error: unknown) {
      const errorMessage = (() => {
        if (error && typeof error === 'object') {
          const anyError = error as {
            message?: unknown;
            code?: unknown;
            errors?: unknown;
          };
          if (typeof anyError.message === 'string' && anyError.message.trim()) {
            return anyError.message.trim();
          }
          if (Array.isArray(anyError.errors) && anyError.errors.length > 0) {
            const nested = anyError.errors.find(
              (item) =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as { message?: unknown }).message === 'string' &&
                ((item as { message: string }).message || '').trim().length > 0,
            ) as { message?: string } | undefined;
            if (nested?.message?.trim()) {
              return nested.message.trim();
            }
          }
          if (typeof anyError.code === 'string' && anyError.code.trim()) {
            return anyError.code.trim();
          }
        }
        if (error instanceof Error && error.message.trim()) {
          return error.message.trim();
        }
        if (typeof error === 'string' && error.trim()) {
          return error.trim();
        }
        return 'unknown error';
      })();
      return {
        connected: false,
        error: `Gateway 连接失败：${errorMessage}`,
      };
    }

    if (result.ok) {
      return { connected: true };
    }

    // Gateway 在未提供 token/password 时会返回 "device identity required"
    // 提示用户配置并保存鉴权信息
    const isDeviceIdentityRequired = result.error
      ?.toLowerCase()
      .includes('device identity required');
    const hasNoAuth = !token && !password;
    if (isDeviceIdentityRequired && hasNoAuth) {
      return {
        connected: false,
        error:
          'Gateway 需要鉴权：请在「设置」中配置 openclawGatewayToken（或 password）并点击「保存」',
      };
    }

    return { connected: false, error: result.error };
  }

  /**
   * 获取 Status 概览（version、status、usage），用于仪表盘展示
   */
  async getStatusOverview(): Promise<StatusOverviewResult | null> {
    const cfg = this.configService.getConfig();
    const gatewayUrl = cfg.openclawGatewayUrl?.trim();
    if (!gatewayUrl) {
      return null;
    }
    const seq = await this.gatewayConnection.runSequence([{ method: 'health', methodParams: {} }]);
    if (seq.ok) {
      const overview = buildStatusOverviewFromHealth(seq.payloads[0], seq.gatewayVersion);
      const dir = await this.stateDir();
      return mergeGatewayOverviewFromSessionsStore(overview, dir || null);
    }
    this.logger.debug(`Status overview failed: ${seq.error}`);
    return null;
  }

  /**
   * 在长驻 Gateway WebSocket 上拉取 health 映射的概览 + 尽力 logs.tail。
   * 使用 `health` 替代 `status`/`usage.status`，避免无设备身份 backend 连接报 missing scope: operator.read。
   * `logs.tail` 仍可能因 scope 失败，此时返回空日志并打 debug。
   */
  async getDashboardGatewayBundle(limit: number): Promise<
    | { ok: true; statusOverview: StatusOverviewResult; logsTail: { cursor?: number; lines: string[] } }
    | { ok: false; error: string }
  > {
    const cfg = this.configService.getConfig();
    const gatewayUrl = cfg.openclawGatewayUrl?.trim();
    if (!gatewayUrl) {
      return { ok: false, error: 'Gateway URL 未配置' };
    }

    const seq = await this.gatewayConnection.runSequence([{ method: 'health', methodParams: {} }]);
    if (!seq.ok) {
      return { ok: false, error: seq.error };
    }

    let statusOverview = buildStatusOverviewFromHealth(seq.payloads[0], seq.gatewayVersion);
    const dir = await this.stateDir();
    statusOverview = mergeGatewayOverviewFromSessionsStore(statusOverview, dir || null);

    const tailParams = {
      limit,
      maxBytes: Math.max(250_000, limit * 4_000),
    };
    const logsRes = await this.gatewayConnection.request<{
      cursor?: number;
      lines?: unknown;
    }>('logs.tail', tailParams, 20_000);

    if (!logsRes.ok) {
      this.logger.debug(`Gateway logs.tail skipped (scope or other): ${logsRes.error}`);
      return {
        ok: true,
        statusOverview,
        logsTail: { lines: [] },
      };
    }

    const tail = logsRes.payload ?? {};
    const rawLines = Array.isArray(tail.lines)
      ? tail.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
      : [];

    return {
      ok: true,
      statusOverview,
      logsTail: {
        cursor: typeof tail.cursor === 'number' ? tail.cursor : undefined,
        lines: rawLines,
      },
    };
  }

  /**
   * 获取 Gateway 健康状态
   */
  async getHealth(): Promise<OpenClawHealth> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      this.logger.error('Failed to get health:', error);
      throw error;
    }
  }

  /**
   * 从本地 sessions.json 读取 systemPromptReport（优先于 Gateway RPC，无需网络）
   * 扫描 agents/{agent}/sessions/sessions.json，优先 agent:main:main，其次按 updatedAt 取最新
   */
  private loadSystemPromptFromSessionsJson(
    dir: string,
  ): {
    chosen: { key: string; sessionId?: string; agentId?: string };
    report: Record<string, unknown>;
    resolvedSkills?: Array<{ name: string; filePath?: string; description?: string }>;
    /** OpenClaw 实际注入的 skills 文本（name+description+location，非全文） */
    skillsPrompt?: string;
    /** 完整 skillsSnapshot（prompt + skills 列表） */
    skillsSnapshot?: SkillsSnapshotData;
  } | null {
    const agentsDir = path.join(dir, 'agents');
    if (!fs.existsSync(agentsDir)) return null;
    try {
      const agentDirs = fs.readdirSync(agentsDir);
      const candidates: Array<{
        key: string;
        sessionId?: string;
        agentId: string;
        updatedAt: number;
        report: Record<string, unknown>;
        resolvedSkills?: Array<{ name: string; filePath?: string; description?: string }>;
        skillsPrompt?: string;
        skillsSnapshot?: SkillsSnapshotData;
      }> = [];
      for (const agent of agentDirs) {
        const storePath = path.join(agentsDir, agent, 'sessions', 'sessions.json');
        if (!fs.existsSync(storePath)) continue;
        const raw = fs.readFileSync(storePath, 'utf-8');
        const store = JSON.parse(raw) as Record<
          string,
          {
            systemPromptReport?: unknown;
            sessionId?: string;
            updatedAt?: number;
            skillsSnapshot?: {
              prompt?: string;
              resolvedSkills?: Array<{ name?: string; filePath?: string; description?: string }>;
            };
          }
        >;
        for (const [key, entry] of Object.entries(store)) {
          const report = entry?.systemPromptReport;
          if (report && typeof report === 'object' && report !== null) {
            const resolved = entry?.skillsSnapshot?.resolvedSkills;
            const resolvedSkills = Array.isArray(resolved)
              ? resolved
                  .filter((r) => r && typeof r.name === 'string')
                  .map((r) => ({
                    name: r.name!,
                    filePath: typeof r.filePath === 'string' ? r.filePath : undefined,
                    description: typeof r.description === 'string' ? r.description : undefined,
                  }))
              : undefined;
            const skillsPrompt =
              typeof entry?.skillsSnapshot?.prompt === 'string' ? entry.skillsSnapshot.prompt : undefined;
            const skillsSnapshot =
              entry?.skillsSnapshot && typeof entry.skillsSnapshot === 'object' ? entry.skillsSnapshot : undefined;
            candidates.push({
              key,
              sessionId: entry.sessionId,
              agentId: agent,
              updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
              report: report as Record<string, unknown>,
              resolvedSkills,
              skillsPrompt,
              skillsSnapshot,
            });
          }
        }
      }
      if (!candidates.length) return null;
      const preferred = candidates.find((c) => c.key === 'agent:main:main');
      const chosen = preferred ?? [...candidates].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return {
        chosen: { key: chosen.key, sessionId: chosen.sessionId, agentId: chosen.agentId },
        report: chosen.report,
        resolvedSkills: chosen.resolvedSkills,
        skillsPrompt: chosen.skillsPrompt,
        skillsSnapshot: chosen.skillsSnapshot,
      };
    } catch {
      return null;
    }
  }

  /**
   * 从 sessions.json 读取 session 的 totalTokens/model/contextTokens 与 storeKey。
   * OpenClaw 模型为 sessionKey -> SessionEntry；按 sessionId 反查时与 Gateway 一致使用首个匹配项（见 openclaw resolveSessionKeyForRequest）。
   */
  private loadStoreEntryForSession(
    dir: string,
    agent: string,
    sessionId: string,
  ): {
    storeKey?: string;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    contextTokens?: number;
    model?: string;
    systemSent?: boolean;
    totalTokensFresh?: boolean;
  } | null {
    const storePath = path.join(dir, 'agents', agent, 'sessions', 'sessions.json');
    if (!fs.existsSync(storePath)) return null;
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const store = JSON.parse(raw) as Record<
        string,
        { sessionId?: string; totalTokens?: number; inputTokens?: number; outputTokens?: number; contextTokens?: number; model?: string; updatedAt?: number }
      >;
      const toEntry = (key: string, entry: any) => ({
        storeKey: key,
        totalTokens: typeof entry?.totalTokens === 'number' ? entry.totalTokens : undefined,
        inputTokens: typeof entry?.inputTokens === 'number' ? entry.inputTokens : undefined,
        outputTokens: typeof entry?.outputTokens === 'number' ? entry.outputTokens : undefined,
        contextTokens: typeof entry?.contextTokens === 'number' ? entry.contextTokens : undefined,
        model: typeof entry?.model === 'string' ? entry.model : undefined,
        totalTokensFresh: typeof entry?.totalTokensFresh === 'boolean' ? entry.totalTokensFresh : undefined,
        // 保留 undefined 以便 transcript 推断：仅当 store 明确有值时才传递
        systemSent: typeof entry?.systemSent === 'boolean' ? entry.systemSent : undefined,
      });
      const foundKey = Object.keys(store).find((key) => store[key]?.sessionId === sessionId);
      if (foundKey) {
        return toEntry(foundKey, store[foundKey]);
      }
      if (store[sessionId]) return toEntry(sessionId, store[sessionId]);
      const altKey = `${agent}/${sessionId}`;
      if (store[altKey]) return toEntry(altKey, store[altKey]);
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * 从 sessionStorage 扫描缓存读取 .jsonl 的 fileMeta.size（与列表页同源）。
   * 详情接口若顶层/ tokenUsageMeta 未带上字节数时，SessionsService 可据此兜底。
   */
  async getTranscriptFileSizeFromSessionCache(idParam: string): Promise<number | undefined> {
    try {
      if (Date.now() - this.sessionStorage.getCacheTimestamp() > OpenClawService.CACHE_TTL_MS) {
        await this.refreshCache();
      }
      const map = await this.sessionStorage.getAll();
      const bare = idParam.includes('/') ? idParam.slice(idParam.lastIndexOf('/') + 1) : idParam;
      for (const [, data] of map) {
        const sz = data.fileMeta?.size;
        if (typeof sz !== 'number' || !Number.isFinite(sz)) continue;
        if (data.sessionId === idParam || data.sessionId === bare) return sz;
        if (data.sessionKey === idParam) return sz;
        if (data.sessionKey.endsWith(`/${bare}`)) return sz;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  /**
   * 直接对 transcript .jsonl 做一次 stat（不解析内容）。
   * 当详情对象里 transcriptFileSizeBytes / tokenUsageMeta / 缓存均缺失时兜底。
   */
  async getTranscriptFileStatBytes(idParam: string): Promise<number | undefined> {
    try {
      const f = await this.findSessionFile(idParam);
      if (!f) return undefined;
      return Number(fs.statSync(f.filePath).size);
    } catch {
      return undefined;
    }
  }

  /**
   * 获取会话列表（从缓存读取，O(1) 复杂度）
   */
  async listSessions(): Promise<OpenClawSession[]> {
    // 如果缓存过期，触发刷新
    if (Date.now() - this.sessionStorage.getCacheTimestamp() > OpenClawService.CACHE_TTL_MS) {
      await this.refreshCache();
    }

    const sessionsMap = await this.sessionStorage.getAll();
    const sessions: OpenClawSession[] = [];

    for (const [_, data] of sessionsMap) {
      // 移除 fileMeta / 内部扫描版本 / 完整参与者 id 列表（列表只需 participantSummary 短串）
      const {
        fileMeta,
        transcriptParticipantScanVersion: _scanVer,
        participantIds: _pids,
        ...session
      } = data;
      sessions.push(session);
    }

    // 按最后活跃时间排序
    return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  private parseTokenUsage(val: unknown): OpenClawSession['tokenUsage'] | undefined {
    if (!val || typeof val !== 'object') return undefined;
    const o = val as Record<string, unknown>;
    if (typeof o.input !== 'number' || typeof o.output !== 'number' || typeof o.total !== 'number') return undefined;
    return {
      input: o.input,
      output: o.output,
      total: o.total,
      limit: typeof o.limit === 'number' ? o.limit : undefined,
      utilization: typeof o.utilization === 'number' ? o.utilization : undefined,
    };
  }

  private inferSessionStatus(lastMessage: any, mtimeMs: number): 'active' | 'idle' | 'completed' | 'failed' {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    if (lastMessage?.type === 'agent:final') {
      return 'completed';
    }

    if (mtimeMs > fiveMinutesAgo) {
      return 'active';
    }

    return 'idle';
  }

  /**
   * 从 .reset. 归档文件中提取 token 用量（/new 重置前的历史）
   * 每个 .reset. 文件代表一次重置前的 epoch，取最后一条带 usage 的消息作为该 epoch 的 token 总量
   */
  async getArchivedTokenUsageFromResetFiles(): Promise<
    Array<{ sessionId: string; resetTimestamp: string; inputTokens: number; outputTokens: number; totalTokens: number }>
  > {
    const dir = await this.stateDir();
    if (!dir) return [];

    const result: Array<{
      sessionId: string;
      resetTimestamp: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }> = [];

    try {
      const agentsDir = path.join(dir, 'agents');
      if (!fs.existsSync(agentsDir)) return [];

      for (const agent of fs.readdirSync(agentsDir)) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessionsDir)) continue;

        for (const file of fs.readdirSync(sessionsDir)) {
          const m = file.match(/^(.+?)\.jsonl\.reset\.(.+)$/);
          if (!m) continue;
          const [, sessionId, resetTimestamp] = m;

          try {
            const content = fs.readFileSync(path.join(sessionsDir, file), 'utf-8');
            const lines = content.split('\n').filter((l) => l.trim());
            let lastUsage: { input: number; output: number; total: number } | null = null;

            for (const line of lines) {
              const entry = JSON.parse(line) as Record<string, unknown>;
              const usage = (entry?.message as any)?.usage ?? (entry as any).usage;
              if (usage && typeof usage.totalTokens === 'number') {
                lastUsage = {
                  input: typeof usage.input === 'number' ? usage.input : 0,
                  output: typeof usage.output === 'number' ? usage.output : 0,
                  total: usage.totalTokens,
                };
              }
            }

            if (lastUsage && lastUsage.total > 0) {
              result.push({
                sessionId,
                resetTimestamp,
                inputTokens: lastUsage.input,
                outputTokens: lastUsage.output,
                totalTokens: lastUsage.total,
              });
            }
          } catch {
            /* skip unparseable */
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to get archived token usage from reset files', error);
    }

    return result;
  }

  private readFileUtf8Slice(filePath: string, position: number, length: number): string {
    const fd = fs.openSync(filePath, 'r');
    try {
      const n = Math.max(0, length | 0);
      const buf = Buffer.allocUnsafe(n);
      const read = fs.readSync(fd, buf, 0, n, Math.max(0, position));
      return buf.subarray(0, read).toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  }

  /** 解析 transcript JSONL 行（全量与首尾分片共用） */
  private scanSessionJsonlLines(lines: string[]): SessionJsonlScan {
    const messages: OpenClawSessionDetail['messages'] = [];
    const toolCalls: OpenClawSessionDetail['toolCalls'] = [];
    const events: OpenClawSessionDetail['events'] = [];
    const toolCallIdToIndex = new Map<string, number>();
    const legacyToolUseNames = new Set<string>();

    let firstUserData: any = null;
    let tokenUsage: any = null;
    let transcriptUsageObserved = false;
    let sumInput = 0;
    let sumOutput = 0;
    let lastTotal = 0;
    let sumCostInput = 0;
    let sumCostOutput = 0;
    let sumCostCacheRead = 0;
    let sumCostCacheWrite = 0;
    let sumCostTotal = 0;
    let hasCostField = false;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // 提取用户信息：优先 entry.user，否则从消息内容中提取 sender
        if (!firstUserData) {
          const sender = extractSenderFromMessageEntry(entry);
          if (sender) {
            firstUserData = { user: sender };
          } else if (entry.user) {
            firstUserData = entry;
          }
        }

        // 提取 token 使用：支持 entry.tokenUsage 或 entry.message.usage，多轮会话累加
        const usage = (entry?.message as any)?.usage ?? entry?.tokenUsage;
        if (usage && typeof usage.totalTokens === 'number') {
          transcriptUsageObserved = true;
          const inp = typeof usage.input === 'number' ? usage.input : 0;
          const out = typeof usage.output === 'number' ? usage.output : 0;
          sumInput += inp;
          sumOutput += out;
          lastTotal = usage.totalTokens;

          // usage.cost 由 provider/model cost 配置驱动；用于异常告警展示
          const cost = (usage as any)?.cost;
          if (cost && typeof cost === 'object' && typeof cost.total === 'number') {
            hasCostField = true;
            sumCostInput += typeof cost.input === 'number' ? cost.input : 0;
            sumCostOutput += typeof cost.output === 'number' ? cost.output : 0;
            sumCostCacheRead += typeof cost.cacheRead === 'number' ? cost.cacheRead : 0;
            sumCostCacheWrite += typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0;
            sumCostTotal += cost.total;
          }
          tokenUsage = {
            input: sumInput,
            output: sumOutput,
            total: lastTotal,
            limit: typeof usage.limit === 'number' ? usage.limit : undefined,
          };
        }

        // 提取消息
        if (entry.message) {
          const msg = entry.message;
          const messageContent = msg.content;
          const role = msg.role as string;

          // 顶层 + content 级：toolResult 消息（role=toolResult）关联到之前的 toolCall
          if (role === 'toolResult') {
            const toolCallId = msg.toolCallId as string | undefined;
            const toolName = msg.toolName as string | undefined;
            const isError = msg.isError === true;
            const details = msg.details as { durationMs?: number; status?: string } | undefined;
            const durationMs = details?.durationMs ?? 0;

            let output: any = {};
            if (Array.isArray(messageContent)) {
              const texts: string[] = [];
              for (const item of messageContent) {
                if (item?.type === 'text' && typeof item.text === 'string') {
                  texts.push(item.text);
                }
              }
              output = texts.length === 1 ? texts[0] : texts.length > 1 ? texts : {};
            }
            if (details && Object.keys(details).length > 0 && (typeof output !== 'object' || Object.keys(output as object).length === 0)) {
              output = details;
            }

            if (toolCallId && toolCallIdToIndex.has(toolCallId)) {
              const idx = toolCallIdToIndex.get(toolCallId)!;
              const prev = toolCalls[idx];
              toolCalls[idx] = {
                ...prev,
                output,
                durationMs,
                success: !isError,
                error: isError ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
                timestamp:
                  prev.timestamp ??
                  (typeof entry.timestamp === 'number' ? entry.timestamp : undefined),
              };
            } else {
              toolCalls.push({
                name: toolName || 'unknown',
                input: {},
                output,
                durationMs,
                success: !isError,
                error: isError ? (typeof output === 'string' ? output : undefined) : undefined,
                timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
              });
            }
          }

          // 处理 content 可能是数组或字符串的情况
          let contentText = '';
          if (Array.isArray(messageContent)) {
            for (const item of messageContent) {
              if (item.type === 'toolCall') {
                const id = item.id || item.toolCallId;
                const name = item.name || item.toolName || 'unknown';
                const args = item.arguments || item.input || {};
                const idx = toolCalls.length;
                toolCalls.push({
                  name,
                  input: args,
                  output: {},
                  durationMs: 0,
                  success: true,
                  error: undefined,
                  timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
                });
                if (id) toolCallIdToIndex.set(id, idx);
              } else if (item.type === 'text') {
                contentText += item.text || '';
              } else if (item.type === 'thinking') {
                // 跳过 thinking 内容，不显示
              }
            }
            if (!contentText && role === 'assistant') {
              const tcNames = messageContent.filter((c: any) => c?.type === 'toolCall').map((c: any) => c.name || c.toolName).filter(Boolean);
              if (tcNames.length > 0) {
                contentText = '[工具调用：' + tcNames.join(', ') + ']';
              } else if (!contentText) {
                contentText = '[无内容]';
              }
            } else if (!contentText) {
              contentText = '[无内容]';
            }
          } else {
            contentText = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
          }

          const sender =
            role === 'user'
              ? (msg.senderLabel as string) || extractSenderFromMessageContent(contentText)
              : undefined;
          const displayRole = role === 'toolResult' ? 'assistant' : (role as 'user' | 'assistant' | 'system');
          messages.push({
            role: displayRole,
            content: contentText,
            timestamp: entry.timestamp || Date.now(),
            tokenCount: msg.tokenCount,
            ...(sender ? { sender } : {}),
          });
        }

        // 提取工具调用（兼容旧的 toolUse 格式）
        if (entry.toolUse) {
          const legacyToolName = entry.toolUse.name as string;
          if (!legacyToolUseNames.has(legacyToolName)) {
            legacyToolUseNames.add(legacyToolName);
            toolCalls.push({
              name: entry.toolUse.name,
              input: entry.toolUse.input || {},
              output: entry.toolUse.output || {},
              durationMs: entry.toolUse.durationMs || 0,
              success: entry.toolUse.success !== false,
              error: entry.toolUse.error,
              timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
            });
          }
        }

        // 提取事件
        if (entry.type && !entry.message && !entry.toolUse) {
          events.push({
            type: entry.type,
            timestamp: entry.timestamp || Date.now(),
            payload: entry,
          });
        }
      } catch (e) {
        // 跳过无法解析的行
      }
    }


    return {
      messages,
      toolCalls,
      events,
      firstUserData,
      tokenUsage,
      transcriptUsageObserved,
      sumInput,
      sumOutput,
      lastTotal,
      hasCostField,
      sumCostInput,
      sumCostOutput,
      sumCostCacheRead,
      sumCostCacheWrite,
      sumCostTotal,
    };
  }

  /**
   * 获取会话详情（从文件系统读取）
   *
   * 性能：超过 `SESSION_JSONL_FULL_SCAN_MAX_BYTES`（默认 5MB）的 .jsonl 只读取
   * 头部（首条 user 等）+ 尾部（近期消息与 usage）字节窗口，并返回首尾各自解析到的 JSONL 行数；
   * 响应中始终包含 `transcriptFileSizeBytes` 与 `transcriptParseMode`。
   */
  async getSessionDetail(sessionId: string): Promise<OpenClawSessionDetail | null> {
    if (!(await this.stateDir())) {
      this.logger.warn('State directory not configured');
      return null;
    }

    try {
      // 查找会话文件
      const sessionFile = await this.findSessionFile(sessionId);
      if (!sessionFile) {
        return null;
      }

      const stats = fs.statSync(sessionFile.filePath);
      /** JSON 序列化不支持 bigint；统一为 number */
      const size = Number(stats.size);
      const splitJsonl = (t: string) => t.split('\n').filter((line) => line.trim());
      const FULL = OpenClawService.SESSION_JSONL_FULL_SCAN_MAX_BYTES;
      const HEAD = OpenClawService.SESSION_JSONL_HEAD_MAX_BYTES;
      const TAIL = OpenClawService.SESSION_JSONL_TAIL_MAX_BYTES;

      let transcriptParseMode: 'full' | 'head_tail' = 'full';
      let transcriptJsonlLineCount: number | undefined;
      let transcriptHeadJsonlLineCount: number | undefined;
      let transcriptTailJsonlLineCount: number | undefined;
      let linesForInfer: string[];
      let scan: SessionJsonlScan;

      if (size <= FULL) {
        const content = fs.readFileSync(sessionFile.filePath, 'utf-8');
        const lines = splitJsonl(content);
        if (lines.length === 0) {
          return null;
        }
        scan = this.scanSessionJsonlLines(lines);
        linesForInfer = lines;
        transcriptJsonlLineCount = lines.length;
      } else {
        const headLen = Math.min(HEAD, size);
        const tailLen = Math.min(TAIL, size);
        if (headLen + tailLen >= size) {
          const content = fs.readFileSync(sessionFile.filePath, 'utf-8');
          const lines = splitJsonl(content);
          if (lines.length === 0) {
            return null;
          }
          scan = this.scanSessionJsonlLines(lines);
          linesForInfer = lines;
          transcriptJsonlLineCount = lines.length;
        } else {
          transcriptParseMode = 'head_tail';
          const headText = this.readFileUtf8Slice(sessionFile.filePath, 0, headLen);
          const tailBufStart = size - tailLen;
          const tailRaw = this.readFileUtf8Slice(sessionFile.filePath, tailBufStart, tailLen);
          const nl = tailRaw.indexOf('\n');
          const tailText = nl === -1 ? tailRaw : tailRaw.slice(nl + 1);

          const headLines = splitJsonl(headText);
          const tailLines = splitJsonl(tailText);
          if (headLines.length === 0 && tailLines.length === 0) {
            return null;
          }
          transcriptHeadJsonlLineCount = headLines.length;
          transcriptTailJsonlLineCount = tailLines.length;
          const headScan = this.scanSessionJsonlLines(headLines);
          const tailScan = this.scanSessionJsonlLines(tailLines);
          scan = {
            ...tailScan,
            firstUserData: headScan.firstUserData ?? tailScan.firstUserData,
          };
          linesForInfer = [...headLines.slice(0, 80), ...tailLines.slice(0, 80)];
        }
      }

      const {
        messages,
        toolCalls,
        events,
        firstUserData,
        tokenUsage,
        transcriptUsageObserved,
        hasCostField,
        sumCostInput,
        sumCostOutput,
        sumCostCacheRead,
        sumCostCacheWrite,
        sumCostTotal,
      } = scan;

      let usageCost: any = null;
      const agent = sessionFile.sessionId.split('/')[0];
      const dir = await this.stateDir();
      /** 路由可能是 agent/uuid，sessions.json 中一般为纯 uuid */
      const sessionIdForStore = sessionId.includes('/')
        ? sessionId.slice(sessionId.lastIndexOf('/') + 1)
        : sessionId;
      const storeEntry = dir ? this.loadStoreEntryForSession(dir, agent, sessionIdForStore) : null;
      if (hasCostField) {
        usageCost = {
          input: sumCostInput,
          output: sumCostOutput,
          cacheRead: sumCostCacheRead,
          cacheWrite: sumCostCacheWrite,
          total: sumCostTotal,
        };
      } else {
        // 降级方案：当 transcript 中没有 usage.cost 数据时，使用配置价格进行估算
        const model = storeEntry?.model || extractModelFromSessionKey(sessionId);
        const input = storeEntry?.inputTokens ?? (tokenUsage?.input ?? 0);
        const output = storeEntry?.outputTokens ?? (tokenUsage?.output ?? 0);
        const estimatedCost = calculateCost(input, output, model);
        if (estimatedCost > 0) {
          usageCost = {
            input: estimatedCost,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: estimatedCost,
          };
        }
      }

      const storeTokenFieldsPresent = !!(
        storeEntry &&
        (typeof storeEntry.totalTokens === 'number' ||
          typeof storeEntry.inputTokens === 'number' ||
          typeof storeEntry.outputTokens === 'number')
      );

      const transcriptHasNonZero =
        !!tokenUsage &&
        (((tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)) > 0 || (tokenUsage.total ?? 0) > 0);

      let tokenUsageSource: NonNullable<OpenClawSession['tokenUsageMeta']>['source'] = 'unknown';
      if (transcriptUsageObserved && storeTokenFieldsPresent) {
        // 代码实现里：当 transcript 有非零 tokens 时优先使用 transcript，否则再用 store
        tokenUsageSource = transcriptHasNonZero ? 'transcript' : 'sessions.json';
      } else if (transcriptUsageObserved) {
        tokenUsageSource = 'transcript';
      } else if (storeTokenFieldsPresent) {
        tokenUsageSource = 'sessions.json';
      }

      const transcriptPath =
        dir && sessionFile.filePath.startsWith(dir)
          ? sessionFile.filePath.slice(dir.length + 1)
          : sessionFile.filePath;

      const sessionsIndexRelativePath =
        dir && agent ? path.join('agents', agent, 'sessions', 'sessions.json').replace(/\\/g, '/') : undefined;

      const tokenUsageMeta: OpenClawSession['tokenUsageMeta'] = {
        source: tokenUsageSource,
        transcriptUsageObserved,
        storeTokenFieldsPresent,
        totalTokensFresh: storeEntry?.totalTokensFresh,
        transcriptPath,
        stateRootAbsolute: dir || undefined,
        sessionLogAbsolutePath: sessionFile.filePath,
        sessionsIndexRelativePath,
        sessionLogFileSizeBytes: size,
      };

      const base = { ...tokenUsage };
      if (storeEntry) {
        // transcript 有数据时优先用 transcript（多轮会话更准确），store 仅补 limit
        const fromTranscript = (base.input ?? 0) + (base.output ?? 0) > 0 || (base.total ?? 0) > 0;
        if (!fromTranscript) {
          const storeTotalOk =
            typeof storeEntry.totalTokens === 'number' && storeEntry.totalTokensFresh !== false;
          if (storeTotalOk && storeEntry.totalTokens != null) {
            base.total = storeEntry.totalTokens;
          }
          if (storeEntry.inputTokens != null) base.input = storeEntry.inputTokens;
          if (storeEntry.outputTokens != null) base.output = storeEntry.outputTokens;
        }
        if (storeEntry.contextTokens != null) base.limit = storeEntry.contextTokens;
      }

      const utilDen = base.limit ?? tokenUsage?.limit;
      const storeTotalOkForUtil =
        !!storeEntry &&
        typeof storeEntry.totalTokens === 'number' &&
        storeEntry.totalTokensFresh !== false;
      const contextUtilizationReliable = !!(
        typeof utilDen === 'number' &&
        utilDen > 0 &&
        typeof base.total === 'number' &&
        (transcriptHasNonZero || storeTotalOkForUtil)
      );
      if (contextUtilizationReliable && typeof base.total === 'number' && typeof utilDen === 'number') {
        base.utilization = Math.round((base.total / utilDen) * 100);
      } else {
        delete base.utilization;
      }

      const mergedTokenUsage = {
        ...base,
        contextUtilizationReliable,
      };
      const sessionKey = storeEntry?.storeKey ?? sessionFile.sessionId;
      const invokedSkills = inferInvokedSkillsFromToolCalls(toolCalls);
      const userId = firstUserData?.user || 'unknown';
      // 若 store 无 systemSent 且 userId 仍 unknown，从 transcript 推断 greeting
      let systemSent = storeEntry?.systemSent;
      if (systemSent === undefined && userId === 'unknown' && linesForInfer.length > 1) {
        systemSent = inferSystemSentFromTranscript(linesForInfer);
      }

      return {
        sessionKey,
        sessionId: sessionFile.sessionId,
        userId,
        systemSent,
        status: this.inferSessionStatus(firstUserData, stats.mtimeMs),
        createdAt: stats.birthtimeMs,
        lastActiveAt: stats.mtimeMs,
        totalTokens:
          storeEntry &&
          typeof storeEntry.totalTokens === 'number' &&
          storeEntry.totalTokensFresh !== false
            ? storeEntry.totalTokens
            : typeof mergedTokenUsage.total === 'number'
              ? mergedTokenUsage.total
              : undefined,
        contextTokens: storeEntry?.contextTokens,
        model: storeEntry?.model,
        tokenUsage: mergedTokenUsage,
        usageCost: usageCost ?? undefined,
        tokenUsageMeta,
        messages,
        toolCalls,
        invokedSkills,
        events,
        transcriptFileSizeBytes: size,
        transcriptParseMode,
        ...(transcriptParseMode === 'full' && transcriptJsonlLineCount != null
          ? { transcriptJsonlLineCount }
          : {}),
        ...(transcriptParseMode === 'head_tail'
          ? {
              transcriptHeadJsonlLineCount: transcriptHeadJsonlLineCount ?? 0,
              transcriptTailJsonlLineCount: transcriptTailJsonlLineCount ?? 0,
            }
          : {}),
      };
    } catch (error) {
      this.logger.error('Failed to get session detail:', error);
      return null;
    }
  }

  private readWorkspaceInjectedContents(
    workspaceDir: string,
    files: SystemPromptProbeResult['workspaceFiles'],
  ): WorkspaceFileContent[] {
    const MAX_CHARS = 400_000;
    const MAX_FILES = 40;
    const wsResolved = path.resolve(workspaceDir.trim());
    if (!fs.existsSync(wsResolved)) {
      return [];
    }
    let wsReal: string;
    try {
      wsReal = fs.realpathSync(wsResolved);
    } catch {
      wsReal = wsResolved;
    }

    const out: WorkspaceFileContent[] = [];
    const list = files.slice(0, MAX_FILES);
    for (const f of list) {
      if (f.missing) {
        out.push({
          name: f.name || f.path,
          path: f.path,
          content: '',
          truncated: false,
          readError: '报告标记为缺失，未读取',
        });
        continue;
      }
      const rel = String(f.path || f.name || '').trim();
      if (!rel) continue;
      try {
        const candidate = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(wsReal, rel);
        let targetReal: string;
        try {
          targetReal = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate;
        } catch {
          targetReal = candidate;
        }
        // 报告中的文件路径来自 openclaw 注入，preset 等可能在 workspace 外，允许读取
        const isAbsolutePath = path.isAbsolute(rel);
        if (!isAbsolutePath) {
          const relToWs = path.relative(wsReal, targetReal);
          if (relToWs.startsWith('..') || path.isAbsolute(relToWs)) {
            out.push({
              name: f.name || f.path,
              path: f.path,
              content: '',
              truncated: false,
              readError: '路径不在 workspace 内，已跳过',
            });
            continue;
          }
        }
        if (!fs.existsSync(targetReal) || !fs.statSync(targetReal).isFile()) {
          out.push({
            name: f.name || f.path,
            path: f.path,
            content: '',
            truncated: false,
            readError: '文件不存在或不是普通文件',
          });
          continue;
        }
        const raw = fs.readFileSync(targetReal, 'utf-8');
        const truncated = raw.length > MAX_CHARS;
        out.push({
          name: f.name || f.path,
          path: f.path,
          content: truncated ? raw.slice(0, MAX_CHARS) : raw,
          truncated,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.push({
          name: f.name || f.path,
          path: f.path,
          content: '',
          truncated: false,
          readError: msg,
        });
      }
    }
    return out;
  }

  private async findSessionFile(sessionId: string): Promise<SessionFile | null> {
    const dir = await this.stateDir();
    const agentsDir = path.join(dir, 'agents');
    if (!fs.existsSync(agentsDir)) {
      return null;
    }

    const toSessionFile = (
      filePath: string,
      agent: string,
      /** 与 listSessions / 磁盘文件名（不含 .jsonl）一致的 id 段 */
      fileStem: string,
    ): SessionFile => {
      const stats = fs.statSync(filePath);
      return {
        sessionId: `${agent}/${fileStem}`,
        filePath,
        createdAt: stats.birthtimeMs,
        updatedAt: stats.mtimeMs,
      };
    };

    const agentDirs = fs.readdirSync(agentsDir);

    for (const agent of agentDirs) {
      const sessionsDir = path.join(agentsDir, agent, 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        continue;
      }

      // 1) 与 list 一致：agents/<agent>/sessions/<id>.jsonl，id 通常为纯 UUID
      const direct = path.join(sessionsDir, `${sessionId}.jsonl`);
      if (fs.existsSync(direct)) {
        return toSessionFile(direct, agent, sessionId);
      }
    }

    // 2) 路由为 agent/<uuid> 时，不能用 path.join(sessions, `${sessionId}.jsonl`)（会变成子目录）
    const slash = sessionId.indexOf('/');
    if (slash !== -1) {
      const agentHint = sessionId.slice(0, slash);
      const bareId = sessionId.slice(slash + 1);
      if (!bareId) return null;

      const hintedDir = path.join(agentsDir, agentHint, 'sessions');
      const hintedPath = path.join(hintedDir, `${bareId}.jsonl`);
      if (fs.existsSync(hintedPath)) {
        return toSessionFile(hintedPath, agentHint, bareId);
      }

      for (const agent of agentDirs) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessionsDir)) continue;
        const p = path.join(sessionsDir, `${bareId}.jsonl`);
        if (fs.existsSync(p)) {
          return toSessionFile(p, agent, bareId);
        }
      }
    }

    return null;
  }

  /**
   * 终止会话（通过删除会话文件）
   */
  async killSession(sessionId: string): Promise<boolean> {
    if (!(await this.stateDir())) {
      this.logger.warn('State directory not configured');
      return false;
    }

    try {
      const sessionFile = await this.findSessionFile(sessionId);
      if (!sessionFile) {
        return false;
      }

      await fs.promises.unlink(sessionFile.filePath);
      this.logger.log(`Killed session: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to kill session:', error);
      return false;
    }
  }

  /**
   * 获取最近日志（从 OpenClaw 日志文件读取）
   */
  async getRecentLogs(limit: number = 100): Promise<string[]> {
    const config = this.configService.getConfig();
    const logPath = config.openclawLogPath;

    if (!logPath) {
      this.logger.warn('Log file path not configured (OPENCLAW_LOG_PATH)');
      return [];
    }

    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // 返回最后 N 行
      return lines.slice(-limit);
    } catch (error) {
      this.logger.error('Failed to get recent logs:', error);
      return [];
    }
  }

  /**
   * 更新配置（通过 openclaw CLI）
   */
  async updateConfig(config: Record<string, unknown>): Promise<boolean> {
    try {
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      const cli = process.env.OPENCLAW_CLI || 'openclaw';

      for (const [key, value] of Object.entries(config)) {
        const v =
          typeof value === 'string' ? value : JSON.stringify(value ?? '');
        await execFileAsync(cli, ['config', 'set', key, v], {
          env: process.env,
          timeout: 60_000,
        });
      }
      await this.getResolvedPaths(true);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update config:', msg);
      return false;
    }
  }

  /**
   * 使用 Gateway 侧 systemPromptReport（sessions.usage + includeContextWeight），
   * 结合本地 workspace/skills 内容，离线重建一个与 openclaw 拼装结构尽量一致的 system prompt 正文。
   * 该接口不会读取 transcript，也不会调用会触发模型输出的"system 嗅探"链路。
   */
  async probeSystemPrompt(): Promise<SystemPromptProbeResult> {
    const empty: SystemPromptProbeResult = {
      ok: false,
      error: undefined,
      breakdown: [],
      workspaceFiles: [],
      workspaceFileContents: [],
      skillsDetail: [],
      toolsDetail: [],
      toolsSummary: { listChars: 0, schemaChars: 0, entryCount: 0 },
      systemPromptSource: 'none',
      systemPromptMarkdown: '',
      sections: {
        fromTranscript: false,
        coreText: '',
        projectContextText: '',
        toolsListText: '',
        skillBlocks: [],
      },
    };

    let chosen: { key: string; sessionId?: string; agentId?: string } | null = null;
    let report: Record<string, unknown> | null = null;
    let resolvedSkills: Array<{ name: string; filePath?: string; description?: string }> | undefined;
    let skillsPrompt: string | undefined;
    let skillsSnapshot: SystemPromptProbeResult['skillsSnapshot'];

    // 1. 优先从本地 sessions.json 读取（无需 Gateway、更快）
    const dir = await this.stateDir();
    if (dir) {
      const local = this.loadSystemPromptFromSessionsJson(dir);
      if (local) {
        chosen = local.chosen;
        report = local.report;
        resolvedSkills = local.resolvedSkills;
        skillsPrompt = local.skillsPrompt;
        if (local.skillsSnapshot) {
          skillsSnapshot = {
            prompt: local.skillsSnapshot.prompt,
            skills: local.skillsSnapshot.skills,
          };
        }
        this.logger.debug(`probeSystemPrompt: 使用本地 sessions.json (${chosen.key})`);
      }
    }

    // 2. 若无本地数据，回退到 Gateway RPC
    if (!report) {
      const cfg = this.configService.getConfig();
      const gw = cfg.openclawGatewayUrl?.trim();
      if (!gw) {
        return {
          ...empty,
          error:
            '未找到 systemPromptReport。请配置 OPENCLAW_STATE_DIR 以读取本地 sessions.json，或配置 openclawGatewayUrl 通过 Gateway 获取。至少成功运行过一次 Agent 后才有数据。',
        };
      }

      const end = new Date();
      const start = new Date(end.getTime() - 120 * 86400000);
      const dr = {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        mode: 'utc' as const,
      };

      type UsageSess = {
        key: string;
        sessionId?: string;
        agentId?: string;
        updatedAt?: number;
        contextWeight?: Record<string, unknown> | null;
      };

      const rpc = async (extra: Record<string, unknown>) =>
        this.gatewayConnection.request<{ sessions?: UsageSess[] }>(
          'sessions.usage',
          {
            ...dr,
            limit: 100,
            includeContextWeight: true,
            ...extra,
          },
          35_000,
        );

      const pickReportFromSessions = (sessions: UsageSess[] | undefined) => {
        if (!sessions?.length) return null;
        const withCw = sessions.filter((s) => s.contextWeight != null);
        if (!withCw.length) return null;
        return (
          withCw.find((s) => s.key === 'agent:main:main') ||
          [...withCw].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
        );
      };

      let usageChosen: UsageSess | null = null;
      const rMain = await rpc({ key: 'agent:main:main', limit: 8 });
      if (rMain.ok) {
        usageChosen = pickReportFromSessions(rMain.payload?.sessions) || null;
      }
      if (!usageChosen) {
        const r = await rpc({ limit: 100 });
        if (!r.ok) {
          return {
            ...empty,
            error: r.error || 'sessions.usage RPC 失败（请检查 Gateway 与 Token）',
          };
        }
        usageChosen = pickReportFromSessions(r.payload?.sessions) || null;
      }

      if (!usageChosen?.contextWeight) {
        return {
          ...empty,
          error:
            '未找到 systemPromptReport。请在本机至少成功运行过一次 Agent（生成会话后 Gateway 会写入 store），并确保 Gateway 版本支持 sessions.usage.includeContextWeight。',
        };
      }

      chosen = { key: usageChosen.key, sessionId: usageChosen.sessionId, agentId: usageChosen.agentId };
      report = usageChosen.contextWeight as Record<string, unknown>;
    }

    if (!report || !chosen) {
      return { ...empty, error: '未找到 systemPromptReport' };
    }
    const breakdown = buildBreakdownFromReport(report);
    const workspaceFiles = (Array.isArray(report.injectedWorkspaceFiles)
      ? report.injectedWorkspaceFiles
      : []) as SystemPromptProbeResult['workspaceFiles'];
    const skills = (report.skills as { entries?: Array<{ name: string; blockChars: number }> }) || {};
    const skillsDetail = Array.isArray(skills.entries) ? skills.entries : [];
    const tools = (report.tools as { listChars?: number; schemaChars?: number; entries?: unknown[] }) || {};
    const toolsDetail = Array.isArray(tools.entries)
      ? (tools.entries as Array<{
          name?: string;
          summaryChars?: number;
          schemaChars?: number;
          propertiesCount?: number | null;
        }>)
          .map((t) => ({
            name: String(t.name || '-'),
            summaryChars: Number(t.summaryChars) || 0,
            schemaChars: Number(t.schemaChars) || 0,
            propertiesCount: typeof t.propertiesCount === 'number' ? t.propertiesCount : t.propertiesCount ?? null,
          }))
          .sort((a, b) => a.schemaChars + a.summaryChars - (b.schemaChars + b.summaryChars))
          .reverse()
      : [];
    const toolsSummary = {
      listChars: Number(tools.listChars) || 0,
      schemaChars: Number(tools.schemaChars) || 0,
      entryCount: Array.isArray(tools.entries) ? tools.entries.length : 0,
    };

    const workspaceDirStr = report.workspaceDir ? String(report.workspaceDir) : '';
    const workspaceFileContents = workspaceDirStr
      ? this.readWorkspaceInjectedContents(workspaceDirStr, workspaceFiles)
      : [];

    // 仅离线重建：不读取 transcript、不调用工具目录，以避免任何"真实请求链路"。
    let systemPromptMarkdown = '';
    let systemPromptSource: SystemPromptProbeResult['systemPromptSource'] = 'none';
    if (workspaceDirStr) {
      try {
        systemPromptMarkdown = await rebuildSystemPromptMarkdown({
          workspaceDir: workspaceDirStr,
          workspaceFileContents,
          skills: skillsDetail,
          skillPaths: resolvedSkills?.reduce(
            (acc, r) => (r.filePath ? { ...acc, [r.name]: r.filePath } : acc),
            {} as Record<string, string>,
          ),
          /** 优先使用 sessions.json 的 skillsSnapshot.prompt（name+description+location，非全文） */
          skillsPromptOverride: skillsPrompt,
          resolvedSkills,
          tools: toolsDetail.map((t) => t.name),
          provider: report.provider ? String(report.provider) : undefined,
          model: report.model ? String(report.model) : undefined,
          agentId: chosen.agentId,
        });
        if (systemPromptMarkdown.trim().length > 0) {
          systemPromptSource = 'rebuild';
        }
      } catch {
        // keep empty
      }
    }

    const sections = parseSystemPromptSections(systemPromptMarkdown, false);

    return {
      ok: true,
      sessionKey: chosen.key,
      sessionId: chosen.sessionId,
      agentId: chosen.agentId,
      reportSource: String(report.source || ''),
      reportGeneratedAt: report.generatedAt ? Number(report.generatedAt) : undefined,
      model: report.model ? String(report.model) : undefined,
      provider: report.provider ? String(report.provider) : undefined,
      workspaceDir: workspaceDirStr || undefined,
      breakdown,
      workspaceFiles,
      workspaceFileContents,
      skillsDetail,
      toolsDetail,
      toolsSummary,
      systemPromptMarkdown,
      systemPromptSource,
      sections,
      skillsSnapshot,
    };
  }
}
