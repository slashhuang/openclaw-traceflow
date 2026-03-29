# claw-sources Monorepo 规范

本仓库是 **monorepo** 结构，通过 **subtree** 管理多个独立项目。

---

## 目录结构

```
claw-sources/
├── .github/workflows/          # GitHub Actions CI 配置
├── pnpm-workspace.yaml         # pnpm workspace 配置
├── package.json                # 根目录依赖（可选）
│
├── openclaw-traceflow/         # TraceFlow 可观测性平台（独立项目）
│   ├── README.md               # 独立文档
│   ├── package.json            # 独立依赖管理
│   ├── frontend/               # 前端项目（独立）
│   │   └── package.json
│   └── ...
│
├── claw-family/                # OpenClaw runtime 主项目
│   ├── skills/                 # AgentSkills
│   ├── config/                 # 配置
│   ├── workspace-defaults/     # Bootstrap 模板
│   └── openClawRuntime/        # Runtime
│
├── futu-openD/                 # 富途 OpenD 项目（subtree）
└── docs/                       # 共享文档
```

---

## 项目自治性原则

### 核心原则

1. **每个子项目都是独立的**
   - 有自己的 `package.json`
   - 可以独立 `git clone` 和 `pnpm install`
   - 不依赖 monorepo 根目录

2. **Monorepo wrapper 不破坏独立性**
   - 使用 pnpm workspace 管理依赖
   - 不修改子项目内部代码
   - 边界清晰，易于提取

3. **CI/CD 尊重项目结构**
   - GitHub Actions 在根目录配置
   - 使用 `working-directory` 指定项目目录
   - 每个项目可以有自己的 CI

---

## pnpm workspace

### 配置

```yaml
# pnpm-workspace.yaml
packages:
  - 'openclaw-traceflow'
  - 'openclaw-traceflow/frontend'
  - 'claw-family/*'
```

### 优势

- ✅ **一次安装**：`pnpm install` 自动安装所有项目依赖
- ✅ **依赖去重**：共同依赖只安装一次
- ✅ **保持独立**：每个项目有自己的 `package.json`
- ✅ **CI 简单**：只需一个 install 步骤

### 使用方式

```bash
# 安装所有项目依赖
pnpm install

# 在特定项目运行命令
pnpm --filter openclaw-traceflow run build
pnpm --filter claw-family run lint
```

---

## Subtree 管理

### 什么是 subtree

Subtree 是将独立 Git 仓库嵌入到 monorepo 的方式：

- 子项目有自己独立的 Git 历史
- 可以推送到独立的上游仓库
- 保持项目独立性

### 同步流程

```bash
# 1. 合并 PR 后同步代码
python3 skills/code-sync/scripts/sync.py

# 2. 脚本自动执行：
#    - git pull --ff-only (主仓库)
#    - git subtree push (推送到上游)
#    - 清理 worktree
```

### 推送规则

| 项目 | 上游仓库 | 推送条件 |
|------|---------|---------|
| `claw-family` | claw-family-upstream | 有本地提交 |
| `futu-openD` | futu-openD-upstream | 有本地提交 |
| `openclaw-traceflow` | openclaw-traceflow | 有本地提交 |

---

## CI/CD 规范

### GitHub Actions 配置

CI 配置文件放在 **monorepo 根目录** 的 `.github/workflows/`：

```yaml
# .github/workflows/ci-traceflow.yml
name: CI - TraceFlow

on:
  push:
    branches: [main]
    paths:
      - 'openclaw-traceflow/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./openclaw-traceflow
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm run lint
```

### 关键点

1. **`working-directory`**：指定项目目录
2. **`paths` 过滤**：只在相关文件变更时触发
3. **一次 install**：pnpm workspace 自动管理所有依赖

---

## 开发规范

### 分支管理

```bash
# 创建 worktree 分支（规范命名）
git worktree add ../claw-sources--feat-xxx -b feat/xxx origin/main

# 提交规范
feat(traceflow): 新功能
fix(traceflow): 修 bug
chore(traceflow): 配置/工具
docs(traceflow): 文档
```

### 提交规范

- `feat(project)`: 新功能
- `fix(project)`: 修 bug
- `chore(project)`: 配置/工具
- `docs(project)`: 文档
- `refactor(project)`: 重构

**project** 可以是：
- `traceflow`
- `claw-family`
- `futu-openD`
- `monorepo` (根目录变更)

### PR 流程

1. 创建 worktree 分支
2. 开发并提交
3. 推送并创建 PR
4. 用户 review
5. 合并 PR
6. 同步代码（code-sync）

---

## 项目提取指南

如果需要将子项目提取到独立仓库：

### TraceFlow 提取步骤

```bash
# 1. 克隆 monorepo
git clone https://github.com/slashhuang/claw-sources.git
cd claw-sources

# 2. 使用 sparse-checkout 只检出 traceflow
git sparse-checkout init --cone
git sparse-checkout set openclaw-traceflow

# 3. 移动到新仓库
mv openclaw-traceflow ../traceflow-standalone
cd ../traceflow-standalone

# 4. 初始化为独立仓库
git init
git add .
git commit -m "Initial commit from monorepo"

# 5. 推送到新仓库
git remote add origin https://github.com/xxx/traceflow.git
git push -u origin main
```

### 注意事项

- ✅ 确保 `package.json` 完整
- ✅ 确保 `.gitignore` 完整
- ✅ 确保文档完整（README.md 等）
- ✅ 确保 CI 配置可独立运行

---

## 常见问题

### Q: 为什么要用 subtree 而不是 submodule？

**A**: subtree 更简单：
- 不需要额外安装
- 不需要记住 submodule 命令
- 推送更直观
- 对 CI 友好

### Q: pnpm workspace 和 subtree 冲突吗？

**A**: 不冲突：
- workspace 管理依赖
- subtree 管理代码
- 两者互补

### Q: 如何确保子项目独立性？

**A**: 遵循原则：
1. 不修改子项目内部结构
2. 使用 workspace 而非代码耦合
3. CI 使用 `working-directory` 而非全局修改
4. 文档明确说明独立性

---

## 参考文档

- [pnpm workspace](https://pnpm.io/workspaces)
- [Git subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging)
- [GitHub Actions](https://docs.github.com/en/actions)
