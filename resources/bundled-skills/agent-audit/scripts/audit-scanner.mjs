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
