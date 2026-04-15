/**
 * OpenClaw 路径解析（开源 / 无机器硬编码）
 *
 * 完全以配置为准，不做任何启发式推断。
 *
 * 优先级：
 * 1. 显式配置（openclawStateDir / openclawWorkspaceDir / openclawConfigPath）
 * 2. 环境变量（OPENCLAW_STATE_DIR / OPENCLAW_WORKSPACE_DIR / OPENCLAW_CONFIG_PATH）
 * 3. 默认回退（~/.openclaw/state, ~/.openclaw/workspace）
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type OpenClawPathsSource = {
  stateDir: 'explicit' | 'env' | 'fallback';
  workspaceDir: 'explicit' | 'env' | 'fallback';
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
    stateDir: 'fallback',
    workspaceDir: 'fallback',
  };

  let stateDir: string | null = null;
  let workspaceDir: string | null = null;
  const configPath: string | null = options.explicitConfigPath
    ? expandHome(options.explicitConfigPath.trim())
    : null;

  // --- stateDir ---
  if (options.explicitStateDir?.trim()) {
    stateDir = expandHome(options.explicitStateDir.trim());
    source.stateDir = 'explicit';
  } else if (process.env.OPENCLAW_STATE_DIR?.trim()) {
    stateDir = expandHome(process.env.OPENCLAW_STATE_DIR.trim());
    source.stateDir = 'env';
  } else {
    // 默认回退：优先 ~/.openclaw/state，若不存在但 agents 在 ~/.openclaw 根下则用后者
    const homeState = path.join(os.homedir(), '.openclaw', 'state');
    const legacyHome = path.join(os.homedir(), '.openclaw');
    try {
      if (
        !fs.existsSync(homeState) &&
        fs.existsSync(path.join(legacyHome, 'agents'))
      ) {
        stateDir = legacyHome;
      }
    } catch {
      /* ignore */
    }
    if (!stateDir) {
      stateDir = homeState;
    }
  }

  // --- workspaceDir ---
  if (options.explicitWorkspaceDir?.trim()) {
    workspaceDir = expandHome(options.explicitWorkspaceDir.trim());
    source.workspaceDir = 'explicit';
  } else if (process.env.OPENCLAW_WORKSPACE_DIR?.trim()) {
    workspaceDir = expandHome(process.env.OPENCLAW_WORKSPACE_DIR.trim());
    source.workspaceDir = 'env';
  } else {
    workspaceDir = path.join(os.homedir(), '.openclaw', 'workspace');
  }

  return {
    configPath,
    stateDir,
    workspaceDir,
    source,
  };
}
