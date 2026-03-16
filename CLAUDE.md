# CLAUDE.md - Monorepo 开发指南

## 项目结构

这是一个 monorepo 工作空间，包含：

| 目录 | 类型 | 上游仓库 |
|------|------|---------|
| `claw-family/` | 一方代码 | github.com:slashhuang/claw-family |
| `futu-openD/` | 一方代码 | github.com:slashhuang/futu-openD |
| `external-refs/openclaw/` | 外部参考 | github.com:openclaw/openclaw |

## 重要说明

1. **外部依赖隔离**: `external-refs/` 目录下的代码仅供阅读和参考，不直接参与构建
2. **独立可拆分**: 每个子目录都可以独立拆分出来作为独立仓库运行
3. **git subtree 管理**: 使用 git subtree 与上游仓库同步

## 常用命令

### 同步上游代码

```bash
# 拉取 claw-family 更新
git subtree pull --prefix claw-family claw-family-upstream main --squash

# 拉取 futu-openD 更新
git subtree pull --prefix futu-openD futu-openD-upstream main --squash

# 拉取 openclaw 更新（仅参考）
git subtree pull --prefix external-refs/openclaw openclaw-upstream main --squash
```

### 推送更改

```bash
# 推送到 claw-family
git subtree push --prefix claw-family claw-family-upstream main

# 推送到 futu-openD
git subtree push --prefix futu-openD futu-openD-upstream main
```

### 查看子目录的变更

```bash
git log --oneline -- claw-family/
git diff HEAD -- claw-family/
```

## 开发注意事项

- 修改一方代码时，考虑是否需要推送到对应的上游仓库
- 参考 openclaw 代码时，不要直接修改，而是从中汲取设计思路
- 提交信息应清晰说明修改的目录范围
