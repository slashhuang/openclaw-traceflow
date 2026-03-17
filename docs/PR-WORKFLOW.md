# PR 驱动开发流程

## 核心理念

**所有涉及本仓库代码/配置修改的操作，都必须通过 Git 分支和 Pull Request 流程完成，禁止直接修改。**

---

## 为什么需要 PR 流程？

1. **可追溯性**：每个改动都有对应的分支和 PR 记录
2. **代码评审**：合并前经过评审，保证质量
3. **安全回滚**：有问题可以快速回退
4. **并行开发**：多个需求可以同时进行，互不干扰

---

## 判断标准

| 操作类型 | 是否需要 worktree+PR | 说明 |
|----------|---------------------|------|
| 修改代码文件（.js, .sh, .json 等） | ✅ 需要 | 包括 config/, scripts/, skills/ |
| 修改文档（.md） | ✅ 需要 | docs/, workspace-defaults/, README.md |
| 新增/删除文件 | ✅ 需要 | 任何文件 |
| 修改配置（bot 文件、.json 等） | ✅ 需要 | 配置文件 |
| 仅查看代码 | ❌ 不需要 | 读取文件内容 |
| 回答问题/讨论 | ❌ 不需要 | 不修改文件 |
| 执行查看类命令 | ❌ 不需要 | git status, ls, cat 等 |

**原则**：只要涉及到本仓库的**代码或配置修改**，就必须走 PR 流程。

---

## 标准流程

### 1. 接收任务

用户提出需求（如「帮我修改 start-openclaw.sh，增加环境变量检查」）

### 2. 判断是否涉及代码改动

- 是 → 进入 git-workflow 流程
- 否 → 直接回答或操作

### 3. 生成分支名

格式：`<类型>/<需求英文名>`

| 类型 | 前缀 | 示例 |
|------|------|------|
| 新功能 | `feat/` | `feat/feishu-github-sync` |
| Bug 修复 | `fix/` | `fix/startup-error` |
| 文档更新 | `docs/` | `docs/add-architecture` |
| 配置变更 | `chore/` | `chore/update-model-config` |
| 重构 | `refactor/` | `refactor/config-loader` |

### 4. 创建 Git worktree

```bash
# 获取最新 main
git fetch origin main

# 创建 worktree（推荐在仓库外）
git worktree add ../claw-sources--feat-startup-env-check -b feat/startup-env-check origin/main
```

### 5. 在 worktree 中开发

```bash
cd ../claw-sources--feat-startup-env-check

# 进行修改
# ... 编辑文件 ...

# 提交
git add .
git commit -m "feat: 增加环境变量检查"
```

### 6. 推送并创建 PR

```bash
# 推送分支
git push -u origin feat/startup-env-check
```

**创建 PR**：git-workflow skill 会自动创建 PR（使用 gh CLI 或 GitHub API）。

**所需配置**：需在**运行 OpenClaw 的环境**里提供 `GITHUB_TOKEN`，否则会自动切换到浏览器手动创建模式。配置方式（任选其一）：

- **推荐**：在 `openclaw.env.json`（仓库根或 `config/`）中增加 `"GITHUB_TOKEN": "ghp_xxx"`。该文件若含敏感信息，不要提交，仅本地或部署机使用。
- 或在启动前执行 `export GITHUB_TOKEN=ghp_xxx`，再运行 `./scripts/start-openclaw.sh` 或 PM2。
- 生产用 PM2 时：在 `ecosystem.config.cjs` 的 `env` 中设置 `GITHUB_TOKEN: process.env.GITHUB_TOKEN`，并在启动 PM2 前在 shell 中 export。

Token 需具备 `repo` 权限（GitHub → Settings → Developer settings → Personal access tokens）。

**gh CLI 配置**：若已配置 `gh` CLI（`gh auth login` 成功），git-workflow 会优先使用 gh CLI 创建 PR；否则使用 GitHub API（curl）或浏览器手动创建。

### 7. 评审与合并

- 等待评审
- 评审通过后合并到 main
- 可选：删除 worktree 和远程分支

---

## 常用命令

### 列出所有 worktree
```bash
git worktree list
```

### 删除 worktree
```bash
git worktree remove ../claw-sources--feat-startup-env-check
```

### 清理工作区
```bash
# 如果目录已删除，仅从列表中清理
git worktree prune
```

---

## 对话示例

### 示例 1：修改代码

**用户**：帮我修改 start-openclaw.sh，增加环境变量检查

**阿布**：好的～阿布需要修改代码，让我创建一个 worktree 来处理这个需求～

1. 生成分支名：`feat/startup-env-check`
2. 获取最新 main... ✅
3. 创建 worktree：`../claw-sources--feat-startup-env-check` ✅
4. worktree 创建好啦！路径：`/Users/huangxiaogang/claw-sources--feat-startup-env-check`
5. 阿布现在去 worktree 里修改代码，完成后告诉你推送和创建 PR 的链接～

---

### 示例 2：查看文件

**用户**：看一下 config/openclaw.partial.json 的内容

**阿布**：（直接读取文件，无需 worktree）

---

### 示例 3：修改文档

**用户**：帮我更新 README.md，添加架构图

**阿布**：好的～这是文档修改，阿布会创建一个 worktree 来处理：

1. 分支名：`docs/add-architecture-diagram`
2. 创建 worktree 中...

---

## 相关文件

- `skills/git-workflow/SKILL.md` — git-workflow skill 说明
- `skills/git-workflow/index.js` — skill 实现
- `docs/prd-workflow-2025-03-07.md` — PRD 与需求文档规范（含需求三：飞书指令 → worktree + PR）
- `workspace-defaults/BOOT.md` — Agent 启动指令（包含 PR 流程要求）
- `workspace-defaults/SOUL.md` — Agent 行为准则（包含 PR 流程要求）

---

## 例外情况

仅限以下情况可以直接在 main 上修改：

1. **紧急 hotfix**：生产环境出现严重问题，需要立即修复
   - 事后必须补 PR 和说明

2. **仅文档 typo**：明显的拼写错误
   - 可以直接在 main 上小改

3. **不修改文件的讨论**：仅查看代码、回答问题、讨论方案
   - 不需要 worktree

有争议时以「涉及仓库内容变更」为准，走 PR 流程。
