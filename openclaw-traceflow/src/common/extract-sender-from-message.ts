/**
 * 从用户消息正文与 JSONL 条目中解析参与者标识（列表扫描、详情消息过滤共用）。
 * OpenClaw 入站前缀：Conversation info 含 sender（展示名）、sender_id；Sender 块含 name/label/id。
 * 优先级：展示名 sender / name / label 先于稳定 id（sender_id、id）。
 */

function pickFromEnvelopeLikeObject(o: Record<string, unknown>): string | null {
  if (typeof o.sender === 'string' && o.sender.trim()) {
    return o.sender.trim();
  }
  if (typeof o.sender_id === 'string' && o.sender_id.trim()) {
    return o.sender_id.trim();
  }
  return null;
}

function trySenderFromJsonFences(text: string): string | null {
  const re = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const o = JSON.parse(m[1]) as Record<string, unknown>;
      if (!o || typeof o !== 'object') continue;
      const fromEnvelope = pickFromEnvelopeLikeObject(o);
      if (fromEnvelope) return fromEnvelope;
      // Sender (untrusted) 等：无 sender 字段时，展示名优先于 id
      if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
      if (typeof o.label === 'string' && o.label.trim()) return o.label.trim();
      if (typeof o.username === 'string' && o.username.trim()) return o.username.trim();
      if (typeof o.e164 === 'string' && o.e164.trim()) return o.e164.trim();
      if (typeof o.id === 'string' && o.id.trim()) return o.id.trim();
    } catch {
      /* 非 JSON 或下一 fence */
    }
  }
  return null;
}

/**
 * 从消息内容中提取 sender（用户标识）。
 */
export function extractSenderFromMessageContent(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const convBlockMatch = trimmed.match(
    /Conversation info \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/,
  );
  if (convBlockMatch) {
    try {
      const obj = JSON.parse(convBlockMatch[1]) as Record<string, unknown>;
      const v = pickFromEnvelopeLikeObject(obj);
      if (v) return v;
    } catch {
      /* ignore */
    }
  }

  const fromFence = trySenderFromJsonFences(trimmed);
  if (fromFence) return fromFence;

  const senderBlockMatch = trimmed.match(
    /Sender \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/,
  );
  if (senderBlockMatch) {
    try {
      const obj = JSON.parse(senderBlockMatch[1]) as Record<string, unknown>;
      if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
      if (typeof obj.label === 'string' && obj.label.trim()) return obj.label.trim();
      if (typeof obj.username === 'string' && obj.username.trim()) return obj.username.trim();
      if (typeof obj.e164 === 'string' && obj.e164.trim()) return obj.e164.trim();
      if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim();
    } catch {
      /* ignore */
    }
  }

  const afterEnvelope = trimmed.replace(/^\[[^\]]+\]\s*/, '');
  const colonMatch = afterEnvelope.match(/^([^:\n]+):\s/);
  if (colonMatch) {
    const sender = colonMatch[1].trim();
    if (sender === '(self)') return 'self';
    if (sender.length > 0 && sender.length < 200) return sender;
  }

  return null;
}

export function extractSenderFromMessageEntry(entry: {
  user?: string;
  message?: {
    role?: string;
    content?: unknown;
    senderLabel?: string;
    sender?: string;
  };
}): string | null {
  const msg = entry?.message;
  if (msg) {
    if (typeof msg.sender === 'string' && msg.sender.trim()) {
      return msg.sender.trim();
    }
    if (typeof msg.senderLabel === 'string' && msg.senderLabel.trim()) {
      return msg.senderLabel.trim();
    }
  }
  if (entry?.user && typeof entry.user === 'string' && entry.user.trim()) {
    return entry.user.trim();
  }
  if (!msg) return null;
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
