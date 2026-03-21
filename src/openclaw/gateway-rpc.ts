/**
 * 通过 WebSocket 调用 Gateway RPC 方法。
 * 概览类调用使用 `health`（无 operator scope 要求），避免 backend 无设备身份时 `status` 报 missing scope。
 */
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { buildStatusOverviewFromHealth } from './gateway-overview-health';
import { gatewayHttpUrlToWs } from './gateway-ws-paths';

const GATEWAY_PROTOCOL_VERSION = 3;

export type GatewayRpcResult<T> =
  | { ok: true; payload: T }
  | { ok: false; error: string };

/** Dashboard Gateway Status：供 UI 标明数据来源（TraceFlow 扩展字段） */
export type TraceflowGatewayStatusSource = {
  /** 主会话模型/Token/上下文等 */
  metricsFrom: 'sessions.json' | 'health-only';
  /** 版本号与 queuedSystemEvents */
  queueVersionFrom: 'health';
  /** 是否解析到 stateDir（用于说明未读盘原因） */
  stateDirConfigured: boolean;
};

export type StatusOverviewResult = {
  version?: string;
  status?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  traceflowGatewayStatusSource?: TraceflowGatewayStatusSource;
};

/**
 * 连接后调用 `health`（豁免 operator scope），并映射为 StatusOverview 形状。
 * 不再使用 `status` + `usage.status`，避免无设备身份 backend 连接报 missing scope: operator.read。
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

  let gatewayVersion: string | undefined;

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
    let healthReqId: string | null = null;

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
                  version: 'openclaw-traceflow',
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
            gatewayVersion = payload.server.version;
          }
          healthReqId = randomUUID();
          ws.send(
            JSON.stringify({
              type: 'req',
              id: healthReqId,
              method: 'health',
              params: {},
            }),
          );
          return;
        }

        if (msg.type === 'res' && msg.id === healthReqId) {
          if (!msg.ok) {
            const err = msg.error as { message?: string } | undefined;
            done({
              ok: false,
              error: err?.message || 'RPC failed',
            });
            return;
          }
          const payload = msg.payload as Record<string, unknown>;
          const overview = buildStatusOverviewFromHealth(payload, gatewayVersion);
          done({ ok: true, payload: overview });
          return;
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
  /**
   * Connect scopes override for this RPC.
   * Needed for write-only methods like `chat.send`.
   */
  scopes?: string[];
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
                  version: 'openclaw-traceflow',
                  platform: process.platform,
                  mode: 'backend',
                  instanceId: randomUUID(),
                },
                caps: [],
                role: 'operator',
                scopes: params.scopes ?? ['operator.admin', 'operator.read'],
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

export type GatewayRpcCall = {
  method: string;
  methodParams?: Record<string, unknown>;
};

/** 单次 WebSocket 连接内依次执行多路 RPC（减少仪表盘轮询时的建连次数） */
export type GatewayRpcSequenceResult =
  | {
      ok: true;
      gatewayVersion?: string;
      payloads: unknown[];
    }
  | { ok: false; error: string };

export async function runGatewayRpcSequence(params: {
  gatewayHttpUrl: string;
  token?: string;
  password?: string;
  calls: GatewayRpcCall[];
  scopes?: string[];
  timeoutMs?: number;
}): Promise<GatewayRpcSequenceResult> {
  const { calls } = params;
  if (!calls.length) {
    return { ok: false, error: 'no RPC calls' };
  }

  const wsUrl = gatewayHttpUrlToWs(params.gatewayHttpUrl);
  const timeoutMs = Math.max(3000, params.timeoutMs ?? 20_000);
  const token = params.token?.trim();
  const password = params.password?.trim();

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: GatewayRpcSequenceResult) => {
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
    let callIndex = 0;
    const payloads: unknown[] = [];
    let gatewayVersion: string | undefined;

    const sendNext = () => {
      if (callIndex >= calls.length) {
        done({ ok: true, gatewayVersion, payloads });
        return;
      }
      const c = calls[callIndex];
      pendingReqId = randomUUID();
      callIndex += 1;
      ws.send(
        JSON.stringify({
          type: 'req',
          id: pendingReqId,
          method: c.method,
          params: c.methodParams ?? {},
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
                  version: 'openclaw-traceflow',
                  platform: process.platform,
                  mode: 'backend',
                  instanceId: randomUUID(),
                },
                caps: [],
                role: 'operator',
                scopes: params.scopes ?? ['operator.admin', 'operator.read'],
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
          const p = msg.payload as { server?: { version?: string } };
          if (p?.server?.version) {
            gatewayVersion = p.server.version;
          }
          callIndex = 0;
          sendNext();
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
          payloads.push(msg.payload);
          sendNext();
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
