import { Controller, Get, Put, Body, BadRequestException, Post } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from '../im/channel-manager';
import { FeishuChannel } from '../im/channels/feishu/feishu.channel';
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
      pushStrategy?: {
        sessionStart?: boolean;
        sessionMessages?: boolean;
        sessionEnd?: boolean;
        errorLogs?: boolean;
        warnLogs?: boolean;
      };
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
  ) {}

  /**
   * 获取 IM 配置
   */
  @Get()
  async getImConfig(): Promise<ImConfig> {
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
  async updateImConfig(@Body() body: ImConfig): Promise<{ success: boolean; message: string }> {
    const configPath = path.join(process.cwd(), 'config', 'openclaw.runtime.json');
    
    // 读取现有配置
    let currentConfig: any = {};
    if (fs.existsSync(configPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (error) {
        throw new BadRequestException('配置文件格式错误');
      }
    }
    
    // 更新 IM 配置
    currentConfig.im = {
      enabled: body.enabled,
      channels: body.channels,
    };

    // 保存配置
    try {
      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');
      console.log('[ImConfigController] Config saved to file');

      // 重新初始化飞书 Channel（使配置立即生效）
      // 注意：如果凭证无效，会在首次使用时报错，不影响配置保存
      if (body.channels?.feishu?.enabled) {
        try {
          await this.feishuChannel.initialize(body.channels.feishu);
          console.log('[ImConfigController] Feishu channel reloaded');
        } catch (initError) {
          console.warn('[ImConfigController] Channel init failed, but config saved:', initError);
          // 不抛出错误，让配置保存成功
        }
      }

      return {
        success: true,
        message: '配置已保存并生效',
      };
    } catch {
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

      return {
        success: true,
        message: '推送成功',
        channelId: result?.message_id,
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
      ? Object.entries(config.im.channels).map(([type, channelConfig]: [string, any]) => {
          const health = healthStatus.get(type);
          return {
            type,
            enabled: channelConfig?.enabled || false,
            healthy: health?.healthy || false,
            error: health?.error,
          };
        })
      : [];

    return {
      enabled: config.im?.enabled || false,
      channels,
    };
  }

  /**
   * 获取 IM 推送日志（最近 200 条）
   */
  @Get('logs')
  async getImPushLogs(): Promise<ImPushLog[]> {
    // TODO: 实现 IM 推送日志存储和读取
    // 目前返回空数组，后续可以从数据库或文件中读取
    return [];
  }
}
