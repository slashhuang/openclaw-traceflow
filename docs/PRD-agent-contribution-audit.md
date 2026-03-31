# PRD: OpenClaw Agent 贡献审计系统

**版本**: v1.4
**日期**: 2026-03-31
**作者**: wave前端马龙 (bot) + 黄晓刚 (产品方向)
**状态**: 草稿待评审

---

## 1. 产品定位

> 基于 OpenClaw transcript JSONL 的增量审计系统，用定时任务 + 锚点机制低负荷地回答："这个 Agent 给团队交付了什么？"

Phase 1 作为独立 skill + 定时任务先跑起来，Phase 2 可集成到 TraceFlow `/audit` 页面。

---

## 2. 核心审计维度

只有两个：

### 维度一：代码交付

谁通过 Agent 交付了代码（MR）。

| 指标 | 定义 |
|------|------|
| 发起人 | 谁让 bot 写/提交代码 |
| MR 数量 | bot 创建的 MR 总数 |
| 涉及仓库 | 哪些仓库 |

### 维度二：问答服务

Agent 回答了多少人的多少问题，问题的类型是什么。

| 指标 | 定义 |
|------|------|
| 服务人数 | 去重 sender 数 |
| 问题总数 | user role message 数（排除 system event） |
| 每人问题数 | 按 sender 分组计数 |
| 问题标签 | 基于 tool call 的规则分类 |

---

## 3. 锚点增量扫描

### 3.1 关键洞察

OpenClaw transcript JSONL 是 **append-only**：已写入的行不变，`/new` 时 rename 为 `*.jsonl.reset.*`。

**只需记住每个文件"上次处理到第几字节"，下次从该位置继续读。**

### 3.2 锚点

```jsonc
// .openclawAudits/anchors.json
{
  "version": 1,
  "lastRunAt": "2026-03-31T15:00:00Z",
  "files": {
    "244eae7f-....jsonl": {
      "byteOffset": 45230,
      "lineCount": 58,
      "sessionKey": "agent:main:wave:prod-bot:direct:ou_xxx",
      "status": "active"
    }
  }
}
```

### 3.3 扫描流程

```
cron 每天 23:00（也支持手动触发）
  → 读 anchors.json
  → 遍历 sessions/*.jsonl
  → 新文件从头扫 / 已知文件从 byteOffset 续读 / 无变化跳过
  → 逐行解析，提取审计事件 → append 到 events/YYYY-MM.jsonl
  → 更新 anchors.json
  → 重建 snapshot
```

用 `fs.createReadStream({ start: byteOffset })` 直接定位，O(新增部分)。

---

## 4. 审计事件提取

### 4.1 提取规则

| JSONL type | 提取内容 |
|------------|---------|
| `session` | sessionId, sessionKey |
| `message` (role=user) | sender_id（从 metadata block 提取）、用户消息全文（去除 metadata，10KB 截断） |
| `message` (role=assistant, content 含 toolCall) | toolName、exec command、read path |
| `message` (role=assistant, 含 usage) | token 消耗 |

### 4.2 标签分类（规则引擎，零 LLM）

一个 turn = user → [assistant + toolCall*] → assistant(final)。从 toolCall 的 name 和 arguments 判断标签：

| 信号 | 标签 |
|------|------|
| exec 含 `gitlab-mr.mjs --create` | `code/mr-create` |
| exec 含 `git push` / `git commit` | `code/push` / `code/commit` |
| exec 含 `tapd-bug` / `tapd-task` | `tapd/bug` / `tapd/task` |
| wave_search_documents 或 read skills/wave-km | `knowledge-base` |
| 任意 `wave_*` 工具 | `wave-api` |
| read `skills/<name>/` | `skill/<name>` |
| 无 tool call | `general-qa` |

一个 turn 可有多个标签。

### 4.3 代码交付识别

turn 内出现 `gitlab-mr.mjs --create` 的 exec → 从参数提取 project/source/target，从 assistant 回复提取 MR URL。

### 4.4 Sender ID 归一化

同一个人可能以 `xiaogang.h` 或 `ou_f2f169da1b41e2b279b9b31741b5174f` 出现。
扫描时从 `USER.md` 构建 userId ↔ unionId 映射，聚合时统一为 userId。

---

## 5. 数据结构

### 5.1 目录

```
~/.openclaw/workspace/.openclawAudits/
├── anchors.json
├── events/
│   └── 2026-03.jsonl      # 按月分片，append-only
└── snapshots/
    ├── latest.json
    └── 2026-03.json
```

### 5.2 审计事件

```jsonc
// events/2026-03.jsonl
// 问答
{ "type": "qa", "timestamp": "...", "sessionId": "...", "senderId": "xiaogang.h", "senderName": "黄晓刚", "tags": ["tapd", "code/mr"], "userMessage": "帮我查下这个Bug...", "tokenUsage": { "input": 55172, "output": 1523 }, "turnIndex": 3 }

// 代码交付
{ "type": "code_delivery", "timestamp": "...", "sessionId": "...", "senderId": "xiaogang.h", "mr": { "project": "wave-openclaw-wrapper", "iid": 95, "url": "...", "sourceBranch": "...", "targetBranch": "main" }, "tokenUsage": { "input": 82000, "output": 3500 } }

// 自动化
{ "type": "automation", "timestamp": "...", "sessionId": "...", "automationType": "daily-ai-news", "tokenUsage": { "input": 120000, "output": 5000 } }
```

