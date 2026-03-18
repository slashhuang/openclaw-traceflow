/**
 * 通过 WebSocket 调用 Gateway RPC 方法（status、usage.status 等）
 */
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { gatewayHttpUrlToWs } from './gateway-ws-paths';

const GATEWAY_PROTOCOL_VERSION = 3;

export type GatewayRpcResult<T> =
  | { ok: true; payload: T }
  | { ok: false; error: string };

export type StatusOverviewResult = {
  version?: string;
  status?: Record<string, unknown>;
  usage?: Record<string, unknown>;
};

/**
 * 连接后依次调用 status 和 usage.status，返回合并结果（含 hello 中的 version）
 */
export async function fetchStatusOverview(params: {
  gatewayHttpUrl: string;
  token?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<GatewayRpcResult<StatusOverviewResult>> {
  const wsUrl = gatewayHttpUrlToWs(params.gatewayHttpUrl);
  const timeoutMs = Math.max(3000, params.timeoutMs ?? 15_000);
  const token = params.token?.trim();
  const password = params.password?.trim();

  const result: StatusOverviewResult = {};

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: GatewayRpcResult<StatusOverviewResult>) => {
      if (settled) return;
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
    let pendingReqId: string | null = null;
    let pendingMethod: string | null = null;
    const methodQueue = ['status', 'usage.status'] as const;
    let methodIndex = 0;

    const sendNextMethod = () => {
      if (methodIndex >= methodQueue.length) {
        done({ ok: true, payload: result });
        return;
      }
      const method = methodQueue[methodIndex++];
      pendingMethod = method;
      pendingReqId = randomUUID();
      ws.send(
        JSON.stringify({
          type: 'req',
          id: pendingReqId,
          method,
          params: {},
        }),
      );
    };

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
          const payload = msg.payload as { server?: { version?: string } };
          if (payload?.server?.version) {
            result.version = payload.server.version;
          }
          sendNextMethod();
          return;
        }

        if (msg.type === 'res' && msg.id === pendingReqId) {
          if (!msg.ok) {
            const err = msg.error as { message?: string } | undefined;
            done({
              ok: false,
              error: err?.message || 'RPC failed',
            });
            return;
          }
          const payload = msg.payload as Record<string, unknown>;
          if (pendingMethod === 'status') {
            result.status = payload;
          } else if (pendingMethod === 'usage.status') {
            result.usage = payload;
          }
          sendNextMethod();
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

/**
 * 通过 WebSocket 连接 Gateway，完成鉴权后调用指定 RPC 方法
 */
export async function callGatewayRpc<T = unknown>(params: {
  gatewayHttpUrl: string;
  token?: string;
  password?: string;
  method: string;
  methodParams?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<GatewayRpcResult<T>> {
  const wsUrl = gatewayHttpUrlToWs(params.gatewayHttpUrl);
  const timeoutMs = Math.max(2000, params.timeoutMs ?? 12_000);
  const token = params.token?.trim();
  const password = params.password?.trim();

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: GatewayRpcResult<T>) => {
      if (settled) return;
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
    let methodReqId: string | null = null;
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
          methodReqId = randomUUID();
          ws.send(
            JSON.stringify({
              type: 'req',
              id: methodReqId,
              method: params.method,
              params: params.methodParams ?? {},
            }),
          );
          return;
        }

        if (msg.type === 'res' && msg.id === methodReqId) {
          if (!msg.ok) {
            const err = msg.error as { message?: string } | undefined;
            done({
              ok: false,
              error: err?.message || 'RPC failed',
            });
            return;
          }
          done({
            ok: true,
            payload: msg.payload as T,
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
