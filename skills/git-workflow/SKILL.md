---
name: git-workflow
description: PRD 驱动的仓库修改自动化流程。自动创建 worktree 分支、推送代码、调用 GitHub API 自动创建 PR。**涉及 OpenClaw 修改时必须查阅源码**。
metadata:
  {
    "openclaw": {
      "emoji": "🔀",
      "requires": { "bins": ["git", "curl"] },
      "primaryEnv": "GITHUB_TOKEN",
    },
  }
---

# git-workflow — PRD 驱动的仓库修改自动化流程

## 描述
为严格遵循 `docs/prd-workflow-2025-03-07.md`（需求三）与 `docs/PR-WORKFLOW.md` 而设计的技能。自动执行：
- 按需求生成规范分支名（`feat/<name>`）
- 安全创建 Git worktree（推荐 external 模式：`../claw-family--feat-xxx`）
- 主工作区永不切分支，保障 `main` 干净
- 支持一键推送 + 生成 GitHub PR 链接（或调用 `gh` CLI）

## 触发条件（默认行为）
**任何涉及本仓库代码/配置修改的请求**都自动启用此流程，无需用户明确说明。

判断标准：
- ✅ 修改代码文件（.js, .sh, .json, .md 等）
- ✅ 修改配置文件（config/、bot 文件、ecosystem.config.cjs 等）
- ✅ 修改技能（skills/）
- ✅ 修改文档（docs/, workspace-defaults/）
- ✅ 新增/删除文件
- ❌ 仅查看代码、回答问题、讨论方案 → 不需要

## 核心原则
1. **自动创建 PR**：推送分支后必须调用 GitHub API 自动创建 PR，**禁止**让用户手动在浏览器创建
2. **Token 获取**：优先级：环境变量 `GITHUB_TOKEN`/`GH_TOKEN` > `.env` 文件 > `~/.zshrc` 中的配置 > 报错
3. **直接返回 PR 链接**：给用户的结果必须是已创建的 PR 链接（如 `https://github.com/slashhuang/claw-sources/pull/66`）
4. **失败处理**：如 API 创建失败，必须报错并说明原因（如 Token 无效、权限不足），不能降级为手动流程
5. **OpenClaw 源码优先**：涉及 OpenClaw 核心逻辑的修改，**必须**先查阅 openclaw 源码，不能靠猜测

## OpenClaw 源码查阅指引

**何时需要查阅源码**：
- 修改 OpenClaw 配置（`config/openclaw.partial.json`）
- 修改 skills 配置或添加新 skill
- 修改 gateway、agent、hooks 相关配置
- 修改 channel（飞书）集成配置
- 修改 browser、tools 配置
- 遇到报错需要定位 OpenClaw 核心逻辑

**源码位置**：
- 本地：`/Users/huangxiaogang/claw-sources/external-refs/openclaw/src/`
- 云端：根据部署路径，通常在 `/data/claw-family/openclaw/src/` 或类似位置

**核心模块路径**：
| 模块 | 路径 | 用途 |
|------|------|------|
| 工具系统 | `src/agents/tools/` | web-search、browser、fs、exec 等工具 |
| 配置 Schema | `src/config/types.tools.ts` | 工具配置类型定义 |
| 配置帮助 | `src/config/schema.help.ts` | 配置项说明 |
| Gateway | `src/gateway/` | Gateway 服务、RPC 通信 |
| Agent 核心 | `src/agents/` | Agent 创建、会话管理 |
| Skills 系统 | `src/skills/` | Skill 加载、执行 |
| 飞书 Channel | `src/channels/feishu/` | 飞书集成 |
| 配置合并 | `src/config/config-loader.ts` | 配置加载与合并逻辑 |

**查阅流程**：
1. 先用 `Glob` 或 `Grep` 搜索相关代码
2. 阅读核心逻辑文件，确认机制
3. 基于源码理解进行修改
4. 不要靠记忆或猜测修改

## 安全守则
- ✅ 自动校验主工作区是否为 clean `main`
- ✅ 拒绝在未 `git fetch origin main` 前创建分支
- ✅ worktree 路径自动去重（防覆盖）
- ❌ 不支持直接在主目录 `git checkout` —— 违反 PRD 原则

## 工作流

### 1. 接收任务
用户提出需求（如「帮我添加一个功能」或「修改 XXX 配置」）

### 2. 判断是否涉及代码改动
- 是 → 进入 git-workflow 流程
- 否 → 直接回答或操作

### 3. 创建分支和 worktree
```bash
# 生成分支名
分支名 = "feat/" + 需求英文名（小写，连字符分隔）

# 获取最新 main
git fetch origin main

# 创建 worktree（推荐 external 模式）
git worktree add ../claw-family--{分支名} -b {分支名} origin/main
```

