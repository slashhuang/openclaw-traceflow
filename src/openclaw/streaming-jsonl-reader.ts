/**
 * 流式 JSONL 读取器
 * 
 * 设计目标：
 * 1. 避免全量读取大文件导致内存暴涨
 * 2. 支持首尾分片读取（head_tail 模式）
 * 3. 恒定内存占用，不随文件大小增长
 */

import * as fs from 'fs';
import { Logger } from '@nestjs/common';

const logger = new Logger('StreamingJsonlReader');

export interface HeadTailResult {
  /** 头部行（最多 headLines 行） */
  headLines: string[];
  /** 尾部行（最多 tailLines 行） */
  tailLines: string[];
  /** 估算的总行数 */
  totalLines: number;
  /** 是否为部分读取（true 表示中间部分被跳过） */
  isPartial: boolean;
  /** 头部解析到的 JSON 对象 */
  headObjects: any[];
  /** 尾部解析到的 JSON 对象 */
  tailObjects: any[];
}

export interface ScanOptions {
  /** 头部读取行数（默认 15） */
  headLines?: number;
  /** 尾部读取行数（默认 10） */
  tailLines?: number;
  /** 头部缓冲区大小（字节，默认 64KB） */
  headBufferSize?: number;
  /** 尾部缓冲区大小（字节，默认 64KB） */
  tailBufferSize?: number;
  /** 扫描直到找到第一个 user 消息（最多扫描行数，0 表示不扫描） */
  scanForUser?: number;
}

/**
 * 流式读取 JSONL 文件的首尾分片
 * 
 * @param filePath - JSONL 文件路径
 * @param options - 读取选项
 */
export async function readJsonlHeadTail(
  filePath: string,
  options: ScanOptions = {},
): Promise<HeadTailResult> {
  const {
    headLines = 15,
    tailLines = 10,
    headBufferSize = 128 * 1024, // 128KB
    tailBufferSize = 2 * 1024 * 1024, // 2MB
    scanForUser = 100,
  } = options;

  const stats = await fs.promises.stat(filePath);
  const fd = await fs.promises.open(filePath, 'r');

  try {
    // 1. 读取头部
    const headBuffer = Buffer.alloc(headBufferSize);
    const headRead = await fd.read(headBuffer, 0, headBufferSize, 0);
    const headText = headBuffer.toString('utf-8', 0, headRead.bytesRead);
    const allHeadLines = headText.split('\n').filter((l) => l.trim());
    const head = allHeadLines.slice(0, headLines);
    const headObjects = head.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // 2. 估算平均行大小和总行数
    const avgLineSize = headRead.bytesRead / allHeadLines.length || 400;
    const estimatedTotalLines = Math.round(stats.size / avgLineSize);

    // 3. 如果文件小，直接读取全部
    if (estimatedTotalLines <= headLines + tailLines) {
      const fullText = await fs.promises.readFile(filePath, 'utf-8');
      const fullLines = fullText.split('\n').filter((l) => l.trim());
      const fullObjects = fullLines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return {
        headLines: fullLines,
        tailLines: [],
        totalLines: fullLines.length,
        isPartial: false,
        headObjects: fullObjects,
        tailObjects: [],
      };
    }

    // 4. 如果需要扫描 user 信息且头部没找到，继续扫描
    let extraLines: string[] = [];
    let extraObjects: any[] = [];
    
    if (scanForUser > 0 && headLines < scanForUser) {
      let foundUser = headObjects.some((obj) => 
        obj?.user || obj?.message?.sender || obj?.message?.senderLabel
      );

      if (!foundUser) {
        // 需要继续扫描
        const scanStart = headRead.bytesRead;
        const scanSize = (scanForUser - headLines) * avgLineSize * 2;
        const scanBuffer = Buffer.alloc(Math.min(scanSize, 512 * 1024));
        const scanRead = await fd.read(scanBuffer, 0, scanBuffer.length, scanStart);
        const scanText = scanBuffer.toString('utf-8', 0, scanRead.bytesRead);
        extraLines = scanText.split('\n').filter((l) => l.trim());
        extraObjects = extraLines.map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        // 合并到 head
        const combinedLines = [...head, ...extraLines].slice(0, scanForUser);
        return {
          headLines: combinedLines,
          tailLines: [],
          totalLines: estimatedTotalLines,
          isPartial: true,
          headObjects: [...headObjects, ...extraObjects].slice(0, scanForUser),
          tailObjects: [],
        };
      }
    }

    // 5. 读取尾部（seek 到文件末尾）
    const actualTailBufferSize = Math.min(tailBufferSize, stats.size / 4);
    const tailBuffer = Buffer.alloc(actualTailBufferSize);
    const tailStart = Math.max(0, stats.size - actualTailBufferSize);
    const tailRead = await fd.read(tailBuffer, 0, actualTailBufferSize, tailStart);
    const tailText = tailBuffer.toString('utf-8', 0, tailRead.bytesRead);
    const allTailLines = tailText.split('\n').filter((l) => l.trim());
    const tail = allTailLines.slice(-tailLines);
    const tailObjects = tail.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return {
      headLines: head,
      tailLines: tail,
      totalLines: estimatedTotalLines,
      isPartial: true,
      headObjects,
      tailObjects,
    };
  } catch (error) {
    logger.error(`Failed to read JSONL head/tail: ${error.message}`);
    throw error;
  } finally {
    await fd.close();
  }
}