### 5.3 快照

```jsonc
// snapshots/latest.json
{
  "generatedAt": "...",
  "codeDelivery": {
    "totalMRs": 6,
    "byInitiator": {
      "xiaogang.h": { "displayName": "黄晓刚", "total": 3, "repos": ["wave-openclaw-wrapper"] }
    },
    "byRepo": { "wave-openclaw-wrapper": 5, "stellar-fe": 1 }
  },
  "qaService": {
    "totalQuestions": 196,
    "uniqueUsers": 16,
    "byUser": {
      "xiaogang.h": { "displayName": "黄晓刚", "questions": 60, "tags": { "code/mr": 10, "general-qa": 16 } }
    },
    "byTag": { "general-qa": 78, "code/mr": 23, "wave-api": 21 }
  },
  "automation": { "totalRuns": 4, "byType": { "daily-ai-news": 1 } },
  "cost": { "totalInputTokens": 134183870, "totalOutputTokens": 461591 }
}
```

### 5.4 团队成员

从 `USER.md` 自动推断（解析 `Wave: userId, unionId` 行），不需要配置文件。

---

## 6. 消费方式

### 6.1 采集零 LLM，报表用 LLM

| 阶段 | 方式 | LLM 消耗 |
|------|------|---------|
| 采集（每天 23:00 / 手动） | 规则引擎 + 存 userMessage 全文 | 零 |
| 报表（月度/按需） | 聚合数据 + 采样 userMessage → LLM 总结 | ~3500 tokens/次 |

### 6.2 报表示例

```
📊 Bot 贡献月报 (2026-03)

## AI 总结
本月 bot 服务了 16 位用户。
代码方面：帮晓刚创建了 3 个 MR（审计 PRD、self-improving-agent 等），
帮坚圣提交了 2 个 MR（stellar-fe + wave-openclaw-wrapper）...
问答方面：高频场景是通用问答(78次)、MR 相关(23次)、Wave API(21次)...

## 📊 详细数据
| 用户 | 问题数 | Top 标签 |
|------|--------|---------|
| 黄晓刚 | 60 | MR(10), 通用(16), code/push(5) |
| 马达 | 48 | 通用(26), Wave(8) |
...
```

---

## 7. 实施计划

### Phase 1：采集 + 报表（已完成大部分）

- [x] 增量扫描器 `scripts/audit-scanner.mjs`
- [x] 标签规则引擎（内置）
- [x] 快照聚合（内置）
- [ ] Cron job 配置
- [ ] 月度报表生成 + Wave 推送

### Phase 2：TraceFlow 集成（按需）

TraceFlow 读取 `snapshots/latest.json` 展示 `/audit` 页面。

---

## 8. 不做的事情

| 不做 | 原因 |
|------|------|
| 自动满意度评估 | 准确率不够 |
| 人效 ROI 计算 | 没有对照组 |
| 实时 dashboard | 每天一次足够 |
| 采集阶段用 LLM | 规则引擎够用 |

---

**下一步**：晓刚 review，确认后配置 cron job + 月报推送。
 skills/agent-audit/scripts/audit-scanner.mjs  0 → 100644
+
725
−
0

Viewed
#!/usr/bin/env node

