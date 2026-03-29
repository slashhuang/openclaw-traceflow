/**
 * 会话存储抽象层
 *
 * 设计目标：
 * 1. 统一的存储接口，支持多种后端实现（FileSystem、SQLite 等）
 * 2. KV 数据结构，支持快速查找
 * 3. 为未来 SQLite 扩展预留接口
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import type { OpenClawSession } from '../openclaw/openclaw.service';
import {
  formatParticipantSummary,
  isPlaceholderParticipantId,
} from '../common/participant-summary';
import { extractSenderFromMessageEntry } from '../common/extract-sender-from-message';
import { isIndexTotalTokensUsableForContext } from '../common/session-token-context';
import {
  LIST_SESSION_JSONL_MAX_SCAN_LINES,
  readJsonlHeadTail,
  scanJsonlForMetadata,
} from '../openclaw/streaming-jsonl-reader';

/** 参与者扫描逻辑升级时递增，使内存缓存命中后仍会重扫 transcript */
const TRANSCRIPT_PARTICIPANT_SCAN_VERSION = 6;

/**
 * 会话数据接口（KV 存储的 value）
 */
export interface SessionData extends OpenClawSession {
  /** 文件元数据（用于增量扫描） */
  fileMeta?: {
    size: number;
    mtimeMs: number;
    transcriptPath: string;
    sessionLogAbsolutePath: string;
    sessionsIndexRelativePath: string;
  };
}

/**
 * 存储抽象接口
 */
export interface SessionStorage {
  /**
   * 获取单个会话
   */
  get(sessionKey: string): Promise<SessionData | null>;

  /**
   * 获取所有会话（返回 KV Map）
   */
  getAll(): Promise<Map<string, SessionData>>;

  /**
   * 批量获取会话（按 sessionKey 列表）
   */
  getBatch(sessionKeys: string[]): Promise<Map<string, SessionData>>;

  /**
   * 存储/更新会话
   */
  upsert(sessionKey: string, data: SessionData): Promise<void>;

  /**
   * 批量存储/更新会话
   */
  upsertBatch(entries: Map<string, SessionData>): Promise<void>;

  /**
   * 删除会话
   */
  delete(sessionKey: string): Promise<void>;

  /**
   * 清空所有会话
   */
  clear(): Promise<void>;

  /**
   * 获取缓存时间戳（用于判断是否需要刷新）
   */
  getCacheTimestamp(): number;

  /**
   * 设置缓存时间戳
   */
  setCacheTimestamp(timestamp: number): void;
}

/**
 * 文件系统存储实现（当前默认实现）
 *
 * 特点：
 * - 内存 KV 缓存 + 定时持久化
 * - 增量扫描（只读取新增/变更的文件）
 * - 支持 1000+ 会话文件场景
 */
export class FileSystemSessionStorage implements SessionStorage {
  private readonly logger = new Logger(FileSystemSessionStorage.name);

  /** 内存 KV 缓存 */
  private cache: Map<string, SessionData> = new Map();

  /** 缓存时间戳 */
  private cacheTimestamp: number = 0;

  /** 文件元数据缓存（用于增量扫描） */
  private fileMetaCache: Map<string, { size: number; mtimeMs: number }> =
    new Map();

  /** OpenClaw state 目录 */
  private stateDir: string | null = null;

  constructor(stateDir?: string) {
    this.stateDir = stateDir || null;
  }

  /**
   * 设置 state 目录
   */
  setStateDir(dir: string): void {
    this.stateDir = dir;
    this.logger.debug(`FileSystemSessionStorage: stateDir=${dir}`);
  }

  /**
   * 从文件系统加载会话（增量扫描）
   */
  async loadFromFileSystem(): Promise<Map<string, SessionData>> {
    if (!this.stateDir) {
      this.logger.warn('State directory not configured');
      return new Map();
    }

    const newCache = new Map<string, SessionData>();
    const agentsDir = path.join(this.stateDir, 'agents');

    if (!fs.existsSync(agentsDir)) {
      return newCache;
    }

    try {
      const agentDirs = await fs.promises.readdir(agentsDir);

      for (const agent of agentDirs) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessionsDir)) {
          continue;
        }

