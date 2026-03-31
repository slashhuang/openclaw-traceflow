/**
 * Gateway 不提供 `llm.generate`；评估走与 Control UI 一致的 chat 路径：
 * `chat.send` → `agent.wait` → `chat.history` 取最后一条 assistant 正文。
 */
import { randomUUID } from 'crypto';
import type { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import type { GatewayRpcResult } from '../openclaw/gateway-rpc';

export const DEFAULT_GATEWAY_EVAL_SESSION_KEY = 'main';

function textFromAssistantContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const c of content) {
    if (c && typeof c === 'object' && 'text' in c) {
      const t = (c as { text?: unknown }).text;
      if (typeof t === 'string' && t.trim()) parts.push(t.trim());
    }
  }
  return parts.join('\n\n').trim();
}

/** 从 `chat.history` 返回的 payload 中取最近一条 assistant 文本 */
export function extractLastAssistantTextFromChatHistory(
  payload: unknown,
): string {
  if (!payload || typeof payload !== 'object') return '';
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    const role = typeof m.role === 'string' ? m.role.toLowerCase() : '';
    if (role !== 'assistant') continue;
    const text = textFromAssistantContent(m.content);
    if (text) return text;
  }
  return '';
}

/**
 * 通过 Gateway 会话跑一轮用户消息，返回 assistant 回复正文（与 `extractGatewayLlmText` 输入兼容）。
 */
export async function callGatewayChatForEvaluationText(
  gateway: GatewayConnectionService,
  params: {
    sessionKey: string;
    userMessage: string;
    timeoutMs: number;
  },
): Promise<GatewayRpcResult<unknown>> {
  const runId = randomUUID();
  const send = await gateway.request(
    'chat.send',
    {
      sessionKey: params.sessionKey,
      message: params.userMessage,
      idempotencyKey: runId,
      timeoutMs: params.timeoutMs,
    },
    params.timeoutMs + 15_000,
  );
  if (!send.ok) return send;

  const wait = await gateway.request(
    'agent.wait',
    { runId, timeoutMs: params.timeoutMs },
    params.timeoutMs + 15_000,
  );
  if (!wait.ok) return wait;

  const payload = wait.payload as { status?: string } | undefined;
  if (payload?.status !== 'ok') {
    const err =
      payload?.status === 'timeout'
        ? 'agent.wait 超时'
        : `agent.wait 未成功: ${JSON.stringify(payload)}`;
    return { ok: false, error: err };
  }

  const history = await gateway.request(
    'chat.history',
    {
      sessionKey: params.sessionKey,
      limit: 40,
    },
    60_000,
  );
  if (!history.ok) return history;

  const text = extractLastAssistantTextFromChatHistory(history.payload);
  if (!text) {
    return {
      ok: false,
      error:
        'chat.history 中未找到 assistant 正文（请确认会话有模型回复且未超出历史体积限制）',
    };
  }

  return {
    ok: true,
    payload: { text, content: text, output: text },
  };
}
