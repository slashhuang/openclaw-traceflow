/**
 * 与 Control UI / openclaw GatewayClient 一致：单条长驻 WebSocket，在 connect 握手后复用 request，
 * 避免每次 RPC 都建连、断连。
 */
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { gatewayHttpUrlToWs } from './gateway-ws-paths';
import type { GatewayRpcResult, GatewayRpcSequenceResult } from './gateway-rpc';
import type { GatewayWsPathsResult } from './gateway-ws-paths';

const GATEWAY_PROTOCOL_VERSION = 3;

export type GatewayPersistentConfig = {
  gatewayHttpUrl: string;
  token?: string;
  password?: string;
};

type PendingEntry = {
  resolve: (r: GatewayRpcResult<unknown>) => void;
  timeout: NodeJS.Timeout;
};

export class TraceflowGatewayPersistentClient {
  private ws: WebSocket | null = null;
  private ready = false;
  private connectMutex: Promise<void> | null = null;
  private readonly instanceId = randomUUID();

  private connectReqId: string | null = null;
  private pending = new Map<string, PendingEntry>();

  private gatewayVersion: string | undefined;
  private snapshotStateDir = '';
  private snapshotConfigPath: string | null = null;

  constructor(private readonly getCfg: () => GatewayPersistentConfig) {}

  getGatewayVersion(): string | undefined {
    return this.gatewayVersion;
  }

  getSnapshotStateDir(): string {
    return this.snapshotStateDir;
  }

  getSnapshotConfigPath(): string | null {
    return this.snapshotConfigPath;
  }

  stop(): void {
    this.ready = false;
    this.connectReqId = null;
    this.gatewayVersion = undefined;
    this.snapshotStateDir = '';
    this.snapshotConfigPath = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timeout);
      p.resolve({ ok: false, error: 'gateway client stopped' });
    }
    this.pending.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /**
   * 建立 WebSocket 并完成 connect 握手（幂等：已就绪则直接返回）
   */
  async connect(): Promise<void> {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.connectMutex) {
      return this.connectMutex;
    }
    this.connectMutex = this.openAndHandshake();
    try {
      await this.connectMutex;
    } finally {
      this.connectMutex = null;
    }
  }

  private buildConnectParams() {
    const cfg = this.getCfg();
    const token = cfg.token?.trim();
    const password = cfg.password?.trim();
    const auth =
      token || password ? { token: token || undefined, password: password || undefined } : undefined;
    return {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: {
        id: 'gateway-client',
        version: 'openclaw-traceflow',
        platform: process.platform,
        mode: 'backend',
        instanceId: this.instanceId,
      },
      caps: [],
      role: 'operator',
      scopes: ['operator.admin', 'operator.read'],
      auth,
    };
  }

  private openAndHandshake(): Promise<void> {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.ready = false;
    this.connectReqId = null;

    const cfg = this.getCfg();
    const url = cfg.gatewayHttpUrl?.trim();
    if (!url) {
      return Promise.reject(new Error('Gateway URL 未配置'));
    }
    const wsUrl = gatewayHttpUrlToWs(url);
    const timeoutMs = 20_000;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { maxPayload: 25 * 1024 * 1024 });
      this.ws = ws;

      let handshakeSettled = false;

      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        finishFail(new Error(`WebSocket handshake timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      const finishFail = (err: Error) => {
        if (handshakeSettled) {
          return;
        }
        handshakeSettled = true;
        clearTimeout(timer);
        this.ready = false;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        if (this.ws === ws) {
          this.ws = null;
        }
        reject(err);
      };

      const finishOk = () => {
        if (handshakeSettled) {
          return;
        }
        handshakeSettled = true;
        clearTimeout(timer);
        this.ready = true;
        resolve();
      };

      ws.on('error', (err) => {
        if (!handshakeSettled) {
          finishFail(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.on('close', () => {
        if (!handshakeSettled) {
          finishFail(new Error('gateway websocket closed before handshake'));
        }
        this.ready = false;
        if (this.ws === ws) {
          this.ws = null;
        }
        for (const [, p] of this.pending) {
          clearTimeout(p.timeout);
          p.resolve({ ok: false, error: 'gateway websocket closed' });
        }
        this.pending.clear();
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
              finishFail(new Error('connect.challenge missing nonce'));
              return;
            }
            this.connectReqId = randomUUID();
            ws.send(
              JSON.stringify({
                type: 'req',
                id: this.connectReqId,
                method: 'connect',
                params: this.buildConnectParams(),
              }),
            );
            return;
          }

          if (msg.type === 'res' && msg.id === this.connectReqId) {
            this.connectReqId = null;
            if (!msg.ok) {
              const err = msg.error as { message?: string } | undefined;
              finishFail(new Error(err?.message || 'gateway connect rejected'));
              return;
            }
            const payload = msg.payload as {
              server?: { version?: string };
              snapshot?: { stateDir?: string; configPath?: string };
            };
            if (payload?.server?.version) {
              this.gatewayVersion = payload.server.version;
            }
            const snap = payload?.snapshot;
            this.snapshotStateDir =
              typeof snap?.stateDir === 'string' ? snap.stateDir.trim() : '';
            this.snapshotConfigPath =
              typeof snap?.configPath === 'string' ? snap.configPath.trim() : null;
            finishOk();
            return;
          }

          if (msg.type === 'res' && typeof msg.id === 'string' && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            clearTimeout(entry.timeout);
            if (!msg.ok) {
              const err = msg.error as { message?: string } | undefined;
              entry.resolve({ ok: false, error: err?.message || 'RPC failed' });
            } else {
              entry.resolve({ ok: true, payload: msg.payload });
            }
            return;
          }
        } catch (e) {
          finishFail(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<GatewayRpcResult<T>> {
    await this.connect();
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: 'gateway not connected' };
    }
    const id = randomUUID();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `gateway request timeout (${method})` });
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => resolve(r as GatewayRpcResult<T>),
        timeout: t,
      });
      try {
        this.ws!.send(
          JSON.stringify({
            type: 'req',
            id,
            method,
            params,
          }),
        );
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(t);
        resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  async runSequence(
    calls: Array<{ method: string; methodParams?: Record<string, unknown> }>,
  ): Promise<GatewayRpcSequenceResult> {
    if (!calls.length) {
      return { ok: false, error: 'no RPC calls' };
    }
    await this.connect();
    const payloads: unknown[] = [];
    for (const c of calls) {
      const r = await this.request(c.method, c.methodParams ?? {}, 20_000);
      if (!r.ok) {
        return { ok: false, error: r.error };
      }
      payloads.push((r as { ok: true; payload: unknown }).payload);
    }
    return { ok: true, gatewayVersion: this.gatewayVersion, payloads };
  }

  /**
   * 与 gateway-ws-paths.fetchRuntimePathsFromGateway 等价，但复用当前连接（connect 后仅再打 skills.status）
   */
  async fetchRuntimePaths(): Promise<GatewayWsPathsResult> {
    await this.connect();
    if (!this.snapshotStateDir) {
      return { ok: false, error: 'snapshot missing stateDir' };
    }
    const r = await this.request<{ workspaceDir?: string }>('skills.status', {}, 12_000);
    if (!r.ok) {
      return { ok: false, error: r.error };
    }
    let workspaceDir: string | null = null;
    const p = r.payload as { workspaceDir?: string };
    if (typeof p?.workspaceDir === 'string' && p.workspaceDir.trim()) {
      workspaceDir = p.workspaceDir.trim();
    }
    return {
      ok: true,
      stateDir: this.snapshotStateDir,
      configPath: this.snapshotConfigPath,
      workspaceDir,
    };
  }
}
