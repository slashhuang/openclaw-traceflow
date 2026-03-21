# Monorepo 开发流程

本文档说明如何在 `claw-sources` monorepo 中开发和管理一方仓库（**openclaw-traceflow**、claw-family、futu-openD）。三者均以 **git subtree** 维护；本仓库 **不包含** 独立的「OpenClaw Monitor」子工程。

## 架构图

```
┌────────────────────────────────────────────────────────────────────┐
│           claw-sources/ (Monorepo Root)                            │
│           Single Source of Truth                                   │
│  git@github.com:slashhuang/claw-sources.git                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ openclaw-traceflow/│  │ claw-family/ │  │ futu-openD/  │       │
│  │ 一方仓库 (subtree)  │  │ 一方仓库      │  │ 一方仓库      │       │
│  │ 可观测仪表盘        │  │ (OpenClaw…)  │  │ (富途 OpenD)  │       │
│  └─────────┬──────────┘  └──────┬───────┘  └──────┬───────┘       │
│            │                    │                  │               │
│            │ subtree push       │ subtree push     │ subtree push  │
│            ↓                    ↓                  ↓               │
│  ┌──────────────────────────────┐    ┌──────────────┐    ┌──────────────┐
│  │ upstream                     │    │ upstream     │    │ upstream     │
│  │ git@github.com:slashhuang/   │    │ slashhuang/  │    │ slashhuang/  │
│  │ openclaw-traceflow.git       │    │ claw-family  │    │ futu-openD   │
│  └──────────────────────────────┘    └──────────────┘    └──────────────┘
└────────────────────────────────────────────────────────────────────┘
```

## 核心原则

### 1. Single Source of Truth

**`claw-sources/.git` 是唯一开发源头**

- ✅ 所有开发在 monorepo 中进行
- ✅ 提交历史保存在 monorepo
- ✅ CI/CD、PR、Issue 都在 monorepo 管理
- ❌ 不要直接在上游仓库开发

### 2. 上游是发布目标

一方仓库（git subtree）与上游远程对应关系（示例）：

| 子目录 | 上游仓库 |
|--------|----------|
| `openclaw-traceflow/` | `git@github.com:slashhuang/openclaw-traceflow.git` |
| `claw-family/` | `github.com:slashhuang/claw-family`（以你本地 `git remote` 为准） |
| `futu-openD/` | `github.com:slashhuang/futu-openD`（以你本地 `git remote` 为准） |

上游仓库的角色：
- 发布目标（subtree push）
- 独立使用者克隆入口
- **不是**开发源头

### 3. 统一管控

通过 monorepo 统一管理：
- 共享配置（GH_TOKEN、通用脚本）
- 跨项目依赖
- 统一的开发流程

## 开发流程

### 日常开发

```bash
# 1. 在 monorepo 中开发
cd /Users/huangxiaogang/claw-sources/claw-family

# 2. 修改代码
vim config/openclaw.partial.json
vim skills/my-skill/index.js

# 3. 提交到 monorepo
cd /Users/huangxiaogang/claw-sources
git add claw-family/config/openclaw.partial.json
git add claw-family/skills/my-skill/index.js
git commit -m "feat: 添加新功能"

# 4. 推送到 monorepo 上游
git push origin main
```

### 同步到上游仓库

当 claw-family 有独立使用者需要克隆时，或需要备份到上游：

```bash
# 方式 1: 使用同步脚本（推荐）
cd /Users/huangxiaogang/claw-sources
./scripts/subtree-sync.sh sync claw-family push

# 方式 2: 使用 npm scripts（在 claw-family 目录）
cd claw-family
npm run git:sync:push

# 方式 3: 手动命令
git subtree push --prefix claw-family claw-family-upstream main
```

### 从上游拉取更新

如果在上游仓库有独立提交（很少见）：

```bash
# 拉取上游更新到 monorepo
./scripts/subtree-sync.sh sync claw-family
```

## 常用命令速查

### 在 claw-family 目录内

```bash
cd claw-family

# 服务管理
npm run start      # 启动开发服务
npm run restart    # 重启服务
npm run logs       # 查看日志

# Git/Subtree（自动切换到 monorepo 根目录）
npm run git:status    # 查看 subtree 状态
npm run git:pull      # 拉取所有 subtree
npm run git:push      # 推送所有 subtree
npm run git:sync      # 同步 claw-family 到上游
npm run git:sync:push # 推送 claw-family 到上游

# 工具
npm run gh:token-check  # 检查 GitHub Token
npm run docs:openclaw   # 查看 OpenClaw 源码指南
```

