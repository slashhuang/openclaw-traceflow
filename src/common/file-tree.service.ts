import { Injectable, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Stats } from 'fs';

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
  // 大文件预览相关
  isLargeFile?: boolean;
  createdAt?: string;
  modifiedAt?: string;
  preview?: {
    head: string;  // 前 10 行
    tail: string;  // 后 10 行
    totalLines: number;
    message: string;
  };
}

/**
 * 文件写入请求体
 */
export interface FileWriteRequest {
  content: string;
  /** 可选：用于乐观并发控制，与当前文件的 mtimeMs 一致 */
  expectedMtimeMs?: number;
}

/**
 * 文件写入响应
 */
export interface FileWriteResponse {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  mtimeMs: number;
}

/**
 * 通用文件树服务
 * 提供目录树浏览和文件内容读取/写入功能
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

      const ext = path.extname(fullPath).toLowerCase();
      const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

      // HTML 文件特殊处理 - 返回原始内容供 iframe 使用
      if (ext === '.html' || ext === '.htm') {
        const content = await fs.readFile(fullPath, 'utf-8');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(content);
        return;
      }

      // 大文件优化预览
      if (stat.size > MAX_FILE_SIZE) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const totalLines = lines.length;
        
        // 性能可控：只读取前 10 行和后 10 行
        const PREVIEW_LINES = 10;
        const head = lines.slice(0, PREVIEW_LINES).join('\n');
        const tail = lines.slice(-PREVIEW_LINES).join('\n');
        
        res.json({
          path: pathStr,
          name: path.basename(fullPath),
          ext,
          size: stat.size,
          isLargeFile: true,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          preview: {
            head,
            tail,
            totalLines,
            message: `文件过大（${this.formatSize(stat.size)}），仅显示前 ${PREVIEW_LINES} 行和后 ${PREVIEW_LINES} 行，共 ${totalLines} 行`,
          },
          content: head + '\n\n... [中间内容已隐藏] ...\n\n' + tail,
        } as FileResponse);
        return;
      }

      // 小文件直接返回完整内容
      const content = await fs.readFile(fullPath, 'utf-8');
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

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * 写入文件内容
   */
  async writeFile(
    root: string,
    filePath: string | string[],
    body: FileWriteRequest,
  ): Promise<FileWriteResponse> {
    const pathStr = Array.isArray(filePath) ? filePath.join('/') : filePath;
    const fullPath = this.validatePath(root, pathStr);

    // 验证文件存在并获取当前 mtime
    let stat: Stats;
    try {
      stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        throw new Error('Not a file');
      }

      // 乐观并发控制：如果提供了 expectedMtimeMs，验证是否匹配
      if (body.expectedMtimeMs !== undefined) {
        if (stat.mtimeMs !== body.expectedMtimeMs) {
          throw new Error(
            `文件已被修改（期望 mtimeMs: ${body.expectedMtimeMs}, 实际：${stat.mtimeMs}）`,
          );
        }
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error('文件不存在');
      }
      throw error;
    }

    // 写入文件
    await fs.writeFile(fullPath, body.content, 'utf-8');

    // 重新获取统计信息
    const newStat = await fs.stat(fullPath);

    return {
      path: pathStr,
      name: path.basename(fullPath),
      size: newStat.size,
      modifiedAt: newStat.mtime.toISOString(),
      mtimeMs: newStat.mtimeMs,
    };
  }

  /**
   * 删除文件
   */
  async deleteFile(
    root: string,
    filePath: string | string[],
  ): Promise<{ success: boolean; path: string }> {
    const pathStr = Array.isArray(filePath) ? filePath.join('/') : filePath;
    const fullPath = this.validatePath(root, pathStr);

    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        throw new Error('只能删除文件，不能删除目录');
      }

      await fs.unlink(fullPath);

      return { success: true, path: pathStr };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error('文件不存在');
      }
      throw error;
    }
  }
}
