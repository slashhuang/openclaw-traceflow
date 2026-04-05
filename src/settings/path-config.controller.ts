import { Controller, Get, Put, Body, BadRequestException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import * as fs from 'fs';
import * as path from 'path';

export interface PathConfig {
  openclawStateDir?: string;
  openclawWorkspaceDir?: string;
  openclawConfigPath?: string;
  openclawGatewayUrl?: string;
}

export interface PathValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * OpenClaw 路径配置 Controller
 */
@Controller('api/settings/paths')
export class PathConfigController {
  constructor(
    private configService: ConfigService,
    private openClawService: OpenClawService,
  ) {}

  /**
   * 获取当前路径配置
   */
  @Get()
  async getPathConfig(): Promise<PathConfig & { resolved: any }> {
    // 直接读取配置文件，而不是使用 ConfigService 的缓存
    const configPath = path.join(process.cwd(), 'config', 'openclaw.runtime.json');
    let fileConfig: PathConfig = {};
    
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        fileConfig = JSON.parse(content);
      } catch (error) {
        console.error('[PathConfigController] Failed to parse config file:', error);
      }
    }
    
    // 获取解析后的路径（用于显示当前实际使用的路径）
    const resolved = await this.openClawService.getResolvedPaths(true);
    
    return {
      ...fileConfig,
      resolved,
    };
  }

  /**
   * 更新路径配置
   */
  @Put()
  async updatePathConfig(@Body() body: PathConfig): Promise<{ success: boolean; message: string }> {
    console.log('[PathConfigController] Received config update:', body);
    
    const configPath = path.join(process.cwd(), 'config', 'openclaw.runtime.json');
    console.log('[PathConfigController] Config file path:', configPath);
    
    // 读取现有配置
    let currentConfig: any = {};
    if (fs.existsSync(configPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log('[PathConfigController] Current config:', currentConfig);
      } catch (error) {
        console.error('[PathConfigController] Failed to parse config:', error);
        throw new BadRequestException('配置文件格式错误');
      }
    }
    
    // 更新配置
    if (body.openclawStateDir !== undefined) {
      currentConfig.openclawStateDir = body.openclawStateDir;
    }
    if (body.openclawWorkspaceDir !== undefined) {
      currentConfig.openclawWorkspaceDir = body.openclawWorkspaceDir;
    }
    if (body.openclawConfigPath !== undefined) {
      currentConfig.openclawConfigPath = body.openclawConfigPath;
    }
    if (body.openclawGatewayUrl !== undefined) {
      currentConfig.openclawGatewayUrl = body.openclawGatewayUrl;
    }
    
    console.log('[PathConfigController] Updated config:', currentConfig);

    // 保存配置
    try {
      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');
      console.log('[PathConfigController] Config saved successfully');

      // 清除缓存，使新配置生效
      this.openClawService.clearPathsCache();
      console.log('[PathConfigController] Cache cleared');

      return {
        success: true,
        message: '配置已保存，将在下次请求时生效',
      };
    } catch {
      console.error('[PathConfigController] Failed to save config');
      throw new BadRequestException('保存配置失败');
    }
  }

  /**
   * 验证路径配置
   */
  @Get('validate')
  async validatePaths(): Promise<PathValidationResult> {
    const config = this.configService.getConfig();
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // 验证 stateDir
    if (config.openclawStateDir) {
      if (!fs.existsSync(config.openclawStateDir)) {
        errors.push(`stateDir 不存在：${config.openclawStateDir}`);
      } else if (!fs.existsSync(path.join(config.openclawStateDir, 'agents'))) {
        warnings.push('stateDir 下未找到 agents 目录，可能不是有效的 OpenClaw state 目录');
      }
    } else {
      suggestions.push('建议配置 openclawStateDir 以提高路径解析稳定性');
    }
    
    // 验证 workspaceDir
    if (config.openclawWorkspaceDir) {
      if (!fs.existsSync(config.openclawWorkspaceDir)) {
        errors.push(`workspaceDir 不存在：${config.openclawWorkspaceDir}`);
      }
    }
    
    // 验证 Gateway URL
    if (config.openclawGatewayUrl) {
      try {
        const url = new URL(config.openclawGatewayUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.push('Gateway URL 必须是有效的 HTTP/HTTPS 地址');
        }
      } catch {
        errors.push('Gateway URL 格式不正确');
      }
    }
    
    // 添加建议
    if (errors.length === 0 && warnings.length === 0) {
      suggestions.push('当前配置看起来没问题');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * 测试 Gateway 连接
   */
  @Get('test-gateway')
  async testGatewayConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
    const config = this.configService.getConfig();
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(`${config.openclawGatewayUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        return {
          success: true,
          message: 'Gateway 连接成功',
          latency,
        };
      } else {
        return {
          success: false,
          message: `Gateway 返回异常状态：${response.status}`,
          latency,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const errorMsg = (error as Error).name === 'AbortError' 
        ? 'Gateway 连接超时（5 秒）' 
        : `无法连接到 Gateway：${(error as Error).message}`;
      return {
        success: false,
        message: errorMsg,
        latency: Date.now() - startTime,
      };
    }
  }
}
