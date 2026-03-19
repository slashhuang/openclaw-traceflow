/**
 * 从正在运行的 OpenClaw Gateway 通过 WebSocket 拉取真实运行时路径。
 * 参考 control-ui 方案：connect 握手后 hello-ok.snapshot 含 stateDir/configPath，
 * 再调用 skills.status 获取 workspaceDir。
 */
import { randomUUID } from 'crypto';
import WebSocket from 'ws';

/** 与上游 gateway/protocol PROTOCOL_VERSION 对齐；若握手失败可随 OpenClaw 升级调整 */
const GATEWAY_PROTOCOL_VERSION = 3;

export function gatewayHttpUrlToWs(httpUrl: string): string {
  const u = new URL(httpUrl.trim() || 'http://127.0.0.1:18789');
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}`;
}

export type GatewayWsPathsResult =
  | {
      ok: true;
      stateDir: string;
      configPath: string | null;
      workspaceDir: string | null;
    }
  | { ok: false; error: string };

/**
 * 通过 WebSocket 连接 Gateway（与 control-ui 相同流程）：
 * 1. 等待 connect.challenge
 * 2. 发送 connect 请求（含 token/password 鉴权）
 * 3. hello-ok.payload.snapshot 含 stateDir、configPath
 * 4. 调用 skills.status 获取 workspaceDir
 */
export function fetchRuntimePathsFromGateway(params: {
  gatewayHttpUrl: string;
  token?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<GatewayWsPathsResult> {
  const wsUrl = gatewayHttpUrlToWs(params.gatewayHttpUrl);
  const timeoutMs = Math.max(2000, params.timeoutMs ?? 12_000);
  const token = params.token?.trim();
  const password = params.password?.trim();

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: GatewayWsPathsResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const timer = setTimeout(
      () => done({ ok: false, error: `WebSocket timeout (${timeoutMs}ms)` }),
      timeoutMs,
    );

    let connectReqId: string | null = null;
    let skillsStatusReqId: string | null = null;
    let pendingStateDir = '';
    let pendingConfigPath: string | null = null;
    const ws = new WebSocket(wsUrl, { maxPayload: 25 * 1024 * 1024 });

    ws.on('error', (err) => {
      if (!settled) {
        done({ ok: false, error: err.message || String(err) });
      }
    });

    ws.on('message', (data) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        const msg = JSON.parse(raw) as Record<string, unknown>;

        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce =
            typeof (msg.payload as { nonce?: string } | undefined)?.nonce === 'string'
              ? String((msg.payload as { nonce: string }).nonce).trim()
              : '';
          if (!nonce) {
            done({ ok: false, error: 'connect.challenge missing nonce' });
            return;
          }
          connectReqId = randomUUID();
          const auth =
            token || password
              ? { token: token || undefined, password: password || undefined }
              : undefined;
          ws.send(
            JSON.stringify({
              type: 'req',
              id: connectReqId,
              method: 'connect',
              params: {
                minProtocol: GATEWAY_PROTOCOL_VERSION,
                maxProtocol: GATEWAY_PROTOCOL_VERSION,
                client: {
                  id: 'gateway-client',
                  version: 'open-openclaw',
                  platform: process.platform,
                  mode: 'backend',
                  instanceId: randomUUID(),
                },
                caps: [],
                role: 'operator',
                scopes: ['operator.admin', 'operator.read'],
                auth,
              },
            }),
          );
          return;
        }

        if (msg.type === 'res' && msg.id === connectReqId) {
          if (!msg.ok) {
            const err = msg.error as { message?: string } | undefined;
            done({
              ok: false,
              error: err?.message || 'gateway connect rejected',
            });
            return;
          }
          const payload = msg.payload as {
            snapshot?: { stateDir?: string; configPath?: string };
          };
          const snap = payload?.snapshot;
          const stateDir = typeof snap?.stateDir === 'string' ? snap.stateDir.trim() : '';
          const configPath =
            typeof snap?.configPath === 'string' ? snap.configPath.trim() : null;
          if (!stateDir) {
            done({ ok: false, error: 'snapshot missing stateDir' });
            return;
          }
          pendingStateDir = stateDir;
          pendingConfigPath = configPath;
          skillsStatusReqId = randomUUID();
          ws.send(
            JSON.stringify({
              type: 'req',
              id: skillsStatusReqId,
              method: 'skills.status',
              params: {},
            }),
          );
          return;
        }

        if (msg.type === 'res' && msg.id === skillsStatusReqId) {
          let workspaceDir: string | null = null;
          if (msg.ok) {
            const payload = msg.payload as { workspaceDir?: string };
            if (typeof payload?.workspaceDir === 'string' && payload.workspaceDir.trim()) {
              workspaceDir = payload.workspaceDir.trim();
            }
          }
          done({
            ok: true,
            stateDir: pendingStateDir,
            configPath: pendingConfigPath,
            workspaceDir,
          });
        }
      } catch (e) {
        done({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });

    ws.on('open', () => {
      /* wait for connect.challenge */
    });
  });
}