/**
 * 流式扫描 JSONL 文件提取特定信息（不加载整个文件）
 */
export interface ScanResult {
  userId?: string;
  messageCount: number;
  distinctSenders: string[];
  totalTokens?: number;
  hasCostField: boolean;
  usageCost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export async function scanJsonlForMetadata(
  filePath: string,
  maxLines = 1000,
): Promise<ScanResult> {
  const fd = await fs.promises.open(filePath, 'r');
  const stats = await fs.promises.stat(filePath);

  try {
    const result: ScanResult = {
      messageCount: 0,
      distinctSenders: [],
      hasCostField: false,
      usageCost: undefined,
    };

    const senderSet = new Set<string>();
    let sumCostInput = 0;
    let sumCostOutput = 0;
    let sumCostCacheRead = 0;
    let sumCostCacheWrite = 0;
    let sumCostTotal = 0;

    // 分块读取
    const chunkSize = 1024 * 1024; // 1MB chunks
    let offset = 0;
    let linesProcessed = 0;
    let buffer = '';

    while (offset < stats.size && linesProcessed < maxLines) {
      const readSize = Math.min(chunkSize, stats.size - offset);
      const readBuffer = Buffer.alloc(readSize);
      const read = await fd.read(readBuffer, 0, readSize, offset);
      
      buffer += readBuffer.toString('utf-8', 0, read.bytesRead);
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一行（可能不完整）

      for (const line of lines) {
        if (!line.trim()) continue;
        linesProcessed++;

        try {
          const entry = JSON.parse(line);

          // 提取 userId
          if (!result.userId) {
            const sender = extractSenderFromEntry(entry);
            if (sender) {
              result.userId = sender;
            }
          }

          // 统计 messageCount
          if (entry?.message != null) {
            result.messageCount++;
          }

          // 提取 sender
          const sender = extractSenderFromEntry(entry);
          if (sender && !senderSet.has(sender)) {
            senderSet.add(sender);
          }

          // 提取 usage
          const usage = entry?.message?.usage || entry?.tokenUsage;
          if (usage && typeof usage.totalTokens === 'number') {
            result.totalTokens = usage.totalTokens;
          }

          // 提取 cost
          const cost = usage?.cost;
          if (cost && typeof cost === 'object' && typeof cost.total === 'number') {
            result.hasCostField = true;
            sumCostInput += typeof cost.input === 'number' ? cost.input : 0;
            sumCostOutput += typeof cost.output === 'number' ? cost.output : 0;
            sumCostCacheRead += typeof cost.cacheRead === 'number' ? cost.cacheRead : 0;
            sumCostCacheWrite += typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0;
            sumCostTotal += cost.total;
          }
        } catch {
          // 跳过解析失败的行
        }

        if (linesProcessed >= maxLines) break;
      }

      offset += read.bytesRead;
    }

    result.distinctSenders = Array.from(senderSet);
    
    if (result.hasCostField) {
      result.usageCost = {
        input: sumCostInput,
        output: sumCostOutput,
        cacheRead: sumCostCacheRead,
        cacheWrite: sumCostCacheWrite,
        total: sumCostTotal,
      };
    }

    return result;
  } finally {
    await fd.close();
  }
}

/**
 * 从 JSONL 条目中提取 sender
 */
function extractSenderFromEntry(entry: any): string | null {
  if (entry?.user && typeof entry.user === 'string' && entry.user.trim()) {
    return entry.user.trim();
  }

  const msg = entry?.message;
  if (!msg) return null;

  if (typeof msg.senderLabel === 'string' && msg.senderLabel.trim()) {
    return msg.senderLabel.trim();
  }

  if (typeof msg.sender === 'string' && msg.sender.trim()) {
    return msg.sender.trim();
  }

  return null;
}