/**
 * Agent 贡献审计扫描器
 *
 * 增量扫描 OpenClaw transcript JSONL，提取审计事件。
 * 用 byteOffset 锚点实现 O(新增行) 的增量处理。
 *
 * Usage:
 *   node audit-scanner.mjs                    # 增量扫描
 *   node audit-scanner.mjs --full             # 全量重扫
 *   node audit-scanner.mjs --snapshot         # 仅重建快照
 *   node audit-scanner.mjs --sessions-dir <path>  # 指定 sessions 目录
 *   node audit-scanner.mjs --audit-dir <path>     # 指定审计输出目录
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

// ─── Defaults ───────────────────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || '/root';

function resolveDefault(envKey, fallback) {
  return process.env[envKey] || fallback;
}

const DEFAULT_SESSIONS_DIR = resolveDefault(
  'OPENCLAW_SESSIONS_DIR',
  path.join(HOME, '.openclaw/agents/main/sessions'),
);
const DEFAULT_AUDIT_DIR = resolveDefault(
  'OPENCLAW_AUDIT_DIR',
  path.join(HOME, '.openclaw/workspace/.openclawAudits'),
);
const DEFAULT_USERMD_PATH = resolveDefault(
  'OPENCLAW_USERMD_PATH',
  path.join(HOME, '.openclaw/workspace/USER.md'),
);

const MAX_USER_MESSAGE_BYTES = 10 * 1024; // 10KB

// ─── CLI args ───────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  full: args.includes('--full'),
  snapshotOnly: args.includes('--snapshot'),
};
function argVal(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const sessionsDir = argVal('--sessions-dir') || DEFAULT_SESSIONS_DIR;
const auditDir = argVal('--audit-dir') || DEFAULT_AUDIT_DIR;
const userMdPath = argVal('--user-md') || DEFAULT_USERMD_PATH;

// ─── Team members from USER.md ──────────────────────────────

function loadTeamMembers(mdPath) {
  const members = new Map(); // userId -> { unionId, displayName }
  // Also try preset USER.md if workspace one is sparse
  const paths = [mdPath];
  // Try preset path as fallback
  const presetPath = mdPath.replace(/\.openclaw\/workspace\/USER\.md$/, '')
    + '../../../wave-fe-agent-preset/USER.md';

  try {
    const text = fs.readFileSync(mdPath, 'utf-8');
    // Also try to read preset USER.md (more complete member list)
    let presetText = '';
    for (const candidate of [
      path.resolve(mdPath, '../../../wave-fe-agent-preset/USER.md'),
      path.resolve(mdPath, '../../../../wave-fe-agent-preset/USER.md'),
      path.resolve(mdPath, '../../../../../wave-fe-agent-preset/USER.md'),
    ]) {
      try { presetText = fs.readFileSync(candidate, 'utf-8'); break; } catch {}
    }

    const fullText = text + '\n' + presetText;

    let currentName = null;
    for (const line of fullText.split('\n')) {
      const headerMatch = line.match(/^##\s+(.+)/);
      if (headerMatch) {
        currentName = headerMatch[1].trim();
        continue;
      }
      // Format 1: "- Wave: userId, ou_xxx"
      let waveMatch = line.match(/Wave:\s*(\S+)\s*,\s*(ou_\w+)/);
      // Format 2: "Wave user_id: userId, union_id: ou_xxx"
      if (!waveMatch) {
        waveMatch = line.match(/user_id:\s*(\S+)\s*,\s*union_id:\s*(ou_\w+)/);
      }
      if (waveMatch && currentName) {
        const [, userId, unionId] = waveMatch;
        members.set(userId, { unionId, displayName: currentName });
        members.set(unionId, { userId, displayName: currentName });
      }
    }
  } catch {
    console.warn(`[audit] Warning: Could not read USER.md at ${mdPath}`);
  }
  return members;
}

// ─── Metadata extraction from user message ──────────────────

const SENDER_ID_RE = /"sender_id"\s*:\s*"([^"]+)"/;
const SENDER_NAME_RE = /"sender"\s*:\s*"([^"]+)"/;
const METADATA_BLOCK_RE = /(?:Conversation info|Sender)\s*\(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/g;

function extractSenderFromContent(content) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(c => (typeof c === 'string' ? c : c.text || '')).join('\n')
      : '';

  const idMatch = text.match(SENDER_ID_RE);
  const nameMatch = text.match(SENDER_NAME_RE);
  return {
    senderId: idMatch?.[1] || null,
    senderName: nameMatch?.[1] || null,
  };
}

function extractUserMessage(content) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(c => (typeof c === 'string' ? c : c.text || '')).join('\n')
      : '';

  // Strip metadata blocks, trim
  let cleaned = text.replace(METADATA_BLOCK_RE, '').trim();

  // Truncate to 10KB
  if (Buffer.byteLength(cleaned, 'utf-8') > MAX_USER_MESSAGE_BYTES) {
    const buf = Buffer.from(cleaned, 'utf-8');
    cleaned = buf.subarray(0, MAX_USER_MESSAGE_BYTES).toString('utf-8') + '... [truncated]';
  }
  return cleaned;
}

// ─── Session key parsing ────────────────────────────────────

function parseSessionKey(key) {
  // agent:main:wave:prod-bot:direct:ou_xxx  → { channel: 'wave', chatType: 'direct', target: 'ou_xxx' }
  // agent:main:wave:group:oc_xxx             → { channel: 'wave', chatType: 'group', target: 'oc_xxx' }
  // agent:main:cron:xxx                      → { channel: 'cron', chatType: 'cron', target: null }
  // agent:main:hook:tapd-bug:xxx             → { channel: 'hook', chatType: 'hook', target: null }
  const parts = key.split(':');
  if (parts.length >= 4 && parts[2] === 'wave') {
    if (parts[3] === 'group') {
      return { channel: 'wave', chatType: 'group', target: parts[4] || null };
    }
    // direct: agent:main:wave:<account>:direct:<union_id>
    const directIdx = parts.indexOf('direct');
    if (directIdx >= 0) {
      return { channel: 'wave', chatType: 'direct', target: parts[directIdx + 1] || null };
    }
    return { channel: 'wave', chatType: 'unknown', target: null };
  }
  if (parts.length >= 3 && parts[2] === 'cron') {
    return { channel: 'cron', chatType: 'cron', target: null };
  }
  if (parts.length >= 3 && parts[2] === 'hook') {
    return { channel: 'hook', chatType: 'hook', target: parts[3] || null };
  }
  return { channel: parts[2] || 'unknown', chatType: 'unknown', target: null };
}

// ─── Tag classification (rule engine) ───────────────────────

const TAG_RULES = [
  // Priority 1: Code delivery
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /gitlab-mr\.mjs\s+--create/.test(c)), tag: 'code/mr-create' },
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /git\s+push/.test(c)), tag: 'code/push' },
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /git\s+commit/.test(c)), tag: 'code/commit' },
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /gitlab-mr/.test(c)), tag: 'code/mr' },

  // Priority 2: TAPD
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /tapd-bug/.test(c)), tag: 'tapd/bug' },
  { test: (ctx) => ctx.toolNames.has('exec') && ctx.execCommands.some(c => /tapd-task/.test(c)), tag: 'tapd/task' },

  // Priority 2: Knowledge base
  { test: (ctx) => ctx.toolNames.has('wave_search_documents'), tag: 'knowledge-base' },
  { test: (ctx) => ctx.skillsUsed.has('wave-km') || ctx.skillsUsed.has('km-docs'), tag: 'knowledge-base' },

  // Priority 3: Wave API
  { test: (ctx) => [...ctx.toolNames].some(t => t.startsWith('wave_')), tag: 'wave-api' },

  // Priority 3: Skill-specific
  { test: (ctx) => ctx.skillsUsed.size > 0, tag: (ctx) => [...ctx.skillsUsed].map(s => `skill/${s}`) },

  // Priority 4: General
  { test: (ctx) => ctx.toolNames.size === 0, tag: 'general-qa' },
];

function classifyTurn(turnCtx) {
  const tags = new Set();
  for (const rule of TAG_RULES) {
    if (rule.test(turnCtx)) {
      const t = typeof rule.tag === 'function' ? rule.tag(turnCtx) : rule.tag;
      if (Array.isArray(t)) t.forEach(x => tags.add(x));
      else tags.add(t);
    }
  }
  if (tags.size === 0) tags.add('other');
  return [...tags];
}

// ─── MR extraction from exec commands ───────────────────────

function extractMRInfo(execCommands, assistantText) {
  for (const cmd of execCommands) {
    const createMatch = cmd.match(/gitlab-mr\.mjs\s+--create/);
    if (!createMatch) continue;

    const project = cmd.match(/--project\s+(\S+)/)?.[1] || 'unknown';
    const source = cmd.match(/--source\s+"?([^"\s]+)"?/)?.[1] || cmd.match(/--source\s+(\S+)/)?.[1] || 'unknown';
    const target = cmd.match(/--target\s+"?([^"\s]+)"?/)?.[1] || cmd.match(/--target\s+(\S+)/)?.[1] || 'main';

    // Try to extract MR IID and URL from assistant text
    const iidMatch = assistantText.match(/!(\d+)/);
    const urlMatch = assistantText.match(/(https:\/\/platgit\.\S+\/merge_requests\/\d+)/);

    return {
      project,
      sourceBranch: source,
      targetBranch: target,
      iid: iidMatch ? parseInt(iidMatch[1]) : null,
      url: urlMatch?.[1] || null,
    };
  }
  return null;
}

// ─── Skill detection from read paths ────────────────────────

function detectSkillsFromReads(readPaths) {
  const skills = new Set();
  for (const p of readPaths) {
    const match = p.match(/skills\/([^/]+)\//);
    if (match) skills.add(match[1]);
  }
  return skills;
}

// ─── Incremental JSONL scanner ──────────────────────────────

async function scanFile(filePath, startByte) {
  const lines = [];
  const stat = fs.statSync(filePath);
  if (startByte >= stat.size) return { lines, endByte: stat.size, lineCount: 0 };

  const stream = createReadStream(filePath, { start: startByte, encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let totalBytes = startByte;
  let lineCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      lines.push(obj);
      lineCount++;
    } catch {
      // Skip malformed lines
    }
    totalBytes += Buffer.byteLength(line, 'utf-8') + 1; // +1 for \n
  }

  return { lines, endByte: totalBytes, lineCount };
}

// ─── Turn processor ─────────────────────────────────────────

/**
 * Group JSONL lines into "turns" (user → assistant(s) + toolResult(s))
 * and extract audit events.
 */