### 在 monorepo 根目录

```bash
cd /Users/huangxiaogang/claw-sources

# 查看所有 subtree 状态
./scripts/subtree-sync.sh status

# 同步单个 subtree
./scripts/subtree-sync.sh sync claw-family
./scripts/subtree-sync.sh sync claw-family push

# 同步所有 subtree
./scripts/subtree-sync.sh pull
./scripts/subtree-sync.sh push

# 查看子目录变更
git log --oneline -- claw-family/
git diff HEAD -- claw-family/
```

## 分支管理

### Monorepo 分支

```
claw-sources/
├── main (受保护分支)
├── feat/xxx (功能分支)
└── fix/xxx (修复分支)
```

所有分支操作在 monorepo 根目录进行：

```bash
# 创建功能分支
git checkout -b feat/new-skill

# 开发完成后提交
git add claw-family/skills/new-skill/
git commit -m "feat: 添加新技能"

# 创建 PR（到 claw-sources）
gh pr create --title "feat: 添加新技能" --body "描述..."
```

### Subtree 分支

Subtree 同步到上游时，自动推送到上游的 `main` 分支。

## 版本管理

### Monorepo 版本

Monorepo 本身不维护版本号，以提交 SHA 为准。

### 一方仓库版本

每个一方仓库（claw-family）在推送到上游时，可以在上游仓库打标签：

```bash
# 在上游仓库打标签（在 monorepo 根目录）
git subtree push --prefix claw-family claw-family-upstream v1.0.0
```

## 依赖管理

### 共享依赖

`claw-sources` 根目录 **无** `package.json`；依赖在各子项目内安装（如 `openclaw-traceflow/`、`claw-family/`）。

### 项目独立依赖

每个一方仓库独立管理自己的依赖：

```bash
cd claw-family
npm install lodash
```

## CI/CD

### Monorepo CI

在 `claw-sources` 配置 GitHub Actions，对所有 subtree 进行 CI：

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    paths:
      - 'claw-family/**'
      - 'futu-openD/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Test claw-family
        run: |
          cd claw-family
          npm install
          npm test
```

### 上游仓库 CI

每个一方仓库的上游仓库可以有自己的 CI，用于：
- 独立使用者克隆后的测试
- 发布 npm 包（如果适用）

## 常见问题

### ⚠️ 在 claw-family 中直接 git push 会怎样？

**问题**：`claw-family/` 不是独立的 git 仓库，它使用 `claw-sources/.git`。

```bash
cd claw-family
git add .
git commit -m "feat: 新功能"
git push origin main   # ❌ 错误！
```

**后果**：
| 问题 | 说明 |
|------|------|
| 推送到哪里？ | `claw-sources` 的 origin (`github.com:slashhuang/claw-sources`) |
| 推送什么？ | **整个 monorepo**，包括 futu-openD、external-refs 等 |
| 能推到 claw-family-upstream 吗？ | ❌ 不能，`origin` 指向 claw-sources |

**正确做法**：
```bash
# 1. 在 monorepo 根目录提交
cd /Users/huangxiaogang/claw-sources
git add claw-family/
git commit -m "feat: 新功能"
git push origin main

# 2. 使用 subtree 同步到上游
./scripts/subtree-sync.sh sync claw-family push
```

### Q: 为什么不用 git submodule？

A: Submodule 需要使用者额外操作，subtree 更透明，一方仓库可以直接独立使用。

### Q: 为什么不用多仓库独立开发？

A: Monorepo 提供：
- 统一的配置管理（如 GH_TOKEN）
- 跨项目代码复用
- 统一的开发流程

### Q: 如何处理冲突？

A:
1. 先在 monorepo 中解决冲突
2. 再同步到上游

### Q: 可以只修改上游仓库吗？

A: 不推荐。应该：
1. 在 monorepo 中修改
2. subtree push 到上游

如果在上游直接修改，需要：
1. subtree pull 拉回 monorepo
2. 在 monorepo 中提交

## 最佳实践

1. **所有开发在 monorepo**: 不要直接在上游开发
2. **及时同步**: 开发完成后及时 subtree push
3. **清晰的提交信息**: 注明影响的子目录
4. **单一职责**: 每个提交只影响一个子目录为佳
5. **定期备份**: 定期 subtree push 到上游

## 参考文档

- [CLAUDE.md](../CLAUDE.md) - Monorepo 总说明
- [subtree-sync.sh](../scripts/subtree-sync.sh) - 同步脚本
- [claw-family/CLAUDE.md](../claw-family/CLAUDE.md) - claw-family 项目说明
