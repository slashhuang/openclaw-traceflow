import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

@Controller('api/workspace')
export class WorkspaceController {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = this.resolveWorkspaceDir();
  }

  /**
   * 解析 workspace 目录（复用 OpenClaw 降级逻辑）
   * 1. 环境变量 OPENCLAW_WORKSPACE_DIR
   * 2. 默认值：~/.openclaw/workspace
   */
  private resolveWorkspaceDir(): string {
    const envVar = process.env.OPENCLAW_WORKSPACE_DIR?.trim();
    if (envVar) {
      return path.resolve(envVar);
    }
    // 默认值：~/.openclaw/workspace
    const homeDir = os.homedir();
    return path.join(homeDir, '.openclaw', 'workspace');
  }

  /**
   * 验证路径是否在 workspace 根目录内（防止路径遍历攻击）
   */
  private validatePath(requestedPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, requestedPath);
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
  @Get('file/*')
  async getFile(@Param('0') filePath: string, @Res() res: Response) {
    try {
      const fullPath = this.validatePath(filePath);
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
        path: filePath,
        name: path.basename(fullPath),
        ext,
        size: stat.size,
        content,
      });
    } catch (error) {
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