function processLines(lines, sessionId, sessionKey, teamMembers) {
  const events = [];
  const parsed = parseSessionKey(sessionKey);

  let currentTurn = null;
  let turnIndex = 0;

  function flushTurn() {
    if (!currentTurn || !currentTurn.userMessage) return;

    const turnCtx = {
      toolNames: new Set(currentTurn.toolCalls.map(t => t.toolName).filter(Boolean)),
      execCommands: currentTurn.toolCalls
        .filter(t => t.toolName === 'exec' && t.command)
        .map(t => t.command),
      readPaths: currentTurn.toolCalls
        .filter(t => t.toolName === 'read' && t.path)
        .map(t => t.path),
      skillsUsed: detectSkillsFromReads(
        currentTurn.toolCalls
          .filter(t => t.toolName === 'read' && t.path)
          .map(t => t.path),
      ),
    };

    const tags = classifyTurn(turnCtx);
    const senderInfo = currentTurn.senderInfo;

    // Determine team membership
    // (kept for ID normalization only, not exposed in events)

    // Resolve sender unionId
    let senderUnionId = null;
    if (senderInfo.senderId && teamMembers.has(senderInfo.senderId)) {
      senderUnionId = teamMembers.get(senderInfo.senderId).unionId || null;
    }
    // Also try from session key target for direct chats
    if (!senderUnionId && parsed.chatType === 'direct' && parsed.target?.startsWith('ou_')) {
      senderUnionId = parsed.target;
    }

    // Build QA event
    const qaEvent = {
      type: 'qa',
      timestamp: currentTurn.timestamp,
      sessionId,
      sessionKey,
      senderId: senderInfo.senderId,
      senderName: senderInfo.senderName,
      senderUnionId,
      chatType: parsed.chatType,
      tags,
      userMessage: currentTurn.userMessageText,
      tokenUsage: currentTurn.tokenUsage,
      turnIndex,
    };
    events.push(qaEvent);

    // Check for code delivery
    const mrInfo = extractMRInfo(turnCtx.execCommands, currentTurn.assistantTexts.join('\n'));
    if (mrInfo) {
      events.push({
        type: 'code_delivery',
        timestamp: currentTurn.timestamp,
        sessionId,
        sessionKey,
        senderId: senderInfo.senderId,
        senderName: senderInfo.senderName,
        senderUnionId,
        mr: mrInfo,
        tokenUsage: currentTurn.tokenUsage,
      });
    }

    turnIndex++;
  }

  for (const obj of lines) {
    if (obj.type !== 'message') continue;
    const msg = obj.message;
    if (!msg) continue;

    if (msg.role === 'user') {
      // Flush previous turn
      flushTurn();

      const senderInfo = extractSenderFromContent(msg.content);
      const userMessageText = extractUserMessage(msg.content);

      // Skip system events (heartbeats, cron triggers, etc.)
      if (!senderInfo.senderId && parsed.chatType !== 'group') {
        currentTurn = null;
        continue;
      }

      currentTurn = {
        timestamp: obj.timestamp || new Date().toISOString(),
        senderInfo,
        userMessage: msg.content,
        userMessageText,
        toolResults: [],
        toolCalls: [],        // from assistant toolCall blocks
        assistantTexts: [],
        tokenUsage: { input: 0, output: 0 },
      };
    } else if (msg.role === 'toolResult' && currentTurn) {
      const toolInfo = {
        toolName: msg.toolName || null,
        command: null,
        path: null,
      };
      currentTurn.toolResults.push(toolInfo);
    } else if (msg.role === 'assistant' && currentTurn) {
      // Accumulate assistant text and usage
      if (msg.usage) {
        currentTurn.tokenUsage.input += msg.usage.input || 0;
        currentTurn.tokenUsage.output += msg.usage.output || 0;
      }
      const contentArr = Array.isArray(msg.content) ? msg.content : (typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : []);
      for (const block of contentArr) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && block.text) {
          currentTurn.assistantTexts.push(block.text);
        }
        // Extract tool call info (command / path) from assistant toolCall blocks
        if (block.type === 'toolCall' && block.name) {
          const args = block.arguments || {};
          const toolInfo = {
            toolName: block.name,
            command: args.command || null,
            path: args.path || args.file_path || null,
          };
          currentTurn.toolCalls.push(toolInfo);
        }
      }
    }
  }

  // Flush last turn
  flushTurn();

  // Add automation events for cron sessions
  if (parsed.chatType === 'cron' && lines.length > 0) {
    const sessionLine = lines.find(l => l.type === 'session');
    const totalUsage = { input: 0, output: 0 };
    for (const l of lines) {
      if (l.type === 'message' && l.message?.role === 'assistant' && l.message?.usage) {
        totalUsage.input += l.message.usage.input || 0;
        totalUsage.output += l.message.usage.output || 0;
      }
    }

    // Detect automation type from session key or content
    let automationType = 'unknown';
    if (sessionKey.includes('daily-ai-news') || sessionKey.includes('新闻')) automationType = 'daily-ai-news';
    else if (sessionKey.includes('weekly') || sessionKey.includes('周报')) automationType = 'weekly-fe-report';
    else if (sessionKey.includes('daily-tasks') || sessionKey.includes('任务')) automationType = 'daily-tasks';
    else if (sessionKey.includes('heartbeat')) automationType = 'heartbeat';

    events.push({
      type: 'automation',
      timestamp: sessionLine?.timestamp || new Date().toISOString(),
      sessionId,
      sessionKey,
      automationType,
      tokenUsage: totalUsage,
    });
  }

  return events;
}

