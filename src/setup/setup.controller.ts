import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { AuthGuard } from '../auth/auth.guard';

export interface SetupRequest {
  gatewayUrl: string;
  accessMode: 'local-only' | 'token' | 'none';
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
  constructor(
    private configService: ConfigService,
    private openclawService: OpenClawService,
  ) {}

  /**
   * 获取当前配置状态（用于首次启动引导）
   */
  @Get('status')
  async getSetupStatus(): Promise<{
    isSetup: boolean;
    config: any;
    gatewayConnected: boolean;
    gatewayError?: string;
  }> {
    const config = this.configService.getConfig();
    const connectionResult = await this.openclawService.checkConnection();
    const ocPaths = await this.openclawService.getResolvedPaths();

    return {
      isSetup: true, // 始终认为是已配置状态
      config: {
        host: config.host,
        port: config.port,
        openclawGatewayUrl: config.openclawGatewayUrl,
        accessMode: config.accessMode,
        hasAccessToken: !!config.accessToken,
        isPublicAccess: config.host === '0.0.0.0',
        openclawPaths: {
          stateDir: ocPaths.stateDir,
          configPath: ocPaths.configPath,
          workspaceDir: ocPaths.workspaceDir,
          source: ocPaths.source,
          gatewayHint: ocPaths.gatewayHint,
          cliHint: ocPaths.cliHint,
        },
      },
      gatewayConnected: connectionResult.connected,
      gatewayError: connectionResult.error,
    };
  }

  /**
   * 测试连接到 OpenClaw Gateway
   */
  @Post('test-connection')
  async testConnection(@Body() body: { gatewayUrl: string }): Promise<{
    success: boolean;
    message: string;
  }> {
    const url = body.gatewayUrl || this.configService.getConfig().openclawGatewayUrl;
    const tempConfig = { ...this.configService.getConfig(), openclawGatewayUrl: url };

    // 临时创建一个 service 来测试
    const testService = new OpenClawService({ getConfig: () => tempConfig } as any);
    const result = await testService.checkConnection();

    return {
      success: result.connected,
      message: result.connected ? '连接成功' : `连接失败：${result.error}`,
    };
  }

  /**
   * 更新配置
   */
  @Post('configure')
  async configure(@Body() body: SetupRequest): Promise<SetupResponse> {
    try {
      const updates: any = {};

      if (body.gatewayUrl) {
        updates.openclawGatewayUrl = body.gatewayUrl;
      }

      if (body.accessMode) {
        updates.accessMode = body.accessMode;
      }

      if (body.accessMode === 'token' && body.accessToken) {
        updates.accessToken = body.accessToken;
      }

      const newConfig = this.configService.updateConfig(updates);

      return {
        success: true,
        message: '配置已保存',
        config: {
          host: newConfig.host,
          port: newConfig.port,
          openclawGatewayUrl: newConfig.openclawGatewayUrl,
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
