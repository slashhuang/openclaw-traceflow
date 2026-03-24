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

## 触发条件
**任何涉及本仓库代码/配置修改的请求**都自动启用此流程，无需用户明确说明。

## 仓库结构认知

**重要**：`claw-sources` 是 monorepo 根目录（git 仓库）：

```
claw-sources/  ← git 仓库根目录
├── docs/  ← PRD 文档（本仓库需求文档）
├── claw-family/  ← OpenClaw runtime 主项目
│   ├── skills/  ← 技能代码
│   ├── config/  ← 配置
│   ├── workspace-defaults/  ← bootstrap 模板
│   └── openClawRuntime/.workspace/  ← workspace（SOUL.md, memory/ 等）
├── futu-openD/  ← 富途 OpenD 项目
├── openclaw-traceflow/  ← TraceFlow UI 项目
└── external-refs/  ← 外部参考代码
```

## 判断标准

### 是否需要 PR

| 修改类型 | 目录 | 是否需要 PR |
|---------|------|-----------|
| 代码/配置 | `claw-family/skills/`, `claw-family/config/`, `claw-family/workspace-defaults/` | ✅ 必须 |
| PRD 文档 | `docs/` | ✅ 必须 |
| 子项目 | `futu-openD/`, `openclaw-traceflow/` | ✅ 必须 |
| workspace 文档 | `claw-family/openClawRuntime/.workspace/` | ❌ 不需要 |
| 仅查看 | 任意 | ❌ 不需要 |

### 是否需要 PRD

| 需求类型 | 是否需要 PRD |
|---------|-----------|
| **修 bug（fix）** | ❌ 不需要 |
| **功能扩展** | ✅ 需要（先 PRD → 用户确认 → 实施） |
| **纯文档 typo** | ❌ 不需要 |

**注意**：
- PRD 文档存放在 `claw-sources/docs/`，命名：`prd-<英文主题>-YYYY-MM-DD.md`
- **worktree 必须基于 claw-sources 根目录创建**：`../claw-sources--feat-xxx`

## 核心原则

1. **自动创建 PR**：推送后必须调用 GitHub API 创建 PR，**禁止**让用户手动创建
2. **Token 获取优先级**：
   1. 环境变量 `GITHUB_TOKEN` 或 `GH_TOKEN`
   2. 仓库根目录 `.env` 文件
   3. 用户家目录 `~/.env` 文件
   4. 报错终止，提示用户配置
3. **直接返回 PR 链接**：如 `https://github.com/slashhuang/claw-sources/pull/66`
4. **失败处理**：API 失败必须报错并说明原因（Token 无效、权限不足等）
5. **OpenClaw 源码优先**：涉及核心逻辑修改，**必须**先查阅源码

## OpenClaw 源码查阅指引

**何时需要查阅**：
- 修改 OpenClaw 配置（`config/openclaw.partial.json`）
- 修改 skills 配置或添加新 skill
- 修改 gateway、agent、hooks、channel、browser、tools 配置
- 遇到报错需要定位核心逻辑

**源码位置**：
- 本地：`/root/githubRepo/claw-sources/external-refs/openclaw/src/`
- 云端：`/data/claw-family/openclaw/src/` 或类似路径

**核心模块**：
| 模块 | 路径 |
|------|------|
| 工具系统 | `src/agents/tools/` |
| 配置 Schema | `src/config/types.tools.ts` |
| Gateway | `src/gateway/` |
| Agent 核心 | `src/agents/` |
| Skills 系统 | `src/skills/` |
| 飞书 Channel | `src/channels/feishu/` |
| 配置合并 | `src/config/config-loader.ts` |

**查阅流程**：
1. 用 `Glob` 或 `Grep` 搜索相关代码
2. 阅读核心逻辑文件，确认机制
3. 基于源码理解进行修改

## 工作流

### 1. 判断是否需要 PRD
- **修 bug**：直接进入步骤 2
- **功能扩展**：先写 PRD → 用户确认 → 合并 PRD PR → 进入步骤 2

### 2. 创建 worktree

```bash
# 生成分支名
分支名 = "feat/" + 需求英文名（小写，连字符分隔）

# 获取最新 main
git fetch origin main

# 创建 worktree（在 claw-sources 同级目录）
git worktree add ../claw-sources--{分支名} -b {分支名} origin/main
```

**worktree 路径示例**：
- ✅ 正确：`/root/githubRepo/claw-sources--feat-xxx`
- ✅ 正确：`~/claw-sources--feat-xxx`
- ❌ 错误：`/root/githubRepo/claw-sources/claw-family--feat-xxx`

### 3. 在 worktree 中开发
- 切换到 worktree 目录
- 执行代码修改
- 提交更改

### 4. 推送并创建 PR（必须步骤）

```bash
# 推送分支
git push -u origin {分支名}

# 自动创建 PR
./skills/git-workflow/scripts/create_pr.sh "{分支名}" "feat: 需求描述" "变更内容..."
```

**PR 创建成功后**：
- 返回 PR 链接
- 飞书通知用户 PR 链接 + 变更摘要
- 等待用户确认「可以合并」

**禁止行为**：
- ❌ 返回 `/new/分支名` 链接让用户手动创建
- ❌ 跳过 API 调用

