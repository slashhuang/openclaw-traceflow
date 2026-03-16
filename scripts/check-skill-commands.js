#!/usr/bin/env node
/**
 * 扫描所有 Skill 的依赖命令，检查是否已安装，并可选一键安装。
 * 用法:
 *   node scripts/check-skill-commands.js              # 列出缺失命令与安装建议
 *   node scripts/check-skill-commands.js --json        # JSON 输出
 *   node scripts/check-skill-commands.js --install     # 列出将执行的命令，确认后依次安装全部
 *   node scripts/check-skill-commands.js --install -y  # 不确认，直接安装全部缺失项
 *
 * 约定见 docs/SKILL_REQUIRES_COMMANDS.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const REPO_ROOT = path.resolve(__dirname, '..');

// 扫描的 skill 根目录（相对 REPO_ROOT 或绝对）
const SKILL_ROOTS = [
  path.join(REPO_ROOT, 'skills'),
  path.join(REPO_ROOT, '.cursor', 'skills'),
  path.join(process.env.HOME || process.env.USERPROFILE || '', '.cursor', 'skills'),
];

// 无 installSuggestions 时的默认安装建议（macOS/Homebrew 为主）
const DEFAULT_INSTALL = {
  jq: 'brew install jq',
  node: 'brew install node',
  npx: 'brew install node',
  uv: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  'yt-dlp': 'brew install yt-dlp',
  python3: 'python3 通常由系统提供；或 brew install python@3.12',
};

function findAllSkillMd() {
  const files = [];
  for (const root of SKILL_ROOTS) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const skillMd = path.join(root, e.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) files.push(skillMd);
      }
    } catch (_) {}
  }
  return files;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : '';
}

function parseYamlList(yaml, key) {
  // key 可能是 "requiresCommands" 或 "bins"（在 requires 下）
  const results = [];
  // 单行数组: key: [ "a", "b" ] 或 key: ["a","b"]
  const singleLine = new RegExp(key + '\\s*:\\s*\\[([^\\]]*)\\]', 'i');
  let m = yaml.match(singleLine);
  if (m) {
    const inner = m[1].replace(/["']/g, '').split(',').map(s => s.trim()).filter(Boolean);
    results.push(...inner);
  }
  // 多行数组: key:\n  - a\n  - b
  const multiLine = new RegExp(key + '\\s*:\\s*\\n([\\s\\S]*?)(?=\\n\\w|\\n---|$)', 'i');
  m = yaml.match(multiLine);
  if (m) {
    const block = m[1];
    const items = block.split(/\n/).map(line => line.replace(/^\s*-\s*["']?|["']\s*$/g, '').trim()).filter(Boolean);
    results.push(...items);
  }
  return [...new Set(results)];
}

function parseInstallSuggestions(yaml) {
  const out = {};
  // installSuggestions:\n  cmd: "brew install ..."
  const block = yaml.match(/installSuggestions\s*:\s*\n([\s\S]*?)(?=\n\w|\n---|$)/i);
  if (block) {
    const lines = block[1].split(/\n/).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*["']?([^"'\n]+)["']?/);
      if (m) out[m[1].trim()] = m[2].trim();
    }
  }
  return out;
}

function parseClawdbotRequiresAndInstall(yaml) {
  const bins = [];
  const installByBin = {};
  // metadata 可能是单行 JSON: metadata: {"clawdbot":{"requires":{"bins":["yt-dlp"]},"install":[...]}}
  const metaLine = yaml.split(/\n/).find(l => l.startsWith('metadata:'));
  if (metaLine) {
    const jsonStr = metaLine.replace(/^metadata\s*:\s*/, '').trim();
    try {
      const meta = JSON.parse(jsonStr);
      const cb = meta.clawdbot || meta;
      if (cb.requires && Array.isArray(cb.requires.bins)) bins.push(...cb.requires.bins);
      if (Array.isArray(cb.install)) {
        for (const item of cb.install) {
          const formula = item.formula;
          const pkg = item.package;
          const names = item.bins || [];
          const cmd = formula ? `brew install ${formula}` : (pkg ? `pip install ${pkg}` : null);
          if (cmd && names.length) for (const b of names) installByBin[b] = cmd;
        }
      }
    } catch (_) { /* 非 JSON，用下面正则兜底 */ }
  }
  // 否则用 YAML 风格: requires.bins: ["a","b"]
  if (bins.length === 0) {
    const requiresBlock = yaml.match(/requires\s*:\s*\n\s*bins\s*:\s*\[([^\]]*)\]/i) || yaml.match(/"bins"\s*:\s*\[([^\]]*)\]/);
    if (requiresBlock) {
      const inner = (requiresBlock[1] || requiresBlock[0].replace(/.*\[/, '').replace(/\].*/, '')).replace(/["']/g, '').split(',').map(s => s.trim()).filter(Boolean);
      bins.push(...inner);
    }
  }
  return { bins: [...new Set(bins)], installByBin };
}

