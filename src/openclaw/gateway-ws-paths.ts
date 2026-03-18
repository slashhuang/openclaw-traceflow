/**
 * 从正在运行的 OpenClaw Gateway 拉取真实运行时路径（与进程内 STATE_DIR / config 一致）。
 * 见上游 buildGatewaySnapshot：snapshot.stateDir、snapshot.configPath
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
  | { ok: true; stateDir: string; configPath: string | null }
  | { ok: false; error: string };

/**
 * WebSocket 完成 connect 后，hello-ok.payload.snapshot 含 stateDir / configPath。
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
    const ws = new WebSocket(wsUrl, { maxPayload: 25 * 1024 * 1024 });

    ws.on('error', (err) => {
      if (!connectReqId) {
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
                  id: 'openclaw-probe',
                  version: 'openclaw-monitor',
                  platform: process.platform,
                  mode: 'probe',
                  instanceId: randomUUID(),
                },
                caps: [],
                role: 'operator',
                scopes: ['operator.read'],
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
          done({ ok: true, stateDir, configPath });
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
