/**
 * git-workflow Skill — PRD 驱动的仓库修改自动化流程
 *
 * 自动创建 Git worktree 和分支，完成代码修改后自动推送并创建 PR
 * Commit author 自动设置为 abu
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Git 配置 - Commit author 设置为 abu
const GIT_AUTHOR_NAME = 'abu';
const GIT_AUTHOR_EMAIL = 'abu@claw-family.local';

// GitHub 配置
const REPO_OWNER = 'slashhuang';
const REPO_NAME = 'claw-family';

/**
 * 执行 git 命令（设置 author 信息为 abu）
 */
function execGit(command, options = {}) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL
  };
  return execSync(command, { ...options, env });
}

/**
 * 生成规范的分支名
 */
function generateBranchName(description) {
  const slugify = (text) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/\u4e00-\u9fa5/g, (char) => {
        // 简单的中文转拼音占位（实际使用中可以用 pinyin 库）
        return 'cn';
      })
      .substring(0, 50);
  };

  const slug = slugify(description);
  const prefix = description.includes('文档') || description.includes('test') ? 'docs' : 'feat';
  return `${prefix}/${slug}`;
}

/**
 * 检查主工作区状态
 */
function checkWorkspaceStatus() {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return {
      isClean: status === '',
      currentBranch
    };
  } catch (error) {
    throw new Error('无法获取 git 状态：' + error.message);
  }
}

/**
 * 获取最新 main 分支
 */
function fetchOriginMain() {
  try {
    execSync('git fetch origin main', { stdio: 'pipe' });
    return true;
  } catch (error) {
    throw new Error('无法 fetch origin main: ' + error.message);
  }
}

/**
 * 创建 Git worktree
 */