### 5. 用户确认后合并 PR

**必须用 merge_pr.sh 脚本**（不要直接用 `gh pr merge`）：

```bash
./skills/git-workflow/scripts/merge_pr.sh {PR 号} merge
```

**为什么必须用 merge_pr.sh**：
- ✅ 自动删除远程分支
- ✅ 调用 GitHub API 正确合并
- ❌ `gh pr merge` 不会清理分支

### 6. 合并后同步代码（必须步骤）

**合并后必须执行 code-sync**（不要直接用 `bootstrap.sh`）：

```bash
python3 skills/code-sync/scripts/sync.py
```

**为什么必须用 code-sync**：
- ✅ 同步主仓库 + 所有 subtree
- ✅ 自动清理已合并的 worktree
- ✅ 保存同步报告
- ❌ `bootstrap.sh | tail` 会导致 SIGINT 信号杀死进程

### 7. 重启 Gateway（用 PM2）

```bash
pm2 restart claw-gateway
```

**为什么用 PM2**：
- ✅ PM2 管理进程，安全重启
- ❌ `bootstrap.sh` 用 `exec` 替换进程，不适合管道操作

### 8. 清理 worktree（可选）

```bash
git worktree remove ../claw-sources--{分支名}
```

**注意**：code-sync 已自动清理，此步骤通常不需要。

---

## 合并 PR 后的完整流程（重要！）

```bash
# 1. 合并 PR（必须用 merge_pr.sh）
./skills/git-workflow/scripts/merge_pr.sh 34 merge

# 2. 同步代码（必须用 code-sync）
python3 skills/code-sync/scripts/sync.py

# 3. 重启 Gateway（用 PM2）
pm2 restart claw-gateway
```

**禁止行为**：
- ❌ `gh pr merge`（不用 merge_pr.sh）
- ❌ `./bootstrap.sh | tail -30`（管道会导致 SIGINT）
- ❌ `cd xxx && ./bootstrap.sh`（应该用 code-sync）

## 分支命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| PRD 文档 | `docs/prd-<主题>-YYYY-MM-DD` | `docs/prd-git-workflow-2026-03-17` |
| 新功能 | `feat/` | `feat/feishu-github-sync` |
| Bug 修复 | `fix/` | `fix/startup-error` |
| 文档更新 | `docs/` | `docs/add-architecture` |
| 配置变更 | `chore/` | `chore/update-model-config` |
| 重构 | `refactor/` | `refactor/config-loader` |

## 飞书回复格式

**涉及本仓库时**必须包含：
- ✅ **是否涉及本仓库**
- ✅ **是否先写 PRD**
- ✅ **worktree 路径**
- ✅ **PR 链接**

### 示例回复

**功能扩展（PRD 阶段）**：
```
流程说明：
- ✅ 是否涉及本仓库：是
- ✅ 是否先写 PRD：是（功能扩展，先 PRD 后实施）
- ✅ worktree 路径：/root/githubRepo/claw-sources--docs-prd-xxx
- ✅ PR 链接：https://github.com/slashhuang/claw-sources/pull/X
```

**修 bug（直接实施）**：
```
流程说明：
- ✅ 是否涉及本仓库：是
- ✅ 是否先写 PRD：否（按 fix 流程，直接实施）
- ✅ worktree 路径：/root/githubRepo/claw-sources--fix-xxx
- ✅ PR 链接：https://github.com/slashhuang/claw-sources/pull/X
```

**不涉及本仓库**：
```
本次不涉及本仓库修改～
```

## 故障排除

### Token 相关错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `GITHUB_TOKEN not found` | 未配置 Token | 在环境变量或 `.env` 文件中配置 |
| `Bad credentials` | Token 无效或过期 | 重新生成 Token：https://github.com/settings/tokens |
| `Missing repo scope` | Token 权限不足 | 确保 Token 有 `repo` 权限 |

### worktree 相关错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `worktree already exists` | worktree 已存在 | `git worktree remove` 删除后重试 |
| `not a git repository` | 不在仓库根目录 | 确保在 `claw-sources/` 根目录执行 |

### PR 创建失败

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `API rate limit exceeded` | GitHub API 限流 | 等待 1 小时或使用认证的 Token |
| `branch already exists` | 分支已存在 | 删除远程分支后重试 |
| `PR already exists` | PR 已存在 | 直接使用现有 PR |

## 依赖

- `git`（≥2.5，支持 worktree）
- `curl`（调用 GitHub API）
- `GITHUB_TOKEN`（具备 `repo` 权限）

## 命令接口

### 自动生成 worktree
```
/auto-worktree <需求描述>
```

### 手动指定分支名
```
/worktree <分支名>
```

### 清理 worktree
```
/cleanup-worktree <分支名或路径>
```

### 自动创建 PR
```bash
./skills/git-workflow/scripts/create_pr.sh [分支名] [PR 标题] [PR 描述]
```

### 自动合并 PR
```bash
./skills/git-workflow/scripts/merge_pr.sh <PR 号> [合并方式]
```
- 合并方式：`merge`、`squash`、`rebase`

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
3. 创建 worktree：`../claw-sources--feat-startup-env-check`
4. worktree 创建好啦！路径：`/root/githubRepo/claw-sources--feat-startup-env-check`
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
