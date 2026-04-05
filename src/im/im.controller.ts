import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ChannelManager } from './channel-manager';
import { SessionManager } from './session-manager';
import { FormattedMessage } from './channel.interface';

/**
 * IM Channel 管理 Controller
 */
@Controller('api/im')
export class ImController {
  constructor(
    private channelManager: ChannelManager,
    private sessionManager: SessionManager,
  ) {}

  /**
   * 获取已启用的 Channel 列表
   */
  @Get('channels')
  getEnabledChannels(): { channels: string[] } {
    return {
      channels: this.channelManager.getEnabledChannels(),
    };
  }

  /**
   * 获取 Channel 健康状态
   */
  @Get('channels/health')
  async getChannelHealth(): Promise<{ channels: Record<string, any> }> {
    const healthStatus = await this.channelManager.getHealthStatus();
    const channels: Record<string, any> = {};

    for (const [channelType, health] of healthStatus.entries()) {
      channels[channelType] = health;
    }

    return { channels };
  }

  /**
   * 检查 Channel 是否启用
   */
  @Get('channels/:channelType/enabled')
  isChannelEnabled(@Param('channelType') channelType: string): {
    enabled: boolean;
  } {
    return {
      enabled: this.channelManager.isChannelEnabled(channelType),
    };
  }

  /**
   * 获取会话监听状态
   */
  @Get('watch/status')
  getWatchStatus(): {
    watching: boolean;
    activeSessions: number;
    sessions: Array<{
      sessionId: string;
      sessionKey: string;
      user: string;
      messageCount: number;
      status: 'active' | 'completed';
      lastActivity: number;
    }>;
  } {
    const sessions = this.sessionManager.getActiveSessions();
    return {
      watching: sessions.length > 0,
      activeSessions: sessions.length,
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        sessionKey: s.sessionKey,
        user: s.user.name,
        messageCount: s.messageCount,
        status: s.status,
        lastActivity: s.lastActivity,
      })),
    };
  }

  /**
   * 发送测试消息
   */
  @Post('channels/:channelType/test')
  async sendTestMessage(
    @Param('channelType') channelType: string,
    @Body() body: { message: string; receive_id?: string },
  ): Promise<{ success: boolean; message_id?: string; error?: string }> {
    try {
      const content: FormattedMessage = {
        msg_type: 'text',
        content: { text: body.message || 'TraceFlow IM 推送测试' },
      };

      const options = body.receive_id
        ? { receive_id: body.receive_id }
        : undefined;

      const result = await this.channelManager.sendToChannel(
        channelType,
        content,
        options,
      );

      return {
        success: true,
        message_id: result?.message_id,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 广播测试消息到所有 Channel
   */
  @Post('broadcast/test')
  async broadcastTestMessage(@Body() body: { message: string }): Promise<{
    results: Record<
      string,
      { success: boolean; message_id?: string; error?: string }
    >;
  }> {
    const content: FormattedMessage = {
      msg_type: 'text',
      content: { text: body.message || 'TraceFlow 广播测试' },
    };

    const resultsMap = await this.channelManager.broadcast(content);
    const results: Record<
      string,
      { success: boolean; message_id?: string; error?: string }
    > = {};

    for (const [channelType, result] of resultsMap.entries()) {
      if (result instanceof Error) {
        results[channelType] = {
          success: false,
          error: result.message,
        };
      } else {
        results[channelType] = {
          success: true,
          message_id: result.message_id,
        };
      }
    }

    return { results };
  }
}
