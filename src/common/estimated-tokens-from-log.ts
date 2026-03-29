/**
 * 当官方 usage / 索引用量不可信时，用 live transcript 字节数做粗算（非计费、非 tokenizer 精确值）。
 */

export const DEFAULT_TOKEN_BYTES_DIVISOR = 4;

export function estimateTokensFromTranscriptBytes(
  bytes: number | undefined | null,
  divisor: number = DEFAULT_TOKEN_BYTES_DIVISOR,
): number | undefined {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return undefined;
  }
  if (
    typeof divisor !== 'number' ||
    !Number.isFinite(divisor) ||
    divisor <= 0
  ) {
    return undefined;
  }
  return Math.ceil(bytes / divisor);
}

/** 列表/详情是否展示「由日志大小推算」的 token（不覆盖官方非零用量） */
export function shouldOfferLogSizeTokenEstimate(session: {
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
    contextUtilizationReliable?: boolean;
  };
  tokenUsageMeta?: { totalTokensFresh?: boolean };
  transcriptFileSizeBytes?: number;
}): boolean {
  const bytes = session.transcriptFileSizeBytes;
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return false;
  }
  const stale = session.tokenUsageMeta?.totalTokensFresh === false;
  const unreliable = session.tokenUsage?.contextUtilizationReliable === false;
  if (!stale && !unreliable) {
    return false;
  }
  const tu = session.tokenUsage;
  const io = (tu?.input ?? 0) + (tu?.output ?? 0);
  const tot = tu?.total ?? 0;
  if (io > 0 || tot > 0) {
    return false;
  }
  return true;
}
