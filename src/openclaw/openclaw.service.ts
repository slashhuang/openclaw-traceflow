import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  resolveOpenClawPaths,
  type OpenClawResolvedPaths,
} from './openclaw-paths.resolver';
import { fetchRuntimePathsFromGateway } from './gateway-ws-paths';
import {
  callGatewayRpc,
  fetchStatusOverview,
  type StatusOverviewResult,
} from './gateway-rpc';
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
    /** sessions.json 里 totalTokensFresh（若该字段存在） */
    totalTokensFresh?: boolean;
    /** 会话日志相对状态根目录的路径（agents/&lt;agent&gt;/sessions/&lt;id&gt;.jsonl） */
    transcriptPath?: string;
    /** 与服务当前解析一致的 OpenClaw 状态根目录绝对路径（便于本地打开核对） */
    stateRootAbsolute?: string;
    /** 本会话 .jsonl 日志文件的绝对路径 */
    sessionLogAbsolutePath?: string;
    /** 同 agent 下 sessions.json 相对状态根路径（agents/&lt;agent&gt;/sessions/sessions.json） */
    sessionsIndexRelativePath?: string;
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
  }>;
  /** 基于 read path 反推的 skill 调用（path 含 skills/xxx/SKILL.md） */
  invokedSkills?: InvokedSkill[];
  events: Array<{
    type: string;
    timestamp: number;
    payload: any;
  }>;
}

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
  /** Promise 级别缓存（防并发重复） */
  private pendingRefresh: Promise<void> | null = null;

  constructor(private configService: ConfigService) {
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
    const result = await fetchRuntimePathsFromGateway({
      gatewayHttpUrl: gatewayUrl,
      token: token || undefined,
      password: password || undefined,
      timeoutMs: 5000,
    });

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
    const result = await fetchStatusOverview({
      gatewayHttpUrl: gatewayUrl,
      token: cfg.openclawGatewayToken || undefined,
      password: cfg.openclawGatewayPassword || undefined,
      timeoutMs: 8000,
    });
    if (result.ok) {
      return result.payload;
    }
    this.logger.debug(`Status overview failed: ${result.error}`);
    return null;
  }

  /**
   * 获取 Gateway 健康状态
   */
  async getHealth(): Promise<OpenClawHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
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
   * 从 sessions.json 读取 session 的 totalTokens/model/contextTokens，以及 store 中的 key（用于类型推断）
   */
  /**
   * 从 sessions.json 读取 session 的 totalTokens/model/contextTokens。
   * 同一 sessionId 可能对应多个 sessionKey（如 cron 的 run 子 session），
   * 取 totalTokens 最大（或 updatedAt 最新）的 entry，保证 token 数据与直接读 sessions.json 一致。
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
      let best: { key: string; entry: any } | null = null;
      for (const [key, entry] of Object.entries(store)) {
        if (entry?.sessionId !== sessionId) continue;
        const total = typeof entry?.totalTokens === 'number' ? entry.totalTokens : 0;
        const bestTotal = best ? (typeof best.entry?.totalTokens === 'number' ? best.entry.totalTokens : 0) : 0;
        if (!best || total > bestTotal || (total === bestTotal && (entry?.updatedAt ?? 0) > (best.entry?.updatedAt ?? 0))) {
          best = { key, entry };
        }
      }
      if (best) return toEntry(best.key, best.entry);
      if (store[sessionId]) return toEntry(sessionId, store[sessionId]);
      const altKey = `${agent}/${sessionId}`;
      if (store[altKey]) return toEntry(altKey, store[altKey]);
    } catch {
      /* ignore */
    }
    return null;
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
      // 移除 fileMeta 字段（内部使用，不暴露给前端）
      const { fileMeta, ...session } = data;
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

  /**
   * 获取会话详情（从文件系统读取）
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

      const content = fs.readFileSync(sessionFile.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return null;
      }

      const messages: OpenClawSessionDetail['messages'] = [];
      const toolCalls: OpenClawSessionDetail['toolCalls'] = [];
      const events: OpenClawSessionDetail['events'] = [];
      /** toolCallId -> index in toolCalls，用于关联 toolResult */
      const toolCallIdToIndex = new Map<string, number>();

      let firstUserData: any = null;
      let tokenUsage: any = null;
      let usageCost: any = null;
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
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  output,
                  durationMs,
                  success: !isError,
                  error: isError ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
                };
              } else {
                toolCalls.push({
                  name: toolName || 'unknown',
                  input: {},
                  output,
                  durationMs,
                  success: !isError,
                  error: isError ? (typeof output === 'string' ? output : undefined) : undefined,
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
          if (entry.toolUse && !toolCalls.some(tc => tc.name === entry.toolUse.name)) {
            toolCalls.push({
              name: entry.toolUse.name,
              input: entry.toolUse.input || {},
              output: entry.toolUse.output || {},
              durationMs: entry.toolUse.durationMs || 0,
              success: entry.toolUse.success !== false,
              error: entry.toolUse.error,
            });
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

      const stats = fs.statSync(sessionFile.filePath);
      const agent = sessionFile.sessionId.split('/')[0];
      const dir = await this.stateDir();
      const storeEntry = dir ? this.loadStoreEntryForSession(dir, agent, sessionId) : null;
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
      };

      const base = { ...tokenUsage };
      if (storeEntry) {
        // transcript 有数据时优先用 transcript（多轮会话更准确），store 仅补 limit
        const fromTranscript = (base.input ?? 0) + (base.output ?? 0) > 0 || (base.total ?? 0) > 0;
        if (!fromTranscript) {
          if (storeEntry.totalTokens != null) base.total = storeEntry.totalTokens;
          if (storeEntry.inputTokens != null) base.input = storeEntry.inputTokens;
          if (storeEntry.outputTokens != null) base.output = storeEntry.outputTokens;
        }
        if (storeEntry.contextTokens != null) base.limit = storeEntry.contextTokens;
        if (base.total != null && (base.limit ?? tokenUsage?.limit)) {
          base.utilization = Math.round((base.total / (base.limit ?? tokenUsage?.limit ?? 1)) * 100);
        }
      }
      const mergedTokenUsage = base;
      const sessionKey = storeEntry?.storeKey ?? sessionFile.sessionId;
      const invokedSkills = inferInvokedSkillsFromToolCalls(toolCalls);
      const userId = firstUserData?.user || 'unknown';
      // 若 store 无 systemSent 且 userId 仍 unknown，从 transcript 推断 greeting
      let systemSent = storeEntry?.systemSent;
      if (systemSent === undefined && userId === 'unknown' && lines.length > 1) {
        systemSent = inferSystemSentFromTranscript(lines);
      }

      return {
        sessionKey,
        sessionId: sessionFile.sessionId,
        userId,
        systemSent,
        status: this.inferSessionStatus(firstUserData, stats.mtimeMs),
        createdAt: stats.birthtimeMs,
        lastActiveAt: stats.mtimeMs,
        totalTokens: storeEntry?.totalTokens,
        contextTokens: storeEntry?.contextTokens,
        model: storeEntry?.model,
        tokenUsage: mergedTokenUsage,
        usageCost: usageCost ?? undefined,
        tokenUsageMeta,
        messages,
        toolCalls,
        invokedSkills,
        events,
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

    const agentDirs = fs.readdirSync(agentsDir);
    for (const agent of agentDirs) {
      const sessionsDir = path.join(agentsDir, agent, 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        continue;
      }

      const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          sessionId: `${agent}/${sessionId}`,
          filePath,
          createdAt: stats.birthtimeMs,
          updatedAt: stats.mtimeMs,
        };
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

      fs.unlinkSync(sessionFile.filePath);
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

      const content = fs.readFileSync(logPath, 'utf-8');
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
        callGatewayRpc<{ sessions?: UsageSess[] }>({
          gatewayHttpUrl: gw,
          token: cfg.openclawGatewayToken,
          password: cfg.openclawGatewayPassword,
          method: 'sessions.usage',
          methodParams: {
            ...dr,
            limit: 100,
            includeContextWeight: true,
            ...extra,
          },
          timeoutMs: 35000,
        });

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
