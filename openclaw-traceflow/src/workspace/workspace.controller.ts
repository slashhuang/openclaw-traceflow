import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as fsSync from 'fs';

@Controller('api/workspace')
export class WorkspaceController {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = this.resolveWorkspaceDir();
  }

  /**
   * 解析 workspace 目录（完全复用 OpenClaw 源码逻辑）
   * 参考：external-refs/openclaw/src/agents/agent-scope.ts + workspace.ts
   * 
   * 降级顺序：
   * 1. agent 配置的 workspace（agents.list[].workspace for 'main'）
   * 2. default agent 的 agents.defaults.workspace
   * 3. resolveDefaultAgentWorkspaceDir(process.env):
   *    - OPENCLAW_PROFILE (非 default) → ~/.openclaw/workspace-{profile}
   *    - 默认 → ~/.openclaw/workspace
   * 4. 非 default agent → {stateDir}/workspace-{agentId}
   */
  private resolveWorkspaceDir(): string {
    const agentId = 'main'; // TraceFlow 固定使用 main agent
    
    // 1. 尝试读取配置文件
    const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
    let config: any = null;
    
    try {
      if (fsSync.existsSync(configPath)) {
        const configContent = fsSync.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      }
    } catch (error) {
      console.warn('[WorkspaceController] Failed to read config:', error instanceof Error ? error.message : error);
    }

    if (config) {
      // 1a. 检查 agent 配置（main agent）
      const agentConfig = config.agents?.list?.find((a: any) => a.id === 'main' || a.id === agentId);
      if (agentConfig?.workspace?.trim()) {
        const resolved = this.stripNullBytes(this.resolveUserPath(agentConfig.workspace.trim()));
        console.log('[WorkspaceController] Using agent workspace config:', resolved);
        return resolved;
      }
      
      // 1b. 如果是 default agent，检查 agents.defaults.workspace
      const defaultAgentId = this.resolveDefaultAgentId(config);
      if (agentId === defaultAgentId && config.agents?.defaults?.workspace?.trim()) {
        const resolved = this.stripNullBytes(this.resolveUserPath(config.agents.defaults.workspace.trim()));
        console.log('[WorkspaceController] Using agents.defaults.workspace:', resolved);
        return resolved;
      }
      
      // 1c. 非 default agent → {stateDir}/workspace-{agentId}
      if (agentId !== defaultAgentId) {
        const stateDir = this.resolveStateDir();
        const resolved = this.stripNullBytes(path.join(stateDir, `workspace-${agentId}`));
        console.log('[WorkspaceController] Using agent-specific workspace:', resolved);
        return resolved;
      }
    }

    // 2. resolveDefaultAgentWorkspaceDir (降级到默认值)
    const resolved = this.resolveDefaultAgentWorkspaceDir();
    console.log('[WorkspaceController] Using default workspace:', resolved);
    return resolved;
  }

  /**
   * 解析默认 agent workspace 目录（复用 OpenClaw 逻辑）
   * 参考：external-refs/openclaw/src/agents/workspace.ts
   */
  private resolveDefaultAgentWorkspaceDir(): string {
    const profile = process.env.OPENCLAW_PROFILE?.trim();
    const homeDir = os.homedir();
    
    if (profile && profile.toLowerCase() !== 'default') {
      return path.join(homeDir, '.openclaw', `workspace-${profile}`);
    }
    return path.join(homeDir, '.openclaw', 'workspace');
  }

  /**
   * 解析 default agent id（复用 OpenClaw 逻辑）
   * 参考：external-refs/openclaw/src/agents/agent-scope.ts
   */
  private resolveDefaultAgentId(config: any): string {
    const agents = config.agents?.list || [];
    if (agents.length === 0) {
      return 'main';
    }
    const defaults = agents.filter((agent: any) => agent?.default);
    const chosen = (defaults[0] ?? agents[0])?.id?.trim();
    return this.normalizeAgentId(chosen || 'main');
  }

  /**
   * 解析 state 目录
   */
  private resolveStateDir(): string {
    // 优先使用环境变量，其次默认值
    const envVar = process.env.OPENCLAW_STATE_DIR;
    if (envVar && typeof envVar === 'string' && envVar.trim()) {
      return path.resolve(envVar.trim());
    }
    // 默认：~/.openclaw/state 或 ~/.clawStates
    const homeDir = os.homedir();
    return path.join(homeDir, '.openclaw', 'state');
  }

  /**
   * 标准化 agent id（转小写）
   */
  private normalizeAgentId(id: string): string {
    return id.trim().toLowerCase();
  }

  /**
   * 解析用户路径（展开 ~ 等）
   * 参考：external-refs/openclaw/src/utils.ts
   */
  private resolveUserPath(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return path.resolve(p);
  }

  /**
   * 移除 null 字节（防止 ENOTDIR 错误）
   * 参考：external-refs/openclaw/src/agents/agent-scope.ts
   */
  private stripNullBytes(s: string): string {
    return s.replace(/\0/g, '');
  }

  /**
   * 验证路径是否在 workspace 根目录内（防止路径遍历攻击）
   */
  private validatePath(requestedPath: string | string[]): string {
    // wildcard 参数可能是数组，取第一个元素
    const pathStr = Array.isArray(requestedPath) ? requestedPath[0] : requestedPath;
    const resolved = path.resolve(this.workspaceRoot, pathStr);
    // 严格检查：必须是 workspaceRoot 本身或其子目录（需要 path.sep 防止绕过）
    if (
      resolved !== this.workspaceRoot &&
      !resolved.startsWith(this.workspaceRoot + path.sep)
    ) {
      throw new Error('Access denied: Path traversal detected');
    }
    return resolved;
  }

  /**
   * 获取目录树结构
   */
  @Get('tree')
  async getTree(@Query('path') queryPath?: string) {
    const targetPath = queryPath
      ? this.validatePath(queryPath)
      : this.workspaceRoot;

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        return { error: 'Not a directory' };
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const children = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetPath, entry.name);
          const relativePath = path.relative(this.workspaceRoot, fullPath);

          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: relativePath,
              type: 'directory',
              children: null, // 懒加载
            };
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            return {
              name: entry.name,
              path: relativePath,
              type: 'file',
              ext,
              size: (await fs.stat(fullPath)).size,
            };
          }
        }),
      );

      // 按目录优先排序
      children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      const relativeRoot = path.relative(this.workspaceRoot, targetPath);
      return {
        path: relativeRoot || '.',
        absolutePath: targetPath,
        children,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: message };
    }
  }

  /**
   * 获取文件内容
   */
  @Get('file/*path')
  async getFile(@Param('path') filePath: string | string[], @Res() res: Response) {
    try {
      // wildcard 参数可能是数组，取第一个元素
      const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;
      const fullPath = this.validatePath(pathStr);
      console.log('[WorkspaceController] Requested path:', pathStr);
      console.log('[WorkspaceController] Full path:', fullPath);
      console.log('[WorkspaceController] Workspace root:', this.workspaceRoot);
      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Not a file' });
      }

      // 大文件限制（1MB）
      const MAX_FILE_SIZE = 1 * 1024 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'File too large to preview (max 1MB)',
          size: stat.size,
        });
      }

      const ext = path.extname(fullPath).toLowerCase();
      const content = await fs.readFile(fullPath, 'utf-8');

      // HTML 文件特殊处理 - 返回原始内容供 iframe 使用
      if (ext === '.html' || ext === '.htm') {
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(content);
      }

      // 其他文件返回 JSON
      return res.json({
        path: pathStr,
        name: path.basename(fullPath),
        ext,
        size: stat.size,
        content,
      });
    } catch (error) {
      console.error('[WorkspaceController] Error:', error);
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ error: 'File not found' });
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: message });
    }
  }
}
