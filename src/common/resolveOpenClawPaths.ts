/**
 * OpenClaw 路径解析工具
 * 
 * 参考 OpenClaw 源码：external-refs/openclaw/src/config/paths.ts
 * 
 * 用法：
 * ```typescript
 * import { resolveUserPath, resolveWorkspaceDir, resolveAuditDir, resolveStateDir } from './resolveOpenClawPaths';
 * 
 * const workspaceDir = resolveWorkspaceDir();
 * const auditDir = resolveAuditDir();
 * ```
 */

import * as path from 'path';
import * as os from 'os';

const HOME = process.env.HOME || process.env.USERPROFILE || '/root';

/**
 * 处理 ~/ 和 $HOME 路径
 * 参考 OpenClaw 源码：external-refs/openclaw/src/utils.ts resolveUserPath
 * 
 * @param inputPath - 输入路径
 * @returns 解析后的路径
 */
export function resolveUserPath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (inputPath.startsWith('~')) {
    return path.join(HOME, inputPath.slice(1));
  }
  if (inputPath.includes('$HOME')) {
    return inputPath.replace(/\$HOME/g, HOME);
  }
  return inputPath;
}

/**
 * 解析 workspace 目录
 * 
 * 优先级：
 * 1. OPENCLAW_WORKSPACE_DIR 环境变量
 * 2. ~/.openclaw/workspace (默认)
 * 
 * @returns workspace 目录路径
 */
export function resolveWorkspaceDir(): string {
  if (process.env.OPENCLAW_WORKSPACE_DIR) {
    return resolveUserPath(process.env.OPENCLAW_WORKSPACE_DIR);
  }
  return path.join(HOME, '.openclaw', 'workspace');
}

/**
 * 解析 state 目录
 * 
 * 优先级：
 * 1. OPENCLAW_STATE_DIR 环境变量
 * 2. ~/.openclaw/state (默认)
 * 
 * @returns state 目录路径
 */
export function resolveStateDir(): string {
  if (process.env.OPENCLAW_STATE_DIR) {
    return resolveUserPath(process.env.OPENCLAW_STATE_DIR);
  }
  return path.join(HOME, '.openclaw', 'state');
}

/**
 * 解析审计目录（audit）
 * 
 * 优先级：
 * 1. OPENCLAW_AUDIT_DIR 环境变量
 * 2. workspaceDir/.openclawAudits
 * 3. ~/.openclaw/workspace/.openclawAudits (默认)
 * 
 * @returns 审计目录路径
 */
export function resolveAuditDir(): string {
  if (process.env.OPENCLAW_AUDIT_DIR) {
    return resolveUserPath(process.env.OPENCLAW_AUDIT_DIR);
  }
  return path.join(resolveWorkspaceDir(), '.openclawAudits');
}

/**
 * 解析反思目录（reflections，alias for auditDir）
 * 
 * @returns 反思目录路径
 */
export function resolveReflectionsDir(): string {
  return resolveAuditDir();
}