// ─── Anchors management ─────────────────────────────────────

function loadAnchors(auditPath) {
  const anchorsPath = path.join(auditPath, 'anchors.json');
  try {
    return JSON.parse(fs.readFileSync(anchorsPath, 'utf-8'));
  } catch {
    return { version: 1, lastRunAt: null, files: {} };
  }
}

function saveAnchors(auditPath, anchors) {
  const anchorsPath = path.join(auditPath, 'anchors.json');
  anchors.lastRunAt = new Date().toISOString();
  fs.writeFileSync(anchorsPath, JSON.stringify(anchors, null, 2) + '\n');
}

// ─── Events file management ─────────────────────────────────

function appendEvents(auditPath, events) {
  if (events.length === 0) return;

  const eventsDir = path.join(auditPath, 'events');
  fs.mkdirSync(eventsDir, { recursive: true });

  // Group events by month
  const byMonth = {};
  for (const evt of events) {
    const month = evt.timestamp.slice(0, 7); // YYYY-MM
    (byMonth[month] ||= []).push(evt);
  }

  for (const [month, evts] of Object.entries(byMonth)) {
    const filePath = path.join(eventsDir, `${month}.jsonl`);
    const lines = evts.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines);
  }
}

// ─── Snapshot builder ───────────────────────────────────────