        // 读取 sessions.json 获取会话元数据（轻量级）
        const sessionsMeta = await this.readSessionsMeta(this.stateDir, agent);

        // 扫描 JSONL 文件
        const files = await fs.promises.readdir(sessionsDir);

        for (const file of files) {
          if (!file.endsWith('.jsonl') || file.includes('.reset.')) {
            continue;
          }

          const sessionId = file.replace('.jsonl', '');
          const filePath = path.join(sessionsDir, file);
          const stats = await fs.promises.stat(filePath);
          const sessionKey =
            sessionsMeta.get(sessionId)?.storeKey ?? `${agent}/${sessionId}`;

          // 增量扫描：只读取新增/变更的文件（或缓存缺 messageCount / 文件大小时重扫）
          const cachedMeta = this.fileMetaCache.get(filePath);
          const cachedSession = this.cache.get(sessionKey);
          if (
            cachedMeta &&
            cachedMeta.size === stats.size &&
            cachedMeta.mtimeMs === stats.mtimeMs &&
            cachedSession &&
            cachedSession.messageCount != null &&
            cachedSession.transcriptFileSizeBytes != null &&
            cachedSession.transcriptParticipantScanVersion ===
              TRANSCRIPT_PARTICIPANT_SCAN_VERSION
          ) {
            newCache.set(sessionKey, cachedSession);
            continue;
          }

          // 文件已变更或新增，重新读取
          const sessionData = await this.readSessionFile(
            filePath,
            sessionId,
            agent,
            sessionsMeta.get(sessionId),
            stats,
          );

          if (sessionData) {
            newCache.set(sessionKey, sessionData);
            // 更新文件元数据缓存
            this.fileMetaCache.set(filePath, {
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            });
          }
        }
      }

      this.cache = newCache;
      this.cacheTimestamp = Date.now();
      this.logger.debug(
        `FileSystemSessionStorage: loaded ${newCache.size} sessions`,
      );

      return newCache;
    } catch (error) {
      this.logger.error('Failed to load sessions from filesystem:', error);
      return new Map();
    }
  }

  /**
   * 从 sessions.json 读取会话元数据
   */
  private async readSessionsMeta(
    stateDir: string,
    agent: string,
  ): Promise<
    Map<
      string,
      {
        storeKey?: string;
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        contextTokens?: number;
        model?: string;
        systemSent?: boolean;
        totalTokensFresh?: boolean;
      }
    >
  > {
    const storePath = path.join(
      stateDir,
      'agents',
      agent,
      'sessions',
      'sessions.json',
    );
    const metaMap = new Map<
      string,
      {
        storeKey?: string;
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        contextTokens?: number;
        model?: string;
        systemSent?: boolean;
        totalTokensFresh?: boolean;
      }
    >();

    if (!fs.existsSync(storePath)) {
      return metaMap;
    }

    try {
      const raw = await fs.promises.readFile(storePath, 'utf-8');
      const store = JSON.parse(raw) as Record<string, any>;

      for (const [key, entry] of Object.entries(store)) {
        if (!entry?.sessionId) continue;

        metaMap.set(entry.sessionId, {
          storeKey: key,
          totalTokens:
            typeof entry.totalTokens === 'number'
              ? entry.totalTokens
              : undefined,
          inputTokens:
            typeof entry.inputTokens === 'number'
              ? entry.inputTokens
              : undefined,
          outputTokens:
            typeof entry.outputTokens === 'number'
              ? entry.outputTokens
              : undefined,
          contextTokens:
            typeof entry.contextTokens === 'number'
              ? entry.contextTokens
              : undefined,
          model: typeof entry.model === 'string' ? entry.model : undefined,
          systemSent:
            typeof entry.systemSent === 'boolean'
              ? entry.systemSent
              : undefined,
          totalTokensFresh:
            typeof entry.totalTokensFresh === 'boolean'
              ? entry.totalTokensFresh
              : undefined,
        });
      }

      return metaMap;
    } catch {
      return metaMap;
    }
  }

  /**
   * 读取单个会话文件
   *
   * 性能优化：
   * - 列表页模式：只读首行获取 userId，messageCount 等从 sessions.json 元数据获取
   * - 详情页模式：使用流式首尾分片读取
   */
  private async readSessionFile(
    filePath: string,
    sessionId: string,
    agent: string,
    meta?: {
      storeKey?: string;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      contextTokens?: number;
      model?: string;
      systemSent?: boolean;
      totalTokensFresh?: boolean;
    },
    stats?: fs.Stats,
  ): Promise<SessionData | null> {
    try {
      // 列表页优化：优先使用 sessions.json 元数据，避免扫描 JSONL
      const indexTotal = meta?.totalTokens;
      const indexTotalUsable = isIndexTotalTokensUsableForContext(
        indexTotal,
        meta?.totalTokensFresh,
      );

      // 流式读取首行获取 userId 和基本信息
      let userId: string = 'unknown';
      let sessionData: Record<string, unknown> | null = null;
      let messageCount: number | undefined;
      let distinctSenders: string[] = [];
      let scanResult:
        | Awaited<ReturnType<typeof scanJsonlForMetadata>>
        | undefined;

      try {
        // 只读首行获取 userId
        const fd = await fs.promises.open(filePath, 'r');
        try {
          const headBuffer = Buffer.alloc(8192);
          await fd.read(headBuffer, 0, 8192, 0);
          const firstLine = headBuffer.toString('utf-8').split('\n')[0];
          if (firstLine) {
            try {
              sessionData = JSON.parse(firstLine) as Record<string, unknown>;
              // userId 可能需要在后续从 message 中提取
            } catch {
              /* ignore */
            }
          }
        } finally {
          await fd.close();
        }

        // 如果 sessions.json 有 messageCount，直接用（避免扫描）
        // 否则使用流式扫描获取（最多扫 1000 行）
        if (stats) {
          scanResult = await scanJsonlForMetadata(
            filePath,
            LIST_SESSION_JSONL_MAX_SCAN_LINES,
          );
          if (scanResult.userId) {
            userId = scanResult.userId;
          }
          messageCount = scanResult.messageCount;
          distinctSenders = scanResult.distinctSenders;
        }
      } catch (error) {
        this.logger.debug(
          `Failed to stream read ${filePath}: ${error.message}`,
        );
        // 降级：全量读取（仅小文件）
        if (stats && stats.size < 1024 * 1024) {
          const allLines = (await fs.promises.readFile(filePath, 'utf-8'))
            .split('\n')
            .filter((l) => l.trim());
          if (allLines.length > 0) {
            try {
              sessionData = JSON.parse(allLines[0]) as Record<string, unknown>;
            } catch {
              /* ignore */
            }
          }
          // 简化扫描
          const senderSet = new Set<string>();
          for (const line of allLines.slice(0, 100)) {
            try {
              const entry = JSON.parse(line);
              const sender = extractSenderFromMessageEntry(entry);
              if (sender && !senderSet.has(sender)) {
                senderSet.add(sender);
              }
            } catch {
              /* ignore */
            }
          }
          distinctSenders = Array.from(senderSet);
          messageCount = allLines.filter((l) => l.includes('"message"')).length;
        }
      }

      const participantSummary = formatParticipantSummary(distinctSenders);

      const humanSenders = distinctSenders.filter(
        (t) => !isPlaceholderParticipantId(t),
      );
      if (humanSenders.length >= 1 && isPlaceholderParticipantId(userId)) {
        userId = humanSenders[0];
      }

      // 解析 token usage（列表口径：首行 tokenUsage + sessions.json 元数据）
      const parsedFromTranscript = this.parseTokenUsage(
        sessionData?.tokenUsage,
      );
      const contextTokens = meta?.contextTokens;
      const model = meta?.model;

      const limit = contextTokens ?? parsedFromTranscript?.limit;
      const input = meta?.inputTokens ?? parsedFromTranscript?.input ?? 0;
      const output = meta?.outputTokens ?? parsedFromTranscript?.output ?? 0;

      const firstLineHasTotals =
        !!parsedFromTranscript &&
        ((parsedFromTranscript.input ?? 0) +
          (parsedFromTranscript.output ?? 0) >
          0 ||
          (typeof parsedFromTranscript.total === 'number' &&
            parsedFromTranscript.total > 0));

      let resolvedTotal: number | undefined;
      let contextUtilizationReliable = false;

      if (firstLineHasTotals) {
        resolvedTotal =
          parsedFromTranscript.total ??
          (parsedFromTranscript.input ?? 0) +
            (parsedFromTranscript.output ?? 0);
        contextUtilizationReliable = typeof limit === 'number' && limit > 0;
      } else if (indexTotalUsable && typeof indexTotal === 'number') {
        resolvedTotal = indexTotal;
        contextUtilizationReliable = typeof limit === 'number' && limit > 0;
      } else {
        const sumIo = input + output;
        if (sumIo > 0) {
          resolvedTotal = sumIo;
          contextUtilizationReliable = false;
        } else {
          resolvedTotal = undefined;
          contextUtilizationReliable = false;
        }
      }

      const tokenUsage =
        typeof limit === 'number' &&
        limit > 0 &&
        typeof resolvedTotal === 'number'
          ? {
              input,
              output,
              total: resolvedTotal,
              limit,
              utilization: contextUtilizationReliable
                ? Math.round((resolvedTotal / limit) * 100)
                : undefined,
              contextUtilizationReliable,
            }
          : parsedFromTranscript
            ? {
                ...parsedFromTranscript,
                input,
                output,
                total:
                  resolvedTotal ?? parsedFromTranscript.total ?? input + output,
                limit: limit ?? parsedFromTranscript.limit,
                contextUtilizationReliable,
              }
            : {
                input,
                output,
                total: resolvedTotal ?? 0,
                limit,
                contextUtilizationReliable,
              };

      const totalTokens =
        indexTotalUsable && typeof indexTotal === 'number'
          ? indexTotal
          : typeof resolvedTotal === 'number'
            ? resolvedTotal
            : undefined;

      // 扫描 usage.cost（流式扫描结果中已包含）
      const usageCost = scanResult?.usageCost || undefined;

      // 推断 systemSent（流式扫描无法获取，设为 undefined）
      const systemSent = meta?.systemSent;

      const sessionKey = meta?.storeKey ?? `${agent}/${sessionId}`;
      const actualStats = stats || (await fs.promises.stat(filePath));

      // transcriptUsageObserved 从 scanResult 获取
      const transcriptUsageObserved = scanResult?.totalTokens != null;

      const storeTokenFieldsPresent =
        typeof meta?.totalTokens === 'number' ||
        typeof meta?.inputTokens === 'number' ||
        typeof meta?.outputTokens === 'number';

      let tokenUsageSource: NonNullable<
        OpenClawSession['tokenUsageMeta']
      >['source'] = 'unknown';
      if (firstLineHasTotals && storeTokenFieldsPresent) {
        tokenUsageSource = 'mixed';
      } else if (firstLineHasTotals) {
        tokenUsageSource = 'transcript';
      } else if (storeTokenFieldsPresent) {
        tokenUsageSource = 'sessions.json';
      }

      const transcriptPathForMeta =
        this.stateDir && filePath.startsWith(this.stateDir)
          ? filePath.slice(this.stateDir.length + 1).replace(/\\/g, '/')
          : filePath;

      const tokenUsageMeta: OpenClawSession['tokenUsageMeta'] = {
        source: tokenUsageSource,
        transcriptUsageObserved,
        storeTokenFieldsPresent,
        totalTokensFresh: meta?.totalTokensFresh,
        transcriptPath: transcriptPathForMeta,
        stateRootAbsolute: this.stateDir || undefined,
        sessionLogAbsolutePath: filePath,
        sessionsIndexRelativePath:
          this.stateDir && agent
            ? path
                .join('agents', agent, 'sessions', 'sessions.json')
                .replace(/\\/g, '/')
            : undefined,
        sessionLogFileSizeBytes: actualStats.size,
      };

      return {
        sessionKey,
        sessionId,
        userId,
        systemSent,
        status: this.inferSessionStatus(sessionData, actualStats.mtimeMs),
        createdAt: actualStats.birthtimeMs,
        lastActiveAt: actualStats.mtimeMs,
        totalTokens,
        contextTokens,
        model,
        tokenUsage,
        usageCost,
        messageCount,
        ...(scanResult?.messageCountCapped
          ? {
              messageCountCapped: true,
              messageCountScanMaxLines: LIST_SESSION_JSONL_MAX_SCAN_LINES,
            }
          : {}),
        transcriptFileSizeBytes: actualStats.size,
        tokenUsageMeta,
        transcriptParticipantScanVersion: TRANSCRIPT_PARTICIPANT_SCAN_VERSION,
        ...(humanSenders.length > 0 ? { participantIds: humanSenders } : {}),
        ...(participantSummary ? { participantSummary } : {}),
        fileMeta: {
          size: actualStats.size,
          mtimeMs: actualStats.mtimeMs,
          transcriptPath:
            this.stateDir && filePath.startsWith(this.stateDir)
              ? filePath.slice(this.stateDir.length + 1)
              : filePath,
          sessionLogAbsolutePath: filePath,
          sessionsIndexRelativePath:
            this.stateDir && agent
              ? path
                  .join('agents', agent, 'sessions', 'sessions.json')
                  .replace(/\\/g, '/')
              : '',
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read session file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 解析 token usage
   */
  private parseTokenUsage(val: unknown):
    | {
        input: number;
        output: number;
        total: number;
        limit?: number;
        utilization?: number;
      }
    | undefined {
    if (!val || typeof val !== 'object') return undefined;
    const o = val as Record<string, unknown>;
    if (
      typeof o.input !== 'number' ||
      typeof o.output !== 'number' ||
      typeof o.total !== 'number'
    )
      return undefined;
    return {
      input: o.input,
      output: o.output,
      total: o.total,
      limit: typeof o.limit === 'number' ? o.limit : undefined,
      utilization:
        typeof o.utilization === 'number' ? o.utilization : undefined,
    };
  }

  /**
   * 推断会话状态
   */
  private inferSessionStatus(
    lastMessage: any,
    mtimeMs: number,
  ): 'active' | 'idle' | 'completed' | 'failed' {
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
   * 从 transcript 推断是否为 greeting 会话
   */
  private inferSystemSentFromTranscript(lines: string[]): boolean {
    const GREETING_PATTERNS = [
      /你好 | 有什么可以帮 | 有什么需要 | 需要我帮忙 | 需要帮助/,
      /hello|how can I help|what can I do for you|need help/i,
    ];

    for (let i = 1; i < Math.min(lines.length, 20); i++) {
      try {
        const entry = JSON.parse(lines[i]) as {
          type?: string;
          message?: { role?: string; content?: unknown };
        };
        if (entry?.type !== 'message' || entry?.message?.role !== 'assistant')
          continue;

        const content = entry.message?.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          for (const item of content as Array<{
            type?: string;
            text?: string;
          }>) {
            if (item?.type === 'text' && typeof item.text === 'string')
              text += item.text;
          }
        }

        if (text.trim().length < 5) continue;
        return GREETING_PATTERNS.some((re) => re.test(text));
      } catch {
        /* ignore */
      }
    }

    return false;
  }

  // ============ SessionStorage 接口实现 ============

  async get(sessionKey: string): Promise<SessionData | null> {
    return this.cache.get(sessionKey) || null;
  }

  async getAll(): Promise<Map<string, SessionData>> {
    return new Map(this.cache);
  }

  async getBatch(sessionKeys: string[]): Promise<Map<string, SessionData>> {
    const result = new Map<string, SessionData>();
    for (const key of sessionKeys) {
      const data = this.cache.get(key);
      if (data) {
        result.set(key, data);
      }
    }
    return result;
  }

  async upsert(sessionKey: string, data: SessionData): Promise<void> {
    this.cache.set(sessionKey, data);
    this.cacheTimestamp = Date.now();
  }

  async upsertBatch(entries: Map<string, SessionData>): Promise<void> {
    for (const [key, value] of entries) {
      this.cache.set(key, value);
    }
    this.cacheTimestamp = Date.now();
  }

  async delete(sessionKey: string): Promise<void> {
    this.cache.delete(sessionKey);
    this.fileMetaCache.forEach((_, filePath) => {
      if (filePath.includes(sessionKey)) {
        this.fileMetaCache.delete(filePath);
      }
    });
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.fileMetaCache.clear();
    this.cacheTimestamp = 0;
  }

  getCacheTimestamp(): number {
    return this.cacheTimestamp;
  }

  setCacheTimestamp(timestamp: number): void {
    this.cacheTimestamp = timestamp;
  }
}
