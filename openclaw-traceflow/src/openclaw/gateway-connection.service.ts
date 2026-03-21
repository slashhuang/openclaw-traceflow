import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { TraceflowGatewayPersistentClient } from './gateway-persistent-client';
import type { GatewayRpcResult, GatewayRpcSequenceResult } from './gateway-rpc';
import type { GatewayWsPathsResult } from './gateway-ws-paths';

/**
 * 与 Control UI 一致：对 Gateway 维持单条长驻 WebSocket，配置变更时重建客户端。
 */
@Injectable()
export class GatewayConnectionService implements OnModuleDestroy {
  private client: TraceflowGatewayPersistentClient | null = null;
  private signature = '';

  constructor(private readonly configService: ConfigService) {}

  private getSignature(): string {
    const c = this.configService.getConfig();
    return `${c.openclawGatewayUrl?.trim() ?? ''}|${c.openclawGatewayToken?.trim() ?? ''}|${c.openclawGatewayPassword?.trim() ?? ''}`;
  }

  private getOrCreateClient(): TraceflowGatewayPersistentClient {
    const sig = this.getSignature();
    if (this.client && this.signature === sig) {
      return this.client;
    }
    if (this.client) {
      this.client.stop();
      this.client = null;
    }
    this.signature = sig;
    this.client = new TraceflowGatewayPersistentClient(() => {
      const c = this.configService.getConfig();
      return {
        gatewayHttpUrl: c.openclawGatewayUrl?.trim() ?? '',
        token: c.openclawGatewayToken,
        password: c.openclawGatewayPassword,
      };
    });
    return this.client;
  }

  async request<T = unknown>(
    method: string,
    methodParams?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<GatewayRpcResult<T>> {
    return this.getOrCreateClient().request<T>(method, methodParams ?? {}, timeoutMs);
  }

  async runSequence(
    calls: Array<{ method: string; methodParams?: Record<string, unknown> }>,
  ): Promise<GatewayRpcSequenceResult> {
    return this.getOrCreateClient().runSequence(calls);
  }

  async fetchRuntimePaths(): Promise<GatewayWsPathsResult> {
    return this.getOrCreateClient().fetchRuntimePaths();
  }

  onModuleDestroy(): void {
    this.client?.stop();
    this.client = null;
    this.signature = '';
  }
}
