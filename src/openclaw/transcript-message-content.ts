/**
 * Transcript JSONL 中 message.content[] 的多协议兼容（Pi / OpenAI Responses / Anthropic / Ollama 等）。
 */

export function isTranscriptToolCallBlock(
  item: { type?: unknown } | null | undefined,
): boolean {
  const t = item?.type;
  return (
    t === 'toolCall' ||
    t === 'toolUse' ||
    t === 'functionCall' ||
    t === 'function_call' ||
    t === 'tool_use'
  );
}

export function extractTranscriptToolBlockMeta(item: Record<string, unknown>): {
  id?: string;
  name: string;
  input: Record<string, unknown>;
} {
  const idRaw = item.id ?? item.toolCallId ?? item.call_id ?? item.tool_use_id;
  const id =
    typeof idRaw === 'string'
      ? idRaw
      : idRaw != null
        ? String(idRaw)
        : undefined;
  const nameRaw = item.name ?? item.toolName;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : 'unknown';
  const argsRaw = item.arguments ?? item.input ?? item.args;
  let input: Record<string, unknown> = {};
  if (argsRaw && typeof argsRaw === 'object' && !Array.isArray(argsRaw)) {
    input = argsRaw as Record<string, unknown>;
  } else if (typeof argsRaw === 'string') {
    try {
      const parsed = JSON.parse(argsRaw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = { _raw: argsRaw };
    }
  }
  return { id, name, input };
}

/** 从单条 content 块拼接可见文本（不含 tool 块） */
export function appendTranscriptTextFromContentBlock(
  item: Record<string, unknown>,
  contentText: string,
): string {
  const t = item.type;
  if (t === 'text' || t === 'output_text' || t === 'input_text') {
    const tx = item.text;
    if (typeof tx === 'string') return contentText + tx;
    return contentText;
  }
  if (t === 'reasoning') {
    const s = item.summary ?? item.content;
    if (typeof s === 'string') return contentText + s;
  }
  return contentText;
}

/**
 * OpenClaw 在模型/连接失败时常写入 `content: []`，同时在 message 顶层带 `errorMessage`、`stopReason`。
 * 详情页应展示这些信息，而不是「无内容」。
 */
export function resolveAssistantTranscriptDisplayText(
  message: Record<string, unknown>,
  parsedContentText: string,
): string {
  const t = parsedContentText.trim();
  if (t && t !== '[无内容]') return parsedContentText;

  const errRaw = message.errorMessage ?? message.error;
  let err = '';
  if (typeof errRaw === 'string') {
    err = errRaw.trim();
  } else if (errRaw && typeof errRaw === 'object') {
    const m = (errRaw as { message?: unknown }).message;
    if (typeof m === 'string') err = m.trim();
  }
  if (err) return `[错误] ${err}`;

  const sr = message.stopReason;
  if (sr === 'aborted') return '[已中止]';
  if (sr === 'error') return '[错误]（无详情）';

  return parsedContentText;
}

/** 与 OpenClaw toolResult 解析一致：多块 text 保留为数组，单块为字符串 */
export function collectTranscriptTextParts(parts: unknown[]): string[] {
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const rec = part as Record<string, unknown>;
    const t = rec.type;
    if (t === 'text' || t === 'output_text' || t === 'input_text') {
      const tx = rec.text;
      if (typeof tx === 'string' && tx.length) texts.push(tx);
    }
  }
  return texts;
}
