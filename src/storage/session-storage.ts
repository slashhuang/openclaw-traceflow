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

/**
 * 会话数据接口（KV 存储的 value）
 */
export interface SessionData extends Omit<OpenClawSession, 'tokenUsageMeta'> {
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
  private fileMetaCache: Map<string, { size: number; mtimeMs: number }> = new Map();
  
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
          const sessionKey = sessionsMeta.get(sessionId)?.storeKey ?? `${agent}/${sessionId}`;

          // 增量扫描：只读取新增/变更的文件
          const cachedMeta = this.fileMetaCache.get(filePath);
          if (cachedMeta && 
              cachedMeta.size === stats.size && 
              cachedMeta.mtimeMs === stats.mtimeMs &&
              this.cache.has(sessionKey)) {
            // 文件未变更，复用缓存
            const cached = this.cache.get(sessionKey)!;
            newCache.set(sessionKey, cached);
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
      this.logger.debug(`FileSystemSessionStorage: loaded ${newCache.size} sessions`);
      
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
  ): Promise<Map<string, {
    storeKey?: string;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    contextTokens?: number;
    model?: string;
    systemSent?: boolean;
    totalTokensFresh?: boolean;
  }>> {
    const storePath = path.join(stateDir, 'agents', agent, 'sessions', 'sessions.json');
    const metaMap = new Map<string, {
      storeKey?: string;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      contextTokens?: number;
      model?: string;
      systemSent?: boolean;
      totalTokensFresh?: boolean;
    }>();

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
          totalTokens: typeof entry.totalTokens === 'number' ? entry.totalTokens : undefined,
          inputTokens: typeof entry.inputTokens === 'number' ? entry.inputTokens : undefined,
          outputTokens: typeof entry.outputTokens === 'number' ? entry.outputTokens : undefined,
          contextTokens: typeof entry.contextTokens === 'number' ? entry.contextTokens : undefined,
          model: typeof entry.model === 'string' ? entry.model : undefined,
          systemSent: typeof entry.systemSent === 'boolean' ? entry.systemSent : undefined,
          totalTokensFresh: typeof entry.totalTokensFresh === 'boolean' ? entry.totalTokensFresh : undefined,
        });
      }

      return metaMap;
    } catch {
      return metaMap;
    }
  }

  /**
   * 读取单个会话文件
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
      const allLines = (await fs.promises.readFile(filePath, 'utf-8')).split('\n').filter((l) => l.trim());
      
      let userId: string = 'unknown';
      let sessionData: Record<string, unknown> | null = null;
      
      // 读取首行获取 user
      const firstLine = allLines[0];
      if (firstLine) {
        try {
          sessionData = JSON.parse(firstLine) as Record<string, unknown>;
          userId = (sessionData?.user as string)?.trim() || 'unknown';
        } catch {
          /* ignore */
        }
      }

      // 若首行无 user，从前几条消息中提取 sender
      if (userId === 'unknown' && allLines.length > 1) {
        for (let i = 1; i < Math.min(allLines.length, 15); i++) {
          try {
            const entry = JSON.parse(allLines[i]);
            const sender = this.extractSenderFromMessageEntry(entry);
            if (sender) {
              userId = sender;
              break;
            }
          } catch {
            /* ignore */
          }
        }
      }

      // 解析 token usage
      const parsedFromTranscript = this.parseTokenUsage(sessionData?.tokenUsage);
      const totalTokens = meta?.totalTokens;
      const contextTokens = meta?.contextTokens;
      const model = meta?.model;
      
      const limit = contextTokens ?? parsedFromTranscript?.limit;
      const input = meta?.inputTokens ?? parsedFromTranscript?.input ?? 0;
      const output = meta?.outputTokens ?? parsedFromTranscript?.output ?? 0;
      
      const tokenUsage = totalTokens != null && limit != null
        ? {
            input,
            output,
            total: totalTokens,
            limit,
            utilization: Math.round((totalTokens / limit) * 100),
          }
        : parsedFromTranscript
          ? { ...parsedFromTranscript, input, output }
          : { input, output, total: totalTokens ?? 0, limit };

      // 扫描 usage.cost
      let hasCostField = false;
      let sumCostInput = 0;
      let sumCostOutput = 0;
      let sumCostCacheRead = 0;
      let sumCostCacheWrite = 0;
      let sumCostTotal = 0;

      for (const line of allLines) {
        if (!line.includes('"cost"')) continue;
        try {
          const entry = JSON.parse(line) as any;
          const usage = entry?.message?.usage ?? entry?.tokenUsage;
          if (!usage || typeof usage.totalTokens !== 'number') continue;
          const cost = usage?.cost;
          if (cost && typeof cost === 'object' && typeof cost.total === 'number') {
            hasCostField = true;
            sumCostInput += typeof cost.input === 'number' ? cost.input : 0;
            sumCostOutput += typeof cost.output === 'number' ? cost.output : 0;
            sumCostCacheRead += typeof cost.cacheRead === 'number' ? cost.cacheRead : 0;
            sumCostCacheWrite += typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0;
            sumCostTotal += cost.total;
          }
        } catch {
          /* ignore */
        }
      }

      const usageCost = hasCostField
        ? {
            input: sumCostInput,
            output: sumCostOutput,
            cacheRead: sumCostCacheRead,
            cacheWrite: sumCostCacheWrite,
            total: sumCostTotal,
          }
        : undefined;

      // 推断 systemSent
      let systemSent = meta?.systemSent;
      if (systemSent === undefined && userId === 'unknown' && allLines.length > 1) {
        systemSent = this.inferSystemSentFromTranscript(allLines);
      }

      const sessionKey = meta?.storeKey ?? `${agent}/${sessionId}`;
      const actualStats = stats || await fs.promises.stat(filePath);

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
        fileMeta: {
          size: actualStats.size,
          mtimeMs: actualStats.mtimeMs,
          transcriptPath: this.stateDir && filePath.startsWith(this.stateDir)
            ? filePath.slice(this.stateDir.length + 1)
            : filePath,
          sessionLogAbsolutePath: filePath,
          sessionsIndexRelativePath: this.stateDir && agent
            ? path.join('agents', agent, 'sessions', 'sessions.json').replace(/\\/g, '/')
            : '',
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read session file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 从消息条目中提取 sender
   */
  private extractSenderFromMessageEntry(entry: any): string | null {
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
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === 'text' && typeof item.text === 'string') {
          text += item.text;
        }
      }
    }
    
    return this.extractSenderFromMessageContent(text) || null;
  }

  /**
   * 从消息内容中提取 sender
   */
  private extractSenderFromMessageContent(text: string): string | null {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Sender (untrusted metadata) 块
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

    // 群聊 envelope 格式
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
   * 解析 token usage
   */
  private parseTokenUsage(val: unknown): { input: number; output: number; total: number; limit?: number; utilization?: number } | undefined {
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

  /**
   * 推断会话状态
   */
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
   * 从 transcript 推断是否为 greeting 会话
   */
  private inferSystemSentFromTranscript(lines: string[]): boolean {
    const GREETING_PATTERNS = [
      /你好 | 有什么可以帮 | 有什么需要 | 需要我帮忙 | 需要帮助/,
      /hello|how can I help|what can I do for you|need help/i,
    ];
    
    for (let i = 1; i < Math.min(lines.length, 20); i++) {
      try {
        const entry = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown } };
        if (entry?.type !== 'message' || entry?.message?.role !== 'assistant') continue;
        
        const content = entry.message?.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          for (const item of content as Array<{ type?: string; text?: string }>) {
            if (item?.type === 'text' && typeof item.text === 'string') text += item.text;
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
