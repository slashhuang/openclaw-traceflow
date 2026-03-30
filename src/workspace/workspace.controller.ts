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
   * 解析 workspace 目录（复用 OpenClaw 降级逻辑）
   * 降级顺序：
   * 1. 配置文件中的 agent workspace 配置（~/.openclaw/openclaw.json 或 OPENCLAW_CONFIG_PATH）
   * 2. agents.defaults.workspace 配置
   * 3. 环境变量 OPENCLAW_WORKSPACE_DIR
   * 4. 环境变量 OPENCLAW_PROFILE（如果有，非 default）
   * 5. 默认值：~/.openclaw/workspace
   */
  private resolveWorkspaceDir(): string {
    // 1. 尝试读取配置文件
    const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
    try {
      if (fsSync.existsSync(configPath)) {
        const configContent = fsSync.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        // 1a. 检查 agent 配置（main agent）
        const agentConfig = config.agents?.list?.find((a: any) => a.id === 'main');
        if (agentConfig?.workspace?.trim()) {
          const resolved = this.resolveUserPath(agentConfig.workspace.trim());
          console.log('[WorkspaceController] Using agent workspace config:', resolved);
          return resolved;
        }
        
        // 1b. 检查 agents.defaults.workspace
        if (config.agents?.defaults?.workspace?.trim()) {
          const resolved = this.resolveUserPath(config.agents.defaults.workspace.trim());
          console.log('[WorkspaceController] Using agents.defaults.workspace:', resolved);
          return resolved;
        }
      }
    } catch (error) {
      console.warn('[WorkspaceController] Failed to read config:', error instanceof Error ? error.message : error);
    }

    // 2. 环境变量 OPENCLAW_WORKSPACE_DIR
    const envVar = process.env.OPENCLAW_WORKSPACE_DIR;
    if (envVar && typeof envVar === 'string' && envVar.trim()) {
      const resolved = path.resolve(envVar.trim());
      console.log('[WorkspaceController] Using OPENCLAW_WORKSPACE_DIR:', resolved);
      return resolved;
    }

    // 3. OPENCLAW_PROFILE（如果有，非 default）
    const profile = process.env.OPENCLAW_PROFILE?.trim();
    if (profile && profile.toLowerCase() !== 'default') {
      const homeDir = os.homedir();
      const resolved = path.join(homeDir, '.openclaw', `workspace-${profile}`);
      console.log('[WorkspaceController] Using OPENCLAW_PROFILE:', resolved);
      return resolved;
    }

    // 4. 默认值：~/.openclaw/workspace
    const homeDir = os.homedir();
    const resolved = path.join(homeDir, '.openclaw', 'workspace');
    console.log('[WorkspaceController] Using default workspace:', resolved);
    return resolved;
  }

  /**
   * 解析用户路径（展开 ~ 等）
   */
  private resolveUserPath(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return path.resolve(p);
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
