import { Controller, Get, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ConfigService, type Config } from '../config/config.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import { AuthGuard } from '../auth/auth.guard';

export interface SetupRequest {
  gatewayUrl?: string;
  openclawGatewayUrl?: string;
  openclawGatewayToken?: string;
  openclawGatewayPassword?: string;
  openclawStateDir?: string;
  openclawWorkspaceDir?: string;
  accessMode?: 'local-only' | 'token' | 'none';
  accessToken?: string;
}

export interface SetupResponse {
  success: boolean;
  message: string;
  config?: any;
}

@Controller('api/setup')
@UseGuards(AuthGuard)
export class SetupController {
  private readonly logger = new Logger(SetupController.name);
  /** 合并并发 GET /status，避免引导页/多标签同时打两次 Gateway */
  private setupStatusInFlight: Promise<{
    isSetup: boolean;
    config: any;
    gatewayConnected: boolean;
    gatewayError?: string;
  }> | null = null;
  private setupStatusCache: {
    at: number;
    payload: {
      isSetup: boolean;
      config: any;
      gatewayConnected: boolean;
      gatewayError?: string;
    };
  } | null = null;
  private static readonly SETUP_STATUS_CACHE_MS = 2500;

  constructor(
    private configService: ConfigService,
    private openclawService: OpenClawService,
  ) {}

  /**
   * 获取当前配置状态（用于首次启动引导）
   * 优化：并行执行检查 + 性能日志 + 超时保护
   */
  @Get('status')
  async getSetupStatus(): Promise<{
    isSetup: boolean;
    config: any;
    gatewayConnected: boolean;
    gatewayError?: string;
  }> {
    const now = Date.now();
    if (
      this.setupStatusCache &&
      now - this.setupStatusCache.at < SetupController.SETUP_STATUS_CACHE_MS
    ) {
      return this.setupStatusCache.payload;
    }
    if (this.setupStatusInFlight) {
      return this.setupStatusInFlight;
    }

    this.setupStatusInFlight = this.computeSetupStatus().finally(() => {
      this.setupStatusInFlight = null;
    });
    const payload = await this.setupStatusInFlight;
    this.setupStatusCache = { at: Date.now(), payload };
    return payload;
  }

  private async computeSetupStatus(): Promise<{
    isSetup: boolean;
    config: any;
    gatewayConnected: boolean;
    gatewayError?: string;
  }> {
    const startTime = Date.now();
    this.logger.debug('[getSetupStatus] starting status check (single gateway pass)...');

    const config = this.configService.getConfig();

    const { connected, gatewayError, paths: pathsData, totalTimeMs } =
      await this.openclawService.getSetupStatusSnapshot();

    const totalTime = Date.now() - startTime;
    this.logger.debug(
      `[getSetupStatus] completed in ${totalTime}ms | gatewayConnected=${connected} | stateDir=${pathsData.stateDir ?? 'n/a'}`,
    );

    return {
      isSetup: true, // 始终认为是已配置状态
      config: {
        host: config.host,
        port: config.port,
        openclawGatewayUrl: config.openclawGatewayUrl,
        openclawStateDir: config.openclawStateDir,
        openclawWorkspaceDir: config.openclawWorkspaceDir,
        accessMode: config.accessMode,
        hasAccessToken: !!config.accessToken,
        hasGatewayToken: !!config.openclawGatewayToken,
        isPublicAccess: config.host === '0.0.0.0',
        openclawPaths: {
          stateDir: pathsData.stateDir,
          configPath: pathsData.configPath,
          workspaceDir: pathsData.workspaceDir,
          source: pathsData.source,
          gatewayHint: pathsData.gatewayHint,
          cliHint: pathsData.cliHint,
        },
        performance: {
          totalTimeMs: totalTime,
          connectionCheckMs: totalTimeMs,
        },
      },
      gatewayConnected: connected,
      gatewayError,
    };
  }

  /**
   * 测试连接到 OpenClaw Gateway（使用 WebSocket 协议，含 token/password 鉴权）
   * 测试成功时自动写入配置，无需用户再点击保存
   */
  @Post('test-connection')
  async testConnection(
    @Body()
    body: {
      gatewayUrl?: string;
      openclawGatewayUrl?: string;
      openclawGatewayToken?: string;
      openclawGatewayPassword?: string;
    },
  ): Promise<{ connected: boolean; message: string; error?: string }> {
    const cfg = this.configService.getConfig();
    const url =
      body.openclawGatewayUrl || body.gatewayUrl || cfg.openclawGatewayUrl;
    const tempConfig = {
      ...cfg,
      openclawGatewayUrl: url,
      openclawGatewayToken:
        body.openclawGatewayToken ?? cfg.openclawGatewayToken,
      openclawGatewayPassword:
        body.openclawGatewayPassword ?? cfg.openclawGatewayPassword,
    };

    /** 仅实现 getConfig，供单次连接探测；需断言为 ConfigService 以满足构造签名（Nest 运行时仍注入真实 ConfigService） */
    const mockConfigService = {
      getConfig: (): Config => tempConfig as Config,
    } as unknown as ConfigService;
    const mockGatewayConnection = new GatewayConnectionService(mockConfigService);
    const testService = new OpenClawService(mockConfigService, mockGatewayConnection);
    const result = await testService.checkConnection();

    if (result.connected) {
      this.configService.updateConfig({
        openclawGatewayUrl: url,
        openclawGatewayToken:
          body.openclawGatewayToken ?? cfg.openclawGatewayToken,
        openclawGatewayPassword:
          body.openclawGatewayPassword ?? cfg.openclawGatewayPassword,
      });
      this.openclawService.clearPathsCache();
    }

    return {
      connected: result.connected,
      message: result.connected
        ? '连接成功，配置已保存'
        : `连接失败：${result.error}`,
      error: result.error,
    };
  }

  /**
   * 更新配置
   */
  @Post('configure')
  async configure(@Body() body: SetupRequest): Promise<SetupResponse> {
    try {
      const updates: Record<string, unknown> = {};

      const gatewayUrl = body.openclawGatewayUrl || body.gatewayUrl;
      if (gatewayUrl !== undefined) {
        updates.openclawGatewayUrl = gatewayUrl;
      }
      if (body.openclawGatewayToken !== undefined) {
        updates.openclawGatewayToken = body.openclawGatewayToken;
      }
      if (body.openclawGatewayPassword !== undefined) {
        updates.openclawGatewayPassword = body.openclawGatewayPassword;
      }
      if (body.openclawStateDir !== undefined) {
        updates.openclawStateDir = body.openclawStateDir || undefined;
      }
      if (body.openclawWorkspaceDir !== undefined) {
        updates.openclawWorkspaceDir = body.openclawWorkspaceDir || undefined;
      }
      if (body.accessMode !== undefined) {
        updates.accessMode = body.accessMode;
      }
      if (body.accessMode === 'token' && body.accessToken !== undefined) {
        updates.accessToken = body.accessToken;
      }

      const newConfig = this.configService.updateConfig(updates);
      this.openclawService.clearPathsCache();

      return {
        success: true,
        message: '配置已保存',
        config: {
          host: newConfig.host,
          port: newConfig.port,
          openclawGatewayUrl: newConfig.openclawGatewayUrl,
          accessMode: newConfig.accessMode,
          hasAccessToken: !!newConfig.accessToken,
          hasGatewayToken: !!newConfig.openclawGatewayToken,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `配置失败：${error.message}`,
      };
    }
  }

  /**
   * 生成随机 Access Token
   */
  @Get('generate-token')
  async generateToken(): Promise<{ token: string }> {
    const token = `oc_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    return { token };
  }
}