function buildSnapshot(auditPath, teamMembers) {
  const eventsDir = path.join(auditPath, 'events');
  if (!fs.existsSync(eventsDir)) return null;

  // Normalize sender ID: prefer user_id (e.g. xiaogang.h) over union_id (ou_xxx)
  function normalizeId(senderId, senderUnionId) {
    if (senderId && !senderId.startsWith('ou_')) return senderId;
    // senderId is a union_id, look up the user_id
    if (senderId && teamMembers.has(senderId)) {
      return teamMembers.get(senderId).userId || senderId;
    }
    if (senderUnionId && teamMembers.has(senderUnionId)) {
      return teamMembers.get(senderUnionId).userId || senderUnionId;
    }
    return senderId || senderUnionId || 'anonymous';
  }

  function getDisplayName(uid, fallbackName) {
    if (teamMembers.has(uid)) return teamMembers.get(uid).displayName;
    return fallbackName || uid;
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    codeDelivery: { totalMRs: 0, byInitiator: {}, byRepo: {} },
    qaService: { totalQuestions: 0, uniqueUsers: new Set(), byUser: {}, byTag: {} },
    automation: { totalRuns: 0, byType: {} },
    cost: { totalInputTokens: 0, totalOutputTokens: 0, byDimension: { codeDelivery: { input: 0, output: 0 }, qa: { input: 0, output: 0 }, automation: { input: 0, output: 0 } } },
  };

  const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.jsonl')).sort();

  for (const file of eventFiles) {
    const content = fs.readFileSync(path.join(eventsDir, file), 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }

      if (evt.type === 'qa') {
        snapshot.qaService.totalQuestions++;
        const uid = normalizeId(evt.senderId, evt.senderUnionId);
        snapshot.qaService.uniqueUsers.add(uid);

        if (!snapshot.qaService.byUser[uid]) {
          snapshot.qaService.byUser[uid] = {
            displayName: getDisplayName(uid, evt.senderName),
            questions: 0,
            tags: {},
          };
        }
        snapshot.qaService.byUser[uid].questions++;
        for (const tag of evt.tags || []) {
          snapshot.qaService.byUser[uid].tags[tag] = (snapshot.qaService.byUser[uid].tags[tag] || 0) + 1;
          snapshot.qaService.byTag[tag] = (snapshot.qaService.byTag[tag] || 0) + 1;
        }

        snapshot.cost.totalInputTokens += evt.tokenUsage?.input || 0;
        snapshot.cost.totalOutputTokens += evt.tokenUsage?.output || 0;
        snapshot.cost.byDimension.qa.input += evt.tokenUsage?.input || 0;
        snapshot.cost.byDimension.qa.output += evt.tokenUsage?.output || 0;
      }

      if (evt.type === 'code_delivery') {
        snapshot.codeDelivery.totalMRs++;
        const uid = normalizeId(evt.senderId, evt.senderUnionId);
        if (!snapshot.codeDelivery.byInitiator[uid]) {
          snapshot.codeDelivery.byInitiator[uid] = { displayName: getDisplayName(uid, evt.senderName), total: 0, repos: new Set() };
        }
        snapshot.codeDelivery.byInitiator[uid].total++;
        if (evt.mr?.project) {
          snapshot.codeDelivery.byInitiator[uid].repos.add(evt.mr.project);
          snapshot.codeDelivery.byRepo[evt.mr.project] = (snapshot.codeDelivery.byRepo[evt.mr.project] || 0) + 1;
        }

        snapshot.cost.totalInputTokens += evt.tokenUsage?.input || 0;
        snapshot.cost.totalOutputTokens += evt.tokenUsage?.output || 0;
        snapshot.cost.byDimension.codeDelivery.input += evt.tokenUsage?.input || 0;
        snapshot.cost.byDimension.codeDelivery.output += evt.tokenUsage?.output || 0;
      }

      if (evt.type === 'automation') {
        snapshot.automation.totalRuns++;
        const t = evt.automationType || 'unknown';
        snapshot.automation.byType[t] = (snapshot.automation.byType[t] || 0) + 1;

        snapshot.cost.totalInputTokens += evt.tokenUsage?.input || 0;
        snapshot.cost.totalOutputTokens += evt.tokenUsage?.output || 0;
        snapshot.cost.byDimension.automation.input += evt.tokenUsage?.input || 0;
        snapshot.cost.byDimension.automation.output += evt.tokenUsage?.output || 0;
      }
    }
  }

  // Convert Sets to serializable
  snapshot.qaService.uniqueUsers = snapshot.qaService.uniqueUsers.size;

  for (const v of Object.values(snapshot.codeDelivery.byInitiator)) {
    v.repos = [...v.repos];
  }

  return snapshot;
}

