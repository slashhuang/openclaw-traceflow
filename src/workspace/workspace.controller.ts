import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { OpenClawService } from '../openclaw/openclaw.service';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(private readonly openClawService: OpenClawService) {}

  /**
   * 从 OpenClawService 获取 workspace 根目录（与 SystemPrompt / Setup 等模块保持一致）。
   * 降级：若 getResolvedPaths() 未解析到 workspaceDir，退化为 ~/.openclaw/workspace。
   */
  private async getWorkspaceRoot(): Promise<string> {
    try {
      const paths = await this.openClawService.getResolvedPaths();
      if (paths.workspaceDir?.trim()) {
        return paths.workspaceDir.trim();
      }
    } catch (err) {
      console.warn(
        '[WorkspaceController] getResolvedPaths failed, falling back to default:',
        err instanceof Error ? err.message : err,
      );
    }
    return path.join(os.homedir(), '.openclaw', 'workspace');
  }

  /**
   * 验证路径是否在 workspace 根目录内（防止路径遍历攻击）
   */
  private validatePath(workspaceRoot: string, requestedPath: string | string[]): string {
    const pathStr = Array.isArray(requestedPath) ? requestedPath[0] : requestedPath;
    const resolved = path.resolve(workspaceRoot, pathStr);
    if (
      resolved !== workspaceRoot &&
      !resolved.startsWith(workspaceRoot + path.sep)
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
    const workspaceRoot = await this.getWorkspaceRoot();
    const targetPath = queryPath
      ? this.validatePath(workspaceRoot, queryPath)
      : workspaceRoot;

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        return { error: 'Not a directory' };
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const children = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetPath, entry.name);
          const relativePath = path.relative(workspaceRoot, fullPath);

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

      const relativeRoot = path.relative(workspaceRoot, targetPath);
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
    const workspaceRoot = await this.getWorkspaceRoot();
    try {
      // wildcard 参数可能是数组，取第一个元素
      const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;
      const fullPath = this.validatePath(workspaceRoot, pathStr);
      console.log('[WorkspaceController] Requested path:', pathStr);
      console.log('[WorkspaceController] Full path:', fullPath);
      console.log('[WorkspaceController] Workspace root:', workspaceRoot);
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
