---
name: code-sync
description: 代码同步（主仓库 + Subtree）与 worktree 清理。**不重启 Gateway**，重启需使用 `claw-family-restart` skill。当用户说「同步代码」、「更新代码」时自动执行。
metadata:
  {
    "openclaw": {
      "emoji": "🔄",
      "requires": { "bins": ["git"] },
    },
  }
---

# 代码同步 Skill

当用户说「同步代码」、「更新代码」、「拉代码」等指令时，自动执行代码同步。

## 触发指令

- 「同步代码」
- 「更新代码」
- 「拉代码」
- 「git pull」

## 执行流程

**仅执行代码同步，不重启 Gateway**：

1. **前置检查**：必须在 `main` 分支、工作区干净（无未提交改动）
2. **刷新远端状态**：`git fetch --all --prune`
3. **同步主仓库**：`git pull --ff-only`
4. **校准并同步所有 Subtree**：先确保 upstream remote 完整；检测到本地有未推送提交时跳过 pull（避免覆盖）
5. **安全推送本地修改**：`git subtree push` 前先做上游祖先预检查；检测到上游领先/分叉时使用 `ignore-joins fallback` 推送（避免 "cache already exists" 错误）
6. **清理 worktree**：运行 `cleanup_worktree.py` 删除已合并的 worktree
7. **保存报告**：写入 `.workspace/.sync_report.json`

## 手动执行

```bash
# 推荐：使用 Python 脚本（唯一入口）
python3 skills/code-sync/scripts/sync.py
```
## 输出示例

```
[code-sync] 仓库根目录：<动态获取，基于脚本路径>
[code-sync] 开始同步代码...
[code-sync] === 同步主仓库 ===
[code-sync] 同步前 commit: abc1234
[code-sync] ✅ 主仓库同步成功：abc1234 → def5678
[code-sync] === 同步 Subtree 项目（pull） ===
[code-sync] 🔄 同步 subtree: openclaw-traceflow (from openclaw-traceflow/main)
[code-sync]   ⏭️  检测到本地未推送提交，跳过 pull（由 push 步骤处理）
[code-sync] === 推送 Subtree 项目（push） ===
[code-sync] 🔄 推送 subtree: openclaw-traceflow (to openclaw-traceflow/main)
[code-sync]   ⚠️  检测到上游领先/分叉，跳过 pull，使用 ignore-joins fallback 推送
[code-sync]   ✅ 推送成功（ignore-joins fallback）
[code-sync] === 清理已合并的 worktree ===
...
[code-sync] ✅ 代码同步完成！如需重启 Gateway，请执行：./skills/claw-family-restart/scripts/restart.sh
```

## 依赖

- Git（仓库环境，支持 subtree）
- PM2（进程管理）
- Python 3.6+

## 注意事项

- **不重启 Gateway**：同步完成后如需重启，使用 `claw-family-restart` skill
- **PR 合并后流程**：
  1. `./skills/git-workflow/scripts/merge_pr.sh <PR 号> merge`
  2. `python3 skills/code-sync/scripts/sync.py`
  3. `./skills/claw-family-restart/scripts/restart.sh`（如需要）
- **禁止行为**：
  - ❌ `./bootstrap.sh | tail`（管道会导致 SIGINT 杀死进程）
  - ❌ `gh pr merge`（不用 merge_pr.sh）
  - ❌ 直接用 `bootstrap.sh`（应该用 code-sync）

## 状态检查

同步后可用以下命令检查：

```bash
git log --oneline -5
```

如需检查 Gateway 状态，使用 `claw-family-restart` skill。