### 4. 在 worktree 中开发
- 切换到 worktree 目录
- 执行代码修改
- 提交更改

### 5. 推送并自动创建 PR（必须步骤）
```bash
# 推送分支
git push -u origin {分支名}

# 自动创建 PR（调用 GitHub API）— 必须执行，不能跳过
./skills/git-workflow/scripts/create_pr.sh "{分支名}" "feat: 需求描述" "变更内容..."
```

**Token 获取逻辑**（在 `github_api.sh` 的 `get_token()` 函数中）：
1. 优先使用环境变量 `GITHUB_TOKEN`
2. 备用：读取仓库根目录 `.env` 文件中的 `GITHUB_TOKEN`
3. 都找不到则报错终止

**PR 创建成功后**：
- 直接返回已创建的 PR 链接（如 `https://github.com/slashhuang/claw-sources/pull/66`）
- 飞书通知用户 PR 链接 + 变更摘要
- 等待用户确认「可以合并」

**禁止行为**：
- ❌ 返回 `/new/分支名` 链接让用户手动创建
- ❌ 跳过 API 调用让用户自己点浏览器

### 6. 用户确认后自动合并 PR
用户回复「可以合并」后：
```bash
# 自动合并 PR
./skills/git-workflow/scripts/merge_pr.sh {PR 号} merge
```

**合并成功后**：
- 飞书通知用户合并结果
- 可选：删除远程分支

### 7. 清理 worktree（可选）
合并后可删除 worktree：
```bash
git worktree remove ../claw-family--{分支名}
```

## 分支命名规范

| 需求类型 | 前缀 | 示例 |
|---------|------|------|
| 新功能 | `feat/` | `feat/feishu-github-sync` |
| Bug 修复 | `fix/` | `fix/startup-error` |
| 文档更新 | `docs/` | `docs/add-architecture` |
| 配置变更 | `chore/` | `chore/update-model-config` |
| 重构 | `refactor/` | `refactor/config-loader` |

## 依赖
- `git`（≥2.5，支持 worktree）
- **自动创建 PR**：运行 OpenClaw 的环境需提供 `GITHUB_TOKEN`（具备 `repo` 权限），否则仅生成「手动创建 PR」链接。配置方式见 `docs/PR-WORKFLOW.md` §6（如 `openclaw.env.json` 或启动前 `export GITHUB_TOKEN=xxx`）。
- 仓库根 `.git` 目录存在

## 命令接口

### 自动生成 worktree
```
/auto-worktree <需求描述>
```
- 自动生成英文分支名
- 创建 worktree
- 返回 worktree 路径

### 手动指定分支名
```
/worktree <分支名>
```
- 创建指定名称的 worktree

### 清理 worktree
```
/cleanup-worktree <分支名或路径>
```
- 删除指定的 worktree

### 自动创建 PR
```bash
./skills/git-workflow/scripts/create_pr.sh [分支名] [PR 标题] [PR 描述]
```
- 自动从 commit message 提取标题（如未提供）
- 自动生成变更摘要作为描述（如未提供）
- 调用 GitHub API 创建 PR
- 输出 PR 链接

### 自动合并 PR
```bash
./skills/git-workflow/scripts/merge_pr.sh <PR 号> [合并方式]
```
- 合并方式：`merge`（普通合并）、`squash`（压缩合并）、`rebase`（变基合并）
- 合并成功后可选删除远程分支

### GitHub API 封装
```bash
source ./skills/git-workflow/scripts/github_api.sh
create_pr "标题" "描述" "feat/branch" "main"
merge_pr 17 merge
get_pr_status 17
delete_branch "feat/branch"
```

## 示例对话

**用户**：帮我修改 start-openclaw.sh，增加一个环境变量检查

**阿布**：好的～阿布需要修改代码，让我创建一个 worktree 分支来处理这个需求～

1. 生成分支名：`feat/startup-env-check`
2. 获取最新 main...
3. 创建 worktree：`../claw-family--feat-startup-env-check`
4. worktree 创建好啦！路径：`/root/githubRepo/claw-family--feat-startup-env-check`
5. 阿布现在去 worktree 里修改代码...

（修改完成，提交后）

**阿布**：代码改好啦！已推送分支并自动创建 PR：
**https://github.com/slashhuang/claw-sources/pull/67**

修改内容：
- `start-openclaw.sh` 增加环境变量检查逻辑

爸爸妈妈确认后可以合并～ 👧

---

**用户**：看一下 config/openclaw.partial.json 的内容

**阿布**：（直接读取文件，无需创建 worktree）

---

**用户**：帮我更新 README.md，添加架构图

**阿布**：好的～这是文档修改，阿布会创建一个 worktree 来处理：
1. 分支名：`docs/add-architecture-diagram`
2. 创建 worktree 中...
