import { Controller, Get, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { AuthGuard } from '../auth/auth.guard';

export interface SetupRequest {
  openclawStateDir?: string;
  openclawWorkspaceDir?: string;
  /** 对齐 OPENCLAW_CONFIG_PATH */
  openclawConfigPath?: string;
  /** bootstrap 逻辑文件名 → 绝对路径 */
  bootstrapFileOverrides?: Record<string, string>;
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
  private setupStatusInFlight: Promise<{
    isSetup: boolean;
    config: any;
  }> | null = null;
  private setupStatusCache: {
    at: number;
    payload: {
      isSetup: boolean;
      config: any;
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
  }> {
    const startTime = Date.now();
    this.logger.debug('[getSetupStatus] starting status check...');

    const config = this.configService.getConfig();
    const paths = await this.openclawService.getResolvedPaths();

    const totalTime = Date.now() - startTime;
    this.logger.debug(
      `[getSetupStatus] completed in ${totalTime}ms | stateDir=${paths.stateDir ?? 'n/a'}`,
    );

    return {
      isSetup: true, // 始终认为是已配置状态
      config: {
        host: config.host,
        port: config.port,
        openclawStateDir: config.openclawStateDir,
        openclawWorkspaceDir: config.openclawWorkspaceDir,
        openclawConfigPath: config.openclawConfigPath,
        bootstrapFileOverrides: config.bootstrapFileOverrides,
        accessMode: config.accessMode,
        hasAccessToken: !!config.accessToken,
        isPublicAccess: config.host === '0.0.0.0',
        openclawPaths: {
          stateDir: paths.stateDir,
          configPath: paths.configPath,
          workspaceDir: paths.workspaceDir,
          source: paths.source,
        },
        performance: {
          totalTimeMs: totalTime,
        },
      },
    };
  }

  /**
   * 更新配置
   */
  @Post('configure')
  async configure(@Body() body: SetupRequest): Promise<SetupResponse> {
    try {
      const updates: Record<string, unknown> = {};

      if (body.openclawStateDir !== undefined) {
        updates.openclawStateDir = body.openclawStateDir || undefined;
      }
      if (body.openclawWorkspaceDir !== undefined) {
        updates.openclawWorkspaceDir = body.openclawWorkspaceDir || undefined;
      }
      if (body.openclawConfigPath !== undefined) {
        updates.openclawConfigPath = body.openclawConfigPath || undefined;
      }
      if (body.bootstrapFileOverrides !== undefined) {
        updates.bootstrapFileOverrides =
          body.bootstrapFileOverrides &&
          typeof body.bootstrapFileOverrides === 'object'
            ? body.bootstrapFileOverrides
            : undefined;
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
          openclawStateDir: newConfig.openclawStateDir,
          openclawWorkspaceDir: newConfig.openclawWorkspaceDir,
          openclawConfigPath: newConfig.openclawConfigPath,
          accessMode: newConfig.accessMode,
          hasAccessToken: !!newConfig.accessToken,
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