function createWorktree(branchName, worktreePath) {
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

  if (!worktreePath) {
    const repoName = path.basename(repoRoot);
    worktreePath = path.join(repoRoot, '..', `${repoName}--${branchName.replace(/\//g, '-')}`);
  }

  const parentDir = path.dirname(worktreePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  if (fs.existsSync(worktreePath)) {
    throw new Error(`worktree 路径已存在：${worktreePath}`);
  }

  try {
    execSync(`git worktree add "${worktreePath}" -b ${branchName} origin/main`, { stdio: 'pipe' });
    return worktreePath;
  } catch (error) {
    throw new Error('创建 worktree 失败：' + error.message);
  }
}

/**
 * 修改或创建文件
 */
function modifyFile(filePath, content, worktreePath) {
  const fullPath = path.join(worktreePath, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

/**
 * 提交更改（author 设置为 abu）
 */
function commitChanges(message, worktreePath) {
  const originalDir = process.cwd();
  try {
    process.chdir(worktreePath);

    execSync('git add -A', { stdio: 'pipe' });

    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) {
      return { success: false, message: '没有更改需要提交' };
    }

    // 使用 execGit 设置 author 为 abu
    execGit(`git commit -m "${message}"`, { stdio: 'pipe' });

    return { success: true, message: '提交成功', author: `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>` };
  } catch (error) {
    throw new Error('提交失败：' + error.message);
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * 推送分支到远程
 */
function pushBranch(branchName, worktreePath) {
  const originalDir = process.cwd();
  try {
    process.chdir(worktreePath);
    execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    throw new Error('推送分支失败：' + error.message);
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * 使用 GitHub API 创建 Pull Request
 */
function createPullRequest(branchName, title, body) {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error('未设置 GITHUB_TOKEN 环境变量，无法自动创建 PR');
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`;

  const postData = JSON.stringify({
    title: title,
    body: body,
    head: branchName,
    base: 'main'
  });

  try {
    const response = execSync(
      `curl -s -X POST "${url}" ` +
      `-H "Authorization: token ${githubToken}" ` +
      `-H "Accept: application/vnd.github.v3+json" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${postData}'`,
      { encoding: 'utf8' }
    );

    const pr = JSON.parse(response);

    if (pr.message) {
      throw new Error(pr.message);
    }

    if (!pr.html_url) {
      throw new Error('PR 创建失败，未返回 URL');
    }

    return pr.html_url;
  } catch (error) {
    throw new Error('创建 PR 失败：' + error.message);
  }
}

/**
 * 生成 PR 创建链接（fallback 方案）
 */
function generatePRLink(branchName, title, body) {
  const encodedTitle = encodeURIComponent(title);
  const encodedBody = encodeURIComponent(body);
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/compare/main...${REPO_OWNER}:${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
}

// 存储当前活动的 worktree 信息
const activeWorktrees = new Map();

// Skill 入口
module.exports = {
  name: 'git-workflow',
  description: 'PRD 驱动的仓库修改自动化流程 - 自动创建 worktree、提交 (author=abu)、推送并创建 PR',

  commands: {
    /**
     * 开始一个完整的开发流程
     * 用法：/wf start <需求描述>
     */
    async start({ args, session, sender }) {
      const description = args.join(' ');
      if (!description) {
        return { reply: '请提供需求描述，例如：/wf start 添加测试文档' };
      }

      try {
        // 1. 检查主工作区状态
        const status = checkWorkspaceStatus();
        if (!status.isClean) {
          return { reply: '⚠️ 主工作区有未提交的更改，请先清理或提交' };
        }
        if (status.currentBranch !== 'main') {
          return { reply: `⚠️ 当前不在 main 分支（当前：${status.currentBranch}）` };
        }

        // 2. 获取最新 main
        fetchOriginMain();

        // 3. 生成分支名
        const branchName = generateBranchName(description);

        // 4. 创建 worktree
        const worktreePath = createWorktree(branchName);

        // 5. 保存 worktree 信息
        const worktreeInfo = {
          path: worktreePath,
          branch: branchName,
          description: description,
          createdAt: new Date().toISOString()
        };
        activeWorktrees.set(session.id || 'default', worktreeInfo);

        return {
          reply: `✅ worktree 创建成功！

📁 路径：\`${worktreePath}\`
🔀 分支：\`${branchName}\`
📝 需求：${description}
👤 Commit Author: ${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>

现在阿布可以去 worktree 里修改代码啦～修改完成后告诉阿布，阿布会自动提交、推送并创建 PR！`
        };

      } catch (error) {
        return { reply: `❌ 创建 worktree 失败：${error.message}` };
      }
    },

    /**
     * 修改文件
     * 用法：/wf edit <文件路径> <内容>
     */
    async edit({ args, session }) {
      const worktreeInfo = activeWorktrees.get(session.id || 'default');
      if (!worktreeInfo) {
        return { reply: '⚠️ 请先使用 /wf start 创建 worktree' };
      }

      if (args.length < 2) {
        return { reply: '用法：/wf edit <文件路径> <内容>' };
      }

      const filePath = args[0];
      const content = args.slice(1).join(' ');

      try {
        const fullPath = modifyFile(filePath, content, worktreeInfo.path);
        return { reply: `✅ 文件已修改：\`${filePath}\`` };
      } catch (error) {
        return { reply: `❌ 修改失败：${error.message}` };
      }
    },

    /**
     * 提交并推送，自动创建 PR
     * 用法：/wf submit [PR 标题]
     */
    async submit({ args, session }) {
      const worktreeInfo = activeWorktrees.get(session.id || 'default');
      if (!worktreeInfo) {
        return { reply: '⚠️ 请先使用 /wf start 创建 worktree' };
      }

      const prTitle = args.join(' ') || worktreeInfo.description;
      const prBody = `🤖 自动创建的 PR\n\n**需求**: ${worktreeInfo.description}\n\n---\n*Generated by git-workflow skill*\n\n**Commit Author**: ${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`;

      try {
        // 1. 提交更改（author=abu）
        const commitMsg = `feat: ${worktreeInfo.description}`;
        const commitResult = commitChanges(commitMsg, worktreeInfo.path);

        // 2. 推送分支
        pushBranch(worktreeInfo.branch, worktreeInfo.path);

        // 3. 创建 PR
        let prUrl;
        try {
          prUrl = createPullRequest(worktreeInfo.branch, prTitle, prBody);
        } catch (apiError) {
          // API 失败，生成手动创建链接
          prUrl = generatePRLink(worktreeInfo.branch, prTitle, prBody);
          return {
            reply: `✅ 代码已提交并推送！

🔀 分支：\`${worktreeInfo.branch}\`
👤 Commit Author: ${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>

⚠️ 自动创建 PR 失败：${apiError.message}

请手动创建 PR，点击链接：
${prUrl}

---
💡 配置 GITHUB_TOKEN 后可自动创建 PR:
1. 访问 https://github.com/settings/tokens 创建具有 repo 权限的 token
2. 在运行 OpenClaw 的环境中设置：openclaw.env.json 中添加 "GITHUB_TOKEN":"ghp_xxx"，或启动前 export GITHUB_TOKEN=xxx
3. 详见 docs/PR-WORKFLOW.md §6`
          };
        }

        // 4. 清理 session
        activeWorktrees.delete(session.id || 'default');

        return {
          reply: `✅ PR 创建成功！

🔗 ${prUrl}
👤 Commit Author: ${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>

请等待评审通过后合并到 main～`
        };

      } catch (error) {
        return { reply: `❌ 操作失败：${error.message}` };
      }
    },

    /**
     * 查看当前 worktree 状态
     */
    async status({ session }) {
      const worktreeInfo = activeWorktrees.get(session.id || 'default');
      if (!worktreeInfo) {
        return { reply: '当前没有活动的 worktree' };
      }

      return {
        reply: `当前 worktree 信息：
📁 路径：\`${worktreeInfo.path}\`
🔀 分支：\`${worktreeInfo.branch}\`
📝 需求：${worktreeInfo.description}
👤 Commit Author: ${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`
      };
    },

    /**
     * 清理 worktree
     */
    async cleanup({ session }) {
      const worktreeInfo = activeWorktrees.get(session.id || 'default');
      if (!worktreeInfo) {
        return { reply: '当前没有活动的 worktree' };
      }

      try {
        execSync(`git worktree remove "${worktreeInfo.path}"`, { stdio: 'pipe' });
        activeWorktrees.delete(session.id || 'default');
        return { reply: `✅ 已清理 worktree: ${worktreeInfo.path}` };
      } catch (error) {
        return { reply: `❌ 清理失败：${error.message}` };
      }
    },

    /**
     * 快速创建 PR（无需之前的流程）
     * 用法：/wf create-pr <分支名> <PR 标题>
     */
    async createPr({ args, session }) {
      if (args.length < 2) {
        return { reply: '用法：/wf create-pr <分支名> <PR 标题>' };
      }

      const branchName = args[0];
      const prTitle = args.slice(1).join(' ');
      const prBody = 'PR created via git-workflow skill';

      try {
        const prUrl = createPullRequest(branchName, prTitle, prBody);
        return { reply: `✅ PR 创建成功！\n\n🔗 ${prUrl}` };
      } catch (error) {
        const fallbackUrl = generatePRLink(branchName, prTitle, prBody);
        return { reply: `⚠️ API 创建失败：${error.message}\n\n请手动创建：${fallbackUrl}` };
      }
    }
  },

  /**
   * 获取活动的 worktree 信息（供其他 skill 使用）
   */
  getWorktreeInfo(sessionId) {
    return activeWorktrees.get(sessionId || 'default');
  }
};
