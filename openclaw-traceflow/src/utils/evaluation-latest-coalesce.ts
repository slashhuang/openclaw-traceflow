/**
 * 合并同一资源的并发 GET latest 请求，避免多标签/瞬时并发重复读盘。
 * 带超时，避免 fetcher 卡死时永久占用 inflight、拖垮后续请求。
 */
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TIMEOUT_MS = 15_000;

export async function coalesceLatestEvaluation<T>(
  key: string,
  fetcher: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const p = (async (): Promise<T> => {
    try {
      return await Promise.race([
        fetcher(),
        new Promise<T>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`latest evaluation coalesce timeout (${timeoutMs}ms)`),
              ),
            timeoutMs,
          ),
        ),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg } as T;
    }
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p as Promise<T>;
}
