import {
  Controller,
  Get,
  Put,
  Body,
  BadRequestException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from '../im/channel-manager';
import { FeishuChannel } from '../im/channels/feishu/feishu.channel';
import { ImPushService } from '../im/im-push.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ImConfig {
  enabled: boolean;
  channels?: {
    feishu?: {
      enabled: boolean;
      appId: string;
      appSecret: string;
      targetUserId: string;
    };
  };
}

export interface ImTestResult {
  success: boolean;
  message: string;
  channelId?: string;
}

export interface ImPushLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  channel: string;
  sessionId?: string;
  messageType?: string;
  content: string;
  messageId?: string;
  error?: string;
}

/**
 * IM 推送配置 Controller
 */
@Controller('api/settings/im')
export class ImConfigController {
  constructor(
    private configService: ConfigService,
    private channelManager: ChannelManager,
    private feishuChannel: FeishuChannel,
    private imPushService: ImPushService,
  ) {}

  /**
   * 获取 IM 配置
   */
  getImConfig(): ImConfig {
    const config = this.configService.getConfig();
    return {
      enabled: config.im?.enabled || false,
      channels: config.im?.channels,
    };
  }

  /**
   * 更新 IM 配置（保存后立即生效）
   */
  @Put()
  async updateImConfig(
    @Body() body: ImConfig,
  ): Promise<{ success: boolean; message: string }> {
    const configPath = path.join(
      process.cwd(),
      'config',
      'openclaw.runtime.json',
    );

    // 读取现有配置
    let currentConfig: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        currentConfig = JSON.parse(
          fs.readFileSync(configPath, 'utf-8'),
        ) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('配置文件格式错误');
      }
    }

    // 更新 IM 配置
    const imConfig: Record<string, unknown> = {
      enabled: body.enabled,
      channels: body.channels,
    };
    currentConfig.im = imConfig;

    // 保存配置
    try {
      fs.writeFileSync(
        configPath,
        JSON.stringify(currentConfig, null, 2),
        'utf-8',
      );
      console.log('[ImConfigController] Config saved to file');
      console.log(
        '[ImConfigController] IM config:',
        JSON.stringify(currentConfig.im),
      );

      // 更新 ConfigService 内存配置（使 getConfig() 返回最新配置）
      this.configService.updateConfig({ im: currentConfig.im } as Partial<
        Record<string, unknown>
      >);
      console.log('[ImConfigController] ConfigService memory updated');

      // 重新初始化 ChannelManager（使配置立即生效）
      console.log(
        '[ImConfigController] About to reload ChannelManager with:',
        JSON.stringify(currentConfig.im),
      );
      void this.channelManager.reloadFromConfig(
        currentConfig.im as Record<string, unknown>,
      );
      console.log('[ImConfigController] ChannelManager reloaded');

      // 重新初始化 ImPushService（使事件监听器生效）
      console.log('[ImConfigController] Reloading ImPushService');
      void this.imPushService.reloadFromConfig();
      console.log('[ImConfigController] ImPushService reloaded');

      return Promise.resolve({
        success: true,
        message: '配置已保存并生效',
      });
    } catch (error) {
      console.error('[ImConfigController] Error:', error);
      throw new BadRequestException('保存配置失败');
    }
  }

  /**
   * 测试 IM 推送
   */
  @Post('test')
  async testImPush(
    @Body() body: { channel: string; message: string },
  ): Promise<ImTestResult> {
    const config = this.configService.getConfig();

    if (!config.im?.enabled) {
      return {
        success: false,
        message: 'IM 推送未启用',
      };
    }

    try {
      const result = await this.channelManager.sendToChannel(body.channel, {
        msg_type: 'text',
        content: { text: body.message || 'TraceFlow IM 推送测试' },
      });

      if (!result) {
        return {
          success: false,
          message: `推送失败：Channel "${body.channel}" 未找到或已禁用`,
        };
      }

      return {
        success: true,
        message: '推送成功',
        channelId: result.message_id,
      };
    } catch (error) {
      return {
        success: false,
        message: `推送失败：${(error as Error).message}`,
      };
    }
  }

  /**
   * 获取 IM 状态
   */
  @Get('status')
  async getImStatus(): Promise<{
    enabled: boolean;
    channels: Array<{
      type: string;
      enabled: boolean;
      healthy: boolean;
      error?: string;
    }>;
  }> {
    const config = this.configService.getConfig();
    const healthStatus = await this.channelManager.getHealthStatus();

    const channels = config.im?.channels
      ? Object.entries(config.im.channels).map(
          ([type, channelConfig]: [string, unknown]) => {
            const health = healthStatus.get(type);
            const cfg = channelConfig as Record<string, unknown> | undefined;
            return {
              type,
              enabled: (cfg?.enabled as boolean) || false,
              healthy: health?.healthy || false,
              error: health?.error,
            };
          },
        )
      : [];

    return {
      enabled: config.im?.enabled || false,
      channels,
    };
  }

  /**
   * 获取 IM 推送日志（最近 200 条）
   */
  getImPushLogs(): ImPushLog[] {
    // TODO: 实现 IM 推送日志存储和读取
    // 目前返回空数组，后续可以从数据库或文件中读取
    return [];
  }
}