function collectFromSkill(skillMdPath) {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const yaml = extractFrontmatter(content);
  const skillName = path.basename(path.dirname(skillMdPath));
  const commands = [];
  const installSuggestions = { ...parseInstallSuggestions(yaml) };

  const fromRequires = parseYamlList(yaml, 'requiresCommands');
  commands.push(...fromRequires);

  const { bins: clawBins, installByBin: clawInstall } = parseClawdbotRequiresAndInstall(yaml);
  commands.push(...clawBins);
  Object.assign(installSuggestions, clawInstall);

  const uniq = [...new Set(commands)].filter(Boolean);
  return { skillName, skillPath: skillMdPath, commands: uniq, installSuggestions };
}

function isCommandAvailable(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function runCheck() {
  const skillFiles = findAllSkillMd();
  const bySkill = [];
  const missingMap = {}; // cmd -> { skills: [], install: string }

  for (const skillMd of skillFiles) {
    const { skillName, commands, installSuggestions } = collectFromSkill(skillMd);
    if (commands.length === 0) continue;
    const missing = commands.filter(c => !isCommandAvailable(c));
    if (missing.length === 0) continue;
    bySkill.push({ skillName, missing, installSuggestions });
    for (const cmd of missing) {
      if (!missingMap[cmd]) missingMap[cmd] = { skills: [], install: null };
      missingMap[cmd].skills.push(skillName);
      const install = installSuggestions[cmd] || DEFAULT_INSTALL[cmd] || null;
      if (install && !missingMap[cmd].install) missingMap[cmd].install = install;
    }
  }

  return { bySkill, missingMap, skillFilesChecked: skillFiles.length };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const doInstall = args.includes('--install');

  const { bySkill, missingMap, skillFilesChecked } = runCheck();
  const missingList = Object.entries(missingMap);

  if (jsonOut) {
    const out = {
      skillFilesChecked,
      missing: missingList.map(([cmd, info]) => ({ command: cmd, skills: info.skills, install: info.install })),
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(missingList.length ? 1 : 0);
  }

  if (missingList.length === 0) {
    console.log(`已检查 ${skillFilesChecked} 个 skill，所有依赖命令均已安装。`);
    return;
  }

  console.log(`已扫描 ${skillFilesChecked} 个 skill，以下命令未安装或不在 PATH 中：\n`);
  for (const [cmd, info] of missingList) {
    const install = info.install || '（请手动安装）';
    console.log(`  ${cmd}`);
    console.log(`    被 skill: ${info.skills.join(', ')}`);
    console.log(`    建议: ${install}\n`);
  }

  if (doInstall && missingList.length > 0) {
    const toRun = missingList.filter(([, info]) => info.install).map(([cmd, info]) => ({ cmd, install: info.install }));
    if (toRun.length === 0) {
      console.log('没有可自动执行的安装命令，请根据上方建议手动安装。');
      return;
    }
    const yesAll = args.includes('--yes') || args.includes('-y');
    console.log('\n将依次执行以下安装命令：');
    toRun.forEach(({ cmd, install }) => console.log(`  ${install}`));
    const doRun = () => {
      const failed = [];
      for (let i = 0; i < toRun.length; i++) {
        const { cmd, install } = toRun[i];
        console.log(`\n[${i + 1}/${toRun.length}] $ ${install}`);
        try {
          execSync(install, { stdio: 'inherit' });
        } catch (e) {
          console.error(`  失败: ${e.message || '执行出错'}`);
          failed.push({ cmd, install });
        }
      }
      if (failed.length > 0) {
        console.log(`\n完成: 成功 ${toRun.length - failed.length} 个，失败 ${failed.length} 个。失败项请手动安装：`);
        failed.forEach(({ cmd, install }) => console.log(`  ${cmd}: ${install}`));
      } else {
        console.log(`\n已安装全部 ${toRun.length} 个依赖命令。`);
      }
    };
    if (yesAll) {
      doRun();
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n一键安装以上全部? (Y/n) ', (ans) => {
      if (ans !== 'n' && ans !== 'N') {
        doRun();
      } else {
        console.log('已取消。');
      }
      rl.close();
    });
  }
}

main();
