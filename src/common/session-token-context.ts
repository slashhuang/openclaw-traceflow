/**
 * 与 OpenClaw `resolveFreshSessionTotalTokens` / SessionEntry.totalTokensFresh 对齐：
 * 索引中 totalTokensFresh === false 时，sessions.json 里的 totalTokens 不可作为「当前上下文窗口」用量的可信依据。
 */
export function isIndexTotalTokensUsableForContext(
  totalTokens: number | undefined,
  totalTokensFresh: boolean | undefined,
): boolean {
  if (typeof totalTokens !== 'number' || !Number.isFinite(totalTokens) || totalTokens < 0) {
    return false;
  }
  if (totalTokensFresh === false) {
    return false;
  }
  return true;
}
