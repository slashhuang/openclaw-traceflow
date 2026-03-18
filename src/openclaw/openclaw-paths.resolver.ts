/**
 * OpenClaw 路径解析（开源 / 无机器硬编码）
 *
 * 优先级：
 * 1. 显式 openclawStateDir
 * 2. 向正在运行的 Gateway 拉取 WebSocket hello-ok.snapshot（stateDir/configPath 与进程一致）；
 *    仅当本机存在 ${stateDir}/agents 时采用（排除「监控连远程 Gateway」时误用远端路径）
 * 3. OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH
 * 4. openclaw config file + 目录启发式
 *
 * 补充：openclaw config get agents.defaults.workspace（CLI）
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fetchRuntimePathsFromGateway } from './gateway-ws-paths';

const execFileAsync = promisify(execFile);

export type OpenClawPathsSource = {
  configPath: 'gateway' | 'env' | 'cli' | 'none';
  stateDir: 'gateway' | 'env' | 'explicit' | 'inferred' | 'fallback';
  workspaceDir: 'config-file' | 'cli' | 'none';
};

export interface OpenClawResolvedPaths {
  configPath: string | null;
  stateDir: string | null;
  workspaceDir: string | null;
  source: OpenClawPathsSource;
  cliHint?: string;
  /** Gateway WS 不可达或返回远端路径时的说明 */
  gatewayHint?: string;
}

function expandHome(input: string): string {
  const t = input.trim();
  if (t.startsWith('~/') || t === '~') {
    return path.join(os.homedir(), t.slice(1).replace(/^\//, ''));
  }
  return path.resolve(t);
}

function inferStateDirFromConfigPath(configPath: string): string | null {
  const absConfig = path.resolve(configPath);
  let dir = path.dirname(absConfig);
  for (let depth = 0; depth < 6; depth++) {
    const candidates = [path.join(dir, '.clawStates'), dir];
    for (const c of candidates) {
      try {
        if (fs.existsSync(path.join(c, 'agents'))) {
          return c;
        }
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function readWorkspaceFromConfigFile(configPath: string): string | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as {
      agents?: { defaults?: { workspace?: string } };
    };
    const w = cfg?.agents?.defaults?.workspace;
    if (typeof w !== 'string' || !w.trim()) {
      return null;
    }
    const trimmed = w.trim();
    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }
    return path.resolve(path.dirname(configPath), trimmed);
  } catch {
    return null;
  }
}

async function runOpenClawConfigFile(
  cli: string,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const { stdout } = await execFileAsync(cli, ['config', 'file'], {
      encoding: 'utf8',
      timeout: 20_000,
      env,
    });
    const p = expandHome(stdout.trim().split('\n')[0]?.trim() || '');
    if (!p) {
      return { ok: false, error: 'empty output' };
    }
    if (!fs.existsSync(p)) {
      return { ok: false, error: `path not found: ${p}` };
    }
    return { ok: true, path: path.resolve(p) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function runOpenClawConfigGetWorkspace(
  cli: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(
      cli,
      ['config', 'get', 'agents.defaults.workspace'],
      {
        encoding: 'utf8',
        timeout: 20_000,
        env,
      },
    );
    const err = stderr?.trim();
    if (err && /error|invalid|not found/i.test(err)) {
      return null;
    }
    const w = stdout.trim().split('\n')[0]?.trim();
    if (!w || w.startsWith('{')) {
      return null;
    }
    return expandHome(w);
  } catch {
    return null;
  }
}

export async function resolveOpenClawPaths(options: {
  explicitStateDir?: string;
  gatewayHttpUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  cliBinary?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OpenClawResolvedPaths> {
  const env = options.env ?? process.env;
  const cli = (options.cliBinary || env.OPENCLAW_CLI || 'openclaw').trim();

  const source: OpenClawPathsSource = {
    configPath: 'none',
    stateDir: 'fallback',
    workspaceDir: 'none',
  };

  let configPath: string | null = null;
  let stateDir: string | null = null;
  let cliHint: string | undefined;
  let gatewayHint: string | undefined;

  if (options.explicitStateDir?.trim()) {
    stateDir = expandHome(options.explicitStateDir.trim());
    source.stateDir = 'explicit';
  }

  if (!stateDir && options.gatewayHttpUrl?.trim()) {
    const tok =
      options.gatewayToken?.trim() || env.OPENCLAW_GATEWAY_TOKEN?.trim();
    const pwd =
      options.gatewayPassword?.trim() || env.OPENCLAW_GATEWAY_PASSWORD?.trim();
    const gw = await fetchRuntimePathsFromGateway({
      gatewayHttpUrl: options.gatewayHttpUrl.trim(),
      token: tok,
      password: pwd,
    });
    if (gw.ok) {
      try {
        if (fs.existsSync(path.join(gw.stateDir, 'agents'))) {
          stateDir = gw.stateDir;
          source.stateDir = 'gateway';
          if (gw.configPath && fs.existsSync(gw.configPath)) {
            configPath = path.resolve(gw.configPath);
            source.configPath = 'gateway';
          }
        } else {
          gatewayHint =
            'Gateway 报告的 stateDir 在本机无 agents/（常见于远程 Gateway）；已改用本地解析';
        }
      } catch {
        gatewayHint = '无法校验 Gateway stateDir';
      }
    } else {
      gatewayHint = gw.error;
    }
  }

  const envCfg =
    env.OPENCLAW_CONFIG_PATH?.trim() || env.CLAWDBOT_CONFIG_PATH?.trim();
  if (!configPath && envCfg) {
    const p = expandHome(envCfg);
    if (fs.existsSync(p)) {
      configPath = p;
      source.configPath = 'env';
    }
  }

  if (!configPath) {
    const r = await runOpenClawConfigFile(cli, env);
    if (r.ok) {
      configPath = r.path;
      if (source.configPath === 'none') {
        source.configPath = 'cli';
      }
    } else {
      cliHint = `openclaw config file: ${r.error}`;
    }
  }

  if (!stateDir) {
    if (env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim()) {
      stateDir = expandHome(
        (env.OPENCLAW_STATE_DIR || env.CLAWDBOT_STATE_DIR)!.trim(),
      );
      source.stateDir = 'env';
    } else if (configPath) {
      stateDir = inferStateDirFromConfigPath(configPath);
      if (stateDir) {
        source.stateDir = 'inferred';
      }
    }
  }

  if (!stateDir) {
    const home = path.join(os.homedir(), '.openclaw');
    try {
      if (fs.existsSync(path.join(home, 'agents'))) {
        stateDir = home;
        source.stateDir = 'fallback';
      }
    } catch {
      /* ignore */
    }
  }

  let workspaceDir: string | null = null;
  if (configPath && fs.existsSync(configPath)) {
    workspaceDir = readWorkspaceFromConfigFile(configPath);
    if (workspaceDir) {
      source.workspaceDir = 'config-file';
    }
  }
  if (!workspaceDir && source.configPath !== 'none') {
    const w = await runOpenClawConfigGetWorkspace(cli, env);
    if (w) {
      workspaceDir = w;
      source.workspaceDir = 'cli';
    }
  }

  return {
    configPath,
    stateDir,
    workspaceDir,
    source,
    cliHint,
    gatewayHint,
  };
}
