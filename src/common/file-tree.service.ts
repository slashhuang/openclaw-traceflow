import { Injectable, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 文件树节点接口
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  size?: number;
  children?: FileTreeNode[] | null;
}

/**
 * 目录树响应结构
 */
export interface TreeResponse {
  path: string;
  absolutePath: string;
  children: FileTreeNode[];
}

/**
 * 文件内容响应结构
 */
export interface FileResponse {
  path: string;
  name: string;
  ext: string;
  size: number;
  content: string;
}

/**
 * 通用文件树服务
 * 提供目录树浏览和文件内容读取功能
 */
@Injectable()
export class FileTreeService {
  /**
   * 验证路径是否在根目录内（防止路径遍历攻击）
   */
  validatePath(root: string, requestedPath: string | string[]): string {
    const pathStr = Array.isArray(requestedPath) ? requestedPath[0] : requestedPath;
    const resolved = path.resolve(root, pathStr);
    if (
      resolved !== root &&
      !resolved.startsWith(root + path.sep)
    ) {
      throw new Error('Access denied: Path traversal detected');
    }
    return resolved;
  }

  /**
   * 获取目录树结构
   */
  async getTree(root: string, queryPath?: string): Promise<TreeResponse | { error: string }> {
    const targetPath = queryPath
      ? this.validatePath(root, queryPath)
      : root;

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        return { error: 'Not a directory' };
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const children = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetPath, entry.name);
          const relativePath = path.relative(root, fullPath);

          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: relativePath,
              type: 'directory' as const,
              children: null, // 懒加载
            };
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            return {
              name: entry.name,
              path: relativePath,
              type: 'file' as const,
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

      const relativeRoot = path.relative(root, targetPath);
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
  async getFile(
    root: string,
    filePath: string | string[],
    res: Response,
  ): Promise<void> {
    try {
      // wildcard 参数可能是数组（NestJS 会将 /*path 拆分为数组），需要 join
      const pathStr = Array.isArray(filePath) ? filePath.join('/') : filePath;
      const fullPath = this.validatePath(root, pathStr);
      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Not a file' });
        return;
      }

      // 大文件限制（1MB）
      const MAX_FILE_SIZE = 1 * 1024 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'File too large to preview (max 1MB)',
          size: stat.size,
        });
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const content = await fs.readFile(fullPath, 'utf-8');

      // HTML 文件特殊处理 - 返回原始内容供 iframe 使用
      if (ext === '.html' || ext === '.htm') {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(content);
        return;
      }

      // 其他文件返回 JSON
      res.json({
        path: pathStr,
        name: path.basename(fullPath),
        ext,
        size: stat.size,
        content,
      } as FileResponse);
    } catch (error) {
      console.error('[FileTreeService] Error:', error);
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ error: 'File not found' });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: message });
    }
  }
}
