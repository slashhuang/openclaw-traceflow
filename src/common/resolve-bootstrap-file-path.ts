import * as path from 'path';

/**
 * 解析 bootstrap 逻辑文件名对应的绝对路径（Traceflow 设置中的 override 优先）。
 */
export function resolveBootstrapFileAbsolutePath(
  basename: string,
  workspaceRoot: string,
  bootstrapFileOverrides?: Record<string, string> | null,
): string {
  const name = (basename || '').trim();
  const override = bootstrapFileOverrides?.[name]?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(path.resolve(workspaceRoot.trim()), name);
}
