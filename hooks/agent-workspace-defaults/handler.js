/**
 * agent-workspace-defaults hook
 * 在 agent:bootstrap 时用本仓库 workspace-defaults 替换/去重 bootstrapFiles，同名仅按文件名，以 workspace-defaults 为准。
 * 见 docs/prd-workspace-defaults-bootstrap-hook-2026-03-09.md
 */

const path = require('path');
const fs = require('fs').promises;

const WHITELIST = ['USER.md', 'AGENTS.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'HEARTBEAT.md'];

function basename(p) {
  if (typeof p !== 'string') return '';
  return path.basename(p);
}

function getWorkspaceDefaultsPath(event) {
  const cfg = event?.context?.cfg;
  const entry = cfg?.hooks?.internal?.entries?.['agent-workspace-defaults'];
  return entry?.options?.workspaceDefaultsPath || entry?.workspaceDefaultsPath || '';
}

async function readDefaultsContent(dir, filename) {
  if (!dir) return null;
  try {
    const filePath = path.join(dir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch {
    return null;
  }
}

const LOG_PREFIX = '[agent-workspace-defaults]';

const handler = async (event) => {
  if (!event || typeof event !== 'object') return;
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;
  const ctx = event.context;
  if (!ctx || !Array.isArray(ctx.bootstrapFiles)) return;

  const beforeCount = ctx.bootstrapFiles.length;
  console.log(`${LOG_PREFIX} 触发 agent:bootstrap，bootstrapFiles 数量: ${beforeCount}`);

  const workspaceDefaultsPath = getWorkspaceDefaultsPath(event);
  if (!workspaceDefaultsPath) {
    console.warn(`${LOG_PREFIX} 未找到 workspaceDefaultsPath，将仅做去重，不替换内容`);
  } else {
    console.log(`${LOG_PREFIX} workspaceDefaultsPath: ${workspaceDefaultsPath}`);
  }

  const defaultsByBasename = {};
  if (workspaceDefaultsPath) {
    for (const name of WHITELIST) {
      const content = await readDefaultsContent(workspaceDefaultsPath, name);
      if (content != null) defaultsByBasename[name] = content;
    }
    const loaded = Object.keys(defaultsByBasename);
    if (loaded.length) {
      console.log(`${LOG_PREFIX} 从 workspace-defaults 加载: ${loaded.join(', ')}`);
    } else {
      console.warn(`${LOG_PREFIX} workspace-defaults 下未读到任何白名单文件`);
    }
  }

  const whitelistSeen = new Map();
  const nonWhitelist = [];
  for (const item of ctx.bootstrapFiles) {
    const name = basename(item?.path ?? '');
    if (!name) continue;
    if (WHITELIST.includes(name)) {
      if (whitelistSeen.has(name)) continue;
      const contentFromDefaults = defaultsByBasename[name];
      const fromDefaults = contentFromDefaults !== undefined;
      whitelistSeen.set(name, {
        ...item,
        path: item.path,
        content: contentFromDefaults !== undefined ? contentFromDefaults : (item.content ?? ''),
      });
      if (fromDefaults) {
        console.log(`${LOG_PREFIX} 使用 workspace-defaults 内容替换: ${name}`);
      }
    } else {
      nonWhitelist.push(item);
    }
  }

  ctx.bootstrapFiles.length = 0;
  for (const [, v] of whitelistSeen) {
    ctx.bootstrapFiles.push(v);
  }
  for (const v of nonWhitelist) {
    ctx.bootstrapFiles.push(v);
  }

  const afterCount = ctx.bootstrapFiles.length;
  console.log(`${LOG_PREFIX} 完成: 白名单去重后 ${whitelistSeen.size} 个，非白名单 ${nonWhitelist.length} 个，合计 bootstrapFiles: ${afterCount}`);
};

module.exports = handler;
module.exports.default = handler;
