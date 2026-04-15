/**
 * OpenClaw 路径解析（开源 / 无机器硬编码）
 *
 * 完全以配置为准，不做任何启发式推断。
 *
 * 优先级：
 * 1. 显式配置（openclawStateDir / openclawWorkspaceDir / openclawConfigPath）
 * 2. 环境变量（OPENCLAW_STATE_DIR / OPENCLAW_WORKSPACE_DIR / OPENCLAW_CONFIG_PATH）
 * 3. null（不猜测、不嗅探，让调用方决定是否报错）
 */
import * as path from 'path';
import * as os from 'os';

export type OpenClawPathsSource = {
  stateDir: 'explicit' | 'env' | 'none';
  workspaceDir: 'explicit' | 'env' | 'none';
};

export interface OpenClawResolvedPaths {
  configPath: string | null;
  stateDir: string | null;
  workspaceDir: string | null;
  source: OpenClawPathsSource;
}

function expandHome(input: string): string {
  const t = input.trim();
  if (t.startsWith('~/') || t === '~') {
    return path.join(os.homedir(), t.slice(1).replace(/^\//, ''));
  }
  return path.resolve(t);
}

export async function resolveOpenClawPaths(options: {
  /** 手动指定 state 目录，优先级最高 */
  explicitStateDir?: string;
  /** 手动指定工作目录，优先级最高 */
  explicitWorkspaceDir?: string;
  /** 对齐 OPENCLAW_CONFIG_PATH */
  explicitConfigPath?: string;
}): Promise<OpenClawResolvedPaths> {
  const source: OpenClawPathsSource = {
    stateDir: 'none',
    workspaceDir: 'none',
  };

  let stateDir: string | null = null;
  let workspaceDir: string | null = null;
  const configPath: string | null = options.explicitConfigPath
    ? expandHome(options.explicitConfigPath.trim())
    : null;

  // --- stateDir：只认显式配置或环境变量，不做任何推断 ---
  if (options.explicitStateDir?.trim()) {
    stateDir = expandHome(options.explicitStateDir.trim());
    source.stateDir = 'explicit';
  } else if (process.env.OPENCLAW_STATE_DIR?.trim()) {
    stateDir = expandHome(process.env.OPENCLAW_STATE_DIR.trim());
    source.stateDir = 'env';
  }
  // 无显式配置时返回 null，不做 fs.existsSync 嗅探

  // --- workspaceDir：只认显式配置或环境变量，不做任何推断 ---
  if (options.explicitWorkspaceDir?.trim()) {
    workspaceDir = expandHome(options.explicitWorkspaceDir.trim());
    source.workspaceDir = 'explicit';
  } else if (process.env.OPENCLAW_WORKSPACE_DIR?.trim()) {
    workspaceDir = expandHome(process.env.OPENCLAW_WORKSPACE_DIR.trim());
    source.workspaceDir = 'env';
  }
  // 无显式配置时返回 null，不猜测默认路径

  return {
    configPath,
    stateDir,
    workspaceDir,
    source,
  };
}
