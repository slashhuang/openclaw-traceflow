/** 归档文件名中的时间戳段 → 可读时间（与 metrics 解析 reset 时间一致） */
export function formatArchiveEpochLabel(ts) {
  if (!ts || typeof ts !== 'string') return String(ts ?? '');
  const normalized = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}
