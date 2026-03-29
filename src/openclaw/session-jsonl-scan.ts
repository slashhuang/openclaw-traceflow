import { extractSenderFromMessageEntry } from '../common/extract-sender-from-message';
import {
  appendTranscriptTextFromContentBlock,
  collectTranscriptTextParts,
  extractTranscriptToolBlockMeta,
  isTranscriptToolCallBlock,
  resolveAssistantTranscriptDisplayText,
} from './transcript-message-content';

export type SessionJsonlMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenCount?: number;
  sender?: string;
};

export type SessionJsonlToolCall = {
  name: string;
  input: any;
  output: any;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp?: number;
};

export type SessionJsonlEvent = {
  type: string;
  timestamp: number;
  payload: unknown;
};

export type SessionJsonlScanResult = {
  messages: SessionJsonlMessage[];
  toolCalls: SessionJsonlToolCall[];
  events: SessionJsonlEvent[];
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

/**
 * 解析 transcript JSONL 行（全量与首尾分片共用）。
 * 单测针对本函数，避免仅测 helper 却漏掉与 OpenClaw 真实落盘格式的集成行为。
 */
export function scanSessionJsonlLines(lines: string[]): SessionJsonlScanResult {
  const messages: SessionJsonlMessage[] = [];
  const toolCalls: SessionJsonlToolCall[] = [];
  const events: SessionJsonlEvent[] = [];
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
      const entry = JSON.parse(line) as Record<string, unknown>;

      if (!firstUserData) {
        const sender = extractSenderFromMessageEntry(entry);
        if (sender) {
          firstUserData = { user: sender };
        } else if (entry.user) {
          firstUserData = entry;
        }
      }

      const msgObj = entry.message as Record<string, unknown> | undefined;
      const usage = (msgObj?.usage ?? entry.tokenUsage) as Record<string, unknown> | undefined;
      if (usage && typeof usage.totalTokens === 'number') {
        transcriptUsageObserved = true;
        const inp = typeof usage.input === 'number' ? usage.input : 0;
        const out = typeof usage.output === 'number' ? usage.output : 0;
        sumInput += inp;
        sumOutput += out;
        lastTotal = usage.totalTokens as number;

        const cost = usage.cost as Record<string, unknown> | undefined;
        if (cost && typeof cost === 'object' && typeof cost.total === 'number') {
          hasCostField = true;
          sumCostInput += typeof cost.input === 'number' ? cost.input : 0;
          sumCostOutput += typeof cost.output === 'number' ? cost.output : 0;
          sumCostCacheRead += typeof cost.cacheRead === 'number' ? cost.cacheRead : 0;
          sumCostCacheWrite += typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0;
          sumCostTotal += cost.total as number;
        }
        tokenUsage = {
          input: sumInput,
          output: sumOutput,
          total: lastTotal,
          limit: typeof usage.limit === 'number' ? usage.limit : undefined,
        };
      }

      if (
        entry.message ||
        entry.type === 'session' ||
        entry.type === 'model_change' ||
        entry.type === 'thinking_level_change' ||
        entry.type === 'custom'
      ) {
        const msg = entry.message as Record<string, unknown> | undefined;
        const role = (msg?.role as string) || 'system';

        if (!msg && entry.type) {
          let metaContent = '';
          if (entry.type === 'session') {
            metaContent = `[Session] id=${entry.id}, version=${entry.version}`;
          } else if (entry.type === 'model_change') {
            metaContent = `[Model] ${entry.provider}/${entry.modelId}`;
          } else if (entry.type === 'thinking_level_change') {
            metaContent = `[Thinking] level=${entry.thinkingLevel || 'unknown'}`;
          } else if (entry.type === 'custom' && entry.customType) {
            metaContent = `[Custom] ${entry.customType}`;
          } else {
            metaContent = `[${entry.type}]`;
          }

          messages.push({
            role: 'system',
            content: metaContent,
            timestamp: (entry.timestamp as number) || Date.now(),
            tokenCount: 0,
          });
        }

        if (msg) {
          const messageContent = msg.content;

          if (role === 'toolResult') {
            const toolCallId = msg.toolCallId as string | undefined;
            const toolName = msg.toolName as string | undefined;
            const isError = msg.isError === true;
            const details = msg.details as { durationMs?: number; status?: string } | undefined;
            const durationMs = details?.durationMs ?? 0;

            let output: any = {};
            if (Array.isArray(messageContent)) {
              const texts = collectTranscriptTextParts(messageContent);
              output = texts.length === 1 ? texts[0] : texts.length > 1 ? texts : {};
            }
            const isEmptyPlainObject =
              output !== null &&
              typeof output === 'object' &&
              !Array.isArray(output) &&
              Object.keys(output as object).length === 0;
            if (details && Object.keys(details).length > 0 && isEmptyPlainObject) {
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
                  prev.timestamp ?? (typeof entry.timestamp === 'number' ? entry.timestamp : undefined),
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

          let contentText = '';
          if (Array.isArray(messageContent)) {
            for (const raw of messageContent) {
              if (!raw || typeof raw !== 'object') continue;
              const item = raw as Record<string, unknown>;
              if (isTranscriptToolCallBlock(item)) {
                const { id, name, input } = extractTranscriptToolBlockMeta(item);
                const idx = toolCalls.length;
                toolCalls.push({
                  name,
                  input,
                  output: {},
                  durationMs: 0,
                  success: true,
                  error: undefined,
                  timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
                });
                if (id) toolCallIdToIndex.set(id, idx);
              } else if (item.type === 'thinking') {
                // skip
              } else {
                contentText = appendTranscriptTextFromContentBlock(item, contentText);
              }
            }
            if (!contentText && role === 'assistant') {
              const tcNames = messageContent
                .filter((c: unknown) => c && typeof c === 'object' && isTranscriptToolCallBlock(c as { type?: unknown }))
                .map((c: unknown) => extractTranscriptToolBlockMeta(c as Record<string, unknown>).name);
              if (tcNames.length > 0) {
                contentText = '[工具调用：' + tcNames.join(', ') + ']';
              } else if (!contentText) {
                contentText = '[无内容]';
              }
            } else if (!contentText) {
              contentText = '[无内容]';
            }
          } else if (messageContent === undefined || messageContent === null) {
            contentText = '';
            if (role === 'assistant') {
              contentText = '[无内容]';
            }
          } else {
            contentText =
              typeof messageContent === 'string'
                ? messageContent
                : (() => {
                    try {
                      return JSON.stringify(messageContent);
                    } catch {
                      return '[无法序列化]';
                    }
                  })();
          }

          if (role === 'assistant') {
            contentText = resolveAssistantTranscriptDisplayText(msg, contentText);
          }

          const sender = role === 'user' ? extractSenderFromMessageEntry(entry) : undefined;
          const displayRole = role === 'toolResult' ? 'assistant' : (role as 'user' | 'assistant' | 'system');
          messages.push({
            role: displayRole,
            content: contentText,
            timestamp: (entry.timestamp as number) || Date.now(),
            tokenCount: msg.tokenCount as number | undefined,
            ...(sender ? { sender } : {}),
          });
        }
      }

      if (entry.toolUse) {
        const tu = entry.toolUse as { name?: string; input?: unknown; output?: unknown; durationMs?: number; success?: boolean; error?: string };
        const legacyToolName = tu.name as string;
        if (!legacyToolUseNames.has(legacyToolName)) {
          legacyToolUseNames.add(legacyToolName);
          toolCalls.push({
            name: tu.name as string,
            input: tu.input || {},
            output: tu.output || {},
            durationMs: tu.durationMs || 0,
            success: tu.success !== false,
            error: tu.error,
            timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
          });
        }
      }

      if (entry.type && !entry.message && !entry.toolUse) {
        events.push({
          type: entry.type as string,
          timestamp: (entry.timestamp as number) || Date.now(),
          payload: entry,
        });
      }
    } catch {
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