function saveSnapshot(auditPath, snapshot) {
  const snapshotsDir = path.join(auditPath, 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  // Save latest
  fs.writeFileSync(path.join(snapshotsDir, 'latest.json'), JSON.stringify(snapshot, null, 2) + '\n');

  // Save monthly
  const month = snapshot.generatedAt.slice(0, 7);
  fs.writeFileSync(path.join(snapshotsDir, `${month}.json`), JSON.stringify(snapshot, null, 2) + '\n');

  console.log(`[audit] Snapshot saved: ${snapshot.qaService.totalQuestions} questions, ${snapshot.codeDelivery.totalMRs} MRs, ${snapshot.automation.totalRuns} automation runs`);
}

// ─── Session key lookup ─────────────────────────────────────

function loadSessionKeys(sessionsPath) {
  const sessionsJsonPath = path.join(sessionsPath, 'sessions.json');
  const map = {}; // sessionId -> sessionKey
  try {
    const data = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'));
    for (const [key, val] of Object.entries(data)) {
      if (val.sessionId) {
        map[val.sessionId] = key;
      }
    }
  } catch {
    console.warn('[audit] Warning: Could not read sessions.json');
  }
  return map;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log(`[audit] Sessions: ${sessionsDir}`);
  console.log(`[audit] Output: ${auditDir}`);

  // Ensure audit directory exists
  fs.mkdirSync(path.join(auditDir, 'events'), { recursive: true });
  fs.mkdirSync(path.join(auditDir, 'snapshots'), { recursive: true });

  const teamMembers = loadTeamMembers(userMdPath);
  console.log(`[audit] Team members loaded: ${teamMembers.size / 2} people`);

  if (flags.snapshotOnly) {
    const snapshot = buildSnapshot(auditDir, teamMembers);
    if (snapshot) saveSnapshot(auditDir, snapshot);
    return;
  }

  // Load session key mapping
  const sessionKeyMap = loadSessionKeys(sessionsDir);

  // Load anchors
  let anchors = flags.full ? { version: 1, lastRunAt: null, files: {} } : loadAnchors(auditDir);

  // Find all JSONL files
  const allFiles = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort();

  console.log(`[audit] Found ${allFiles.length} JSONL files`);

  let totalNewEvents = 0;
  let filesScanned = 0;

  for (const fileName of allFiles) {
    const filePath = path.join(sessionsDir, fileName);
    const stat = fs.statSync(filePath);

    const anchor = anchors.files[fileName];
    const startByte = anchor?.byteOffset || 0;

    // Skip if no new data
    if (startByte >= stat.size && !flags.full) continue;

    // Extract sessionId from filename
    const sessionId = fileName.replace(/\.jsonl(\.reset\.\d+)?$/, '');
    const sessionKey = sessionKeyMap[sessionId] || `unknown:${sessionId}`;

    const { lines, endByte, lineCount } = await scanFile(filePath, flags.full ? 0 : startByte);

    if (lines.length > 0) {
      const events = processLines(lines, sessionId, sessionKey, teamMembers);
      appendEvents(auditDir, events);
      totalNewEvents += events.length;
      filesScanned++;
    }

    // Update anchor
    const lastLine = lines[lines.length - 1];
    anchors.files[fileName] = {
      byteOffset: endByte,
      lineCount: (anchor?.lineCount || 0) + lineCount,
      lastLineHash: lastLine ? crypto.createHash('md5').update(JSON.stringify(lastLine)).digest('hex').slice(0, 8) : (anchor?.lastLineHash || ''),
      sessionKey,
      status: fileName.includes('.reset.') ? 'archived' : 'active',
    };
  }

  // Mark anchors for files that no longer exist
  for (const fileName of Object.keys(anchors.files)) {
    if (!allFiles.includes(fileName)) {
      anchors.files[fileName].status = 'archived';
    }
  }

  saveAnchors(auditDir, anchors);

  console.log(`[audit] Scanned ${filesScanned} files, extracted ${totalNewEvents} new events`);

  // Rebuild snapshot
  const snapshot = buildSnapshot(auditDir, teamMembers);
  if (snapshot) saveSnapshot(auditDir, snapshot);
}

main().catch(err => {
  console.error('[audit] Fatal error:', err);
  process.exit(1);
});
 skills/agent-audit/README.md  0 → 100644
+
103
−
0

Viewed
# Agent Audit - 贡献审计

扫描 OpenClaw transcript JSONL，统计 Agent 的代码交付和问答服务数据。

## 快速开始

```bash
# 扫描（首次自动全量，之后自动增量）
node skills/agent-audit/scripts/audit-scanner.mjs
```

扫描完成后数据写入 `~/.openclaw/workspace/.openclawAudits/`：

```
.openclawAudits/
├── anchors.json              # 扫描进度锚点
├── events/2026-03.jsonl      # 审计事件（按月分片）
└── snapshots/latest.json     # 最新聚合快照
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--sessions-dir <path>` | transcript JSONL 目录 | `~/.openclaw/agents/main/sessions` |
| `--audit-dir <path>` | 审计输出目录 | `~/.openclaw/workspace/.openclawAudits` |
| `--user-md <path>` | USER.md 路径（用于 ID 归一化） | `~/.openclaw/workspace/USER.md` |
| `--full` | 强制全量重扫（锚点损坏或想重建时用） | - |
| `--snapshot` | 仅重建快照，不扫描 | - |

## 定时任务配置

在 OpenClaw 的 BOOT.md 或对话中添加 cron job：

```jsonc
// 每天 23:00 自动扫描
{
  "name": "每日贡献审计",
  "schedule": { "kind": "cron", "expr": "0 23 * * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "执行贡献审计扫描：运行 node skills/agent-audit/scripts/audit-scanner.mjs，完成后读取 snapshots/latest.json 输出今日摘要。"
  },
  "delivery": { "mode": "announce", "channel": "wave", "to": "user:ou_xxx" }
}
```

也可以在对话中直接让 bot 创建：

> "帮我配一个每天 23:00 的审计定时任务，结果发给我"

### 月度报表

```jsonc
// 每月 1 号 09:00 生成上月报表
{
  "name": "月度贡献报表",
  "schedule": { "kind": "cron", "expr": "0 9 1 * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "生成上月 Agent 贡献月报：先运行 audit-scanner.mjs 确保数据最新，然后读取 snapshots/latest.json 和 events/ 中的 userMessage 采样，用 AI 总结生成完整月报（代码交付 + 问答服务），发送给晓刚。"
  },
  "delivery": { "mode": "announce", "channel": "wave", "to": "user:ou_xxx" }
}
```

## 手动触发

在对话中说以下任意一句：

- "跑一下审计"
- "更新审计数据"
- "看下贡献统计"
- "生成贡献报表"

## 输出示例

```
📊 Bot 贡献统计

💻 代码交付: 6 MRs
  晓刚: 3 MRs (wave-openclaw-wrapper)
  坚圣: 2 MRs (stellar-fe, wave-openclaw-wrapper)
  马达: 1 MR (wave-openclaw-wrapper)

💬 问答服务: 196 questions, 16 users
  Top: 晓刚 60q, 马达 48q, 玲玲 23q

🏷️ 标签: general-qa(78) > code/mr(23) > wave-api(21) > tapd(10)

🤖 自动化: 4 runs
```

## 原理

1. JSONL 是 append-only → 用 byteOffset 锚点做增量扫描
2. 从 assistant 的 toolCall block 提取 exec command / read path
3. 规则引擎做标签分类（零 LLM 消耗）
4. 报表生成时才用 LLM 做自然语言总结

详细设计见 [PRD](../../docs/PRD-agent-contribution-audit.md)。
 skills/agent-audit/SKILL.md  0 → 100644
+
91
−
0

Viewed
---
name: agent-audit
description: "Agent 贡献审计：增量扫描 OpenClaw transcript JSONL，统计代码交付和问答服务数据。触发场景：(1) 每天 23:00 定时任务自动执行 (2) 用户说'跑一下审计'/'审计报告'/'贡献统计'/'bot 做了什么' (3) 用户问某人使用 bot 的情况 (4) 需要生成月度/周度贡献报表。覆盖：增量扫描、事件提取、快照聚合、AI 总结报表。"
---

# Agent 贡献审计

增量扫描 OpenClaw transcript JSONL，低负荷统计 Agent 对团队的贡献。

## 核心维度

1. **代码交付** — 谁通过 bot 创建了 MR，涉及哪些仓库
2. **问答服务** — 服务了多少人（团队内/外），问题标签分布

## 数据位置

```
~/.openclaw/workspace/.openclawAudits/
├── anchors.json           # JSONL 扫描锚点
├── events/YYYY-MM.jsonl   # 审计事件流（按月分片）
└── snapshots/
    ├── latest.json        # 最新快照
    └── YYYY-MM.json       # 月度快照
```

团队成员列表从 `USER.md` 自动推断，不需要额外配置。

## 扫描执行

### 自动（cron 每天 23:00）

定时任务调用脚本完成增量扫描 + 快照重建。

### 手动触发

用户在对话中说"跑一下审计"等触发词时执行：

```bash
node skills/agent-audit/scripts/audit-scanner.mjs \
  --sessions-dir <sessions_path> \
  --audit-dir <workspace>/.openclawAudits
```

参数说明：
- `--sessions-dir` — OpenClaw transcript JSONL 目录，默认 `~/.openclaw/agents/main/sessions`
- `--audit-dir` — 审计输出目录，默认 `~/.openclaw/workspace/.openclawAudits`
- `--user-md` — USER.md 路径，默认 `~/.openclaw/workspace/USER.md`
- `--full` — 忽略锚点，全量重扫
- `--snapshot` — 仅重建快照（不扫描新数据）

## 报表生成

扫描完成后，读取 `snapshots/latest.json`，结合 `events/` 中的 `userMessage` 采样，
用 LLM 生成自然语言总结。

### 报表 prompt 组装

1. 读取 `snapshots/latest.json` 作为数据上下文
2. 从 events 中每人取 5-10 条代表性 `userMessage`（优先不同标签）
3. 要求 LLM 生成 2-3 段总结：谁做了什么、高频场景、差异化价值

### 报表示例

```
📊 Bot 贡献月报 (2026-03)

## AI 总结
本月 bot 服务了 8 位团队成员和 2 位外部同学。
代码方面：帮晓刚创建了 5 个 MR...
问答方面：高频场景是 Code Review(78次) 和 TAPD Bug 查询(62次)...

## 📊 详细数据
（数字表格）
```

## 标签分类规则

基于 tool call 特征，零 LLM 消耗：

| 信号 | 标签 |
|------|------|
| exec 含 `gitlab-mr.mjs --create` | `code/mr-create` |
| exec 含 `git push` | `code/push` |
| exec 含 `tapd-bug` | `tapd/bug` |
| wave_search_documents 调用 | `knowledge-base` |
| read 路径匹配 `skills/<name>/` | `skill/<name>` |
| 无 tool call | `general-qa` |

## PRD 详情

完整设计见 `docs/PRD-agent-contribution-audit.md`（同仓库）。
