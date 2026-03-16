# CLAUDE.md - Monorepo 开发指南

## 项目结构

这是一个 monorepo 工作空间，**单一事实来源是 `claw-sources/.git`**。

| 目录 | 类型 | 说明 |
|------|------|------|
| `claw-family/` | 一方项目 | OpenClaw + 飞书封装（主项目） |
| `futu-openD/` | 一方项目 | 富途 OpenD 封装 |
| `external-refs/openclaw/` | 外部参考 | 参考代码，不直接修改 |

## 快速开始

### 开发流程（简化版）

```bash
# 1. 在子包目录开发
cd claw-family
vim skills/my-skill/index.js

# 2. 提交到 monorepo
cd ..
git add claw-family/
git commit -m "feat: 新功能"

# 3. 推送到 claw-sources
git push origin main
```

**就这么简单！** 不需要复杂的 git 操作。

### 子包独立性

每个子包都是完整项目，随时可以独立拆分：
- ✅ 有独立的 `package.json`
- ✅ 有独立的启动脚本
- ✅ 可以直接复制出来运行

---

## 详细文档

| 文档 | 用途 |
|------|------|
| [docs/MONOREPO-SIMPLIFIED.md](docs/MONOREPO-SIMPLIFIED.md) | **简化版开发指南（推荐先看这个）** |
| [docs/monorepo-workflow.md](docs/monorepo-workflow.md) | 完整版 Monorepo 流程（含 subtree 同步） |
| [claw-family/CLAUDE.md](claw-family/CLAUDE.md) | claw-family 项目说明 |
