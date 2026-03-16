# PRD：自动清理已合并分支的 Worktree

**版本**：1.0  
**日期**：2026-03-10  
**作者**：阿布  
**状态**：待确认

---

## 背景

当前使用 git worktree + PR 流程开发时，PR 合并后 worktree 不会自动清理，需要手动执行 `git worktree remove`。时间一长会积累多个已合并的 worktree，占用磁盘空间且造成混乱。

## 目标

实现**自动清理**机制：当检测到某个分支已被合并到 main，自动删除对应的 worktree。

## 需求范围

### 触发条件

1. **代码同步时检查**：每次执行 `code-sync`（用户说「同步代码」、「更新代码」等）时，自动扫描并清理
2. **BOOT 阶段检查**：Gateway 重启后执行 BOOT 流程时，扫描并清理
3. **可选：定期 heartbeat 检查**：每天或每周检查一次（可选）

### 清理逻辑

1. **获取本地 worktree 列表**：`git worktree list`
2. **过滤 worktree**：
   - 排除主工作区（main 分支）
   - 排除当前正在使用的 worktree
   - 只处理命名规范的分支（`feat/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*` 等）
3. **检查分支是否已合并**：
   - 对每个 worktree 对应的分支，执行 `git branch --merged main` 或 `git merge-base --is-ancestor <branch> main`
   - 若已合并到 main（或 origin/main），则标记为可清理
4. **删除 worktree**：
   - 执行 `git worktree remove <path>`
   - 若删除失败（如有未提交更改），则跳过并记录警告
5. **可选：删除远程分支**：
   - 若远程分支也存在且已合并，可提示用户是否删除（或配置自动删除）

### 配置项（可选）

在 `config/worktree-cleanup.json` 或通过环境变量配置：

```json
{
  "enabled": true,
  "dry_run": false,
  "branch_prefixes": ["feat/", "fix/", "docs/", "chore/", "refactor/"],
  "exclude_patterns": ["main", "master", "develop"],
  "delete_remote": false,
  "notify_on_cleanup": true
}
```

### 输出与通知

- **清理日志**：输出到控制台，格式如：
  ```
  [worktree-cleanup] 扫描到 3 个 worktree
  [worktree-cleanup] 分支 fix/python36-compat 已合并到 main，删除 worktree...
  [worktree-cleanup] 已删除：/root/githubRepo/claw-family--fix-python36-compat
  [worktree-cleanup] 完成，共清理 1 个 worktree
  ```
- **飞书通知**（可选）：若配置了 `notify_on_cleanup: true`，清理后用 message 工具通知用户

### 安全保护

- ✅ 不删除主工作区（main/master）
- ✅ 不删除当前正在使用的 worktree
- ✅ 不删除有未提交更改的 worktree（除非强制）
- ✅ 默认不删除远程分支（需显式配置）
- ✅ dry-run 模式支持

## 实现方案

### 方案 A：集成到 code-sync skill（推荐）

**修改**：`skills/code-sync/scripts/sync.py`

在代码同步完成后、重启 Gateway 之前，调用清理函数。

**优点**：
- 代码同步是高频操作，能及时清理
- 与现有流程集成，无需额外触发
- 用户感知自然（同步时顺便清理）

**缺点**：
- 若用户很久不同步代码，可能积累 worktree

### 方案 B：独立 cleanup skill

**新增**：`skills/worktree-cleanup/SKILL.md` + 脚本

**触发方式**：
- 用户指令：「清理 worktree」、「清理分支」
- cron 定时：每周日凌晨 2 点
- heartbeat：每周检查一次

**优点**：
- 职责分离，code-sync 保持专注
- 可独立配置和触发

**缺点**：
- 需要额外配置 cron 或 heartbeat
- 用户可能忘记主动触发

### 方案 C：Git Hook（不推荐）

在 `.git/hooks/post-merge` 或 `post-checkout` 中触发。

**缺点**：
- Hook 只在本地 git 操作时触发
- 不适用于远程合并场景
- 配置复杂，易出错

## 推荐方案

**方案 A**：集成到 code-sync skill

理由：
- 用户每次说「同步代码」时自动清理，符合自然工作流
- 无需额外配置 cron 或 heartbeat
- 实现简单，风险低

## 技术细节

### 检查分支是否已合并

```bash
# 方法 1：检查是否已合并到本地 main
git branch --merged main | grep -E "^\s*<branch-name>$"

# 方法 2：检查是否已合并到 origin/main（更准确）
git merge-base --is-ancestor <branch> origin/main && echo "merged"

# 方法 3：获取 merge commit
git log --oneline --ancestry-path <branch>..origin/main | head -1
```

推荐用**方法 2**，因为 PR 通常是合并到 origin/main 而非本地 main。

### 删除 worktree

```bash
# 普通删除
git worktree remove <path>

# 强制删除（会丢失未提交更改，慎用）
git worktree remove --force <path>

# 删除后清理分支（可选）
git branch -d <branch-name>
```

### Python 实现示例

```python
def cleanup_merged_worktrees(repo_root, dry_run=False):
    """清理已合并分支的 worktree"""
    # 获取 worktree 列表
    worktrees = get_worktree_list(repo_root)
    
    # 获取已合并到 origin/main 的分支
    merged_branches = get_merged_branches(repo_root, 'origin/main')
    
    cleaned = []
    for wt in worktrees:
        # 跳过主工作区和当前 worktree
        if is_main_worktree(wt) or is_current_worktree(wt):
            continue
        
        # 检查分支是否已合并
        if wt.branch in merged_branches:
            if dry_run:
                print(f"[dry-run] 将删除：{wt.path}")
            else:
                remove_worktree(wt.path)
                cleaned.append(wt.path)
    
    return cleaned
```

## 验收标准

- [ ] 执行 code-sync 时自动扫描 worktree
- [ ] 正确识别已合并到 origin/main 的分支
- [ ] 成功删除已合并分支的 worktree
- [ ] 不删除主工作区和当前 worktree
- [ ] 不删除有未提交更改的 worktree（除非强制）
- [ ] 输出清晰的清理日志
- [ ] 支持 dry-run 模式
- [ ] 代码通过测试，无回归问题

## 后续扩展（可选）

1. **远程分支清理**：配置 `delete_remote: true` 时，自动删除已合并的远程分支
2. **通知机制**：清理后飞书通知用户
3. **统计报告**：每月报告清理了多少 worktree，节省了多少空间
4. **保留策略**：最近 7 天合并的分支不删除（方便回滚检查）

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 误删未合并分支 | 严格检查 merge-base，只删除确认已合并的 |
| 丢失未提交代码 | 检查 git status，有更改则跳过或警告 |
| 删除当前 worktree | 比对当前工作目录路径，排除当前 worktree |
| 权限问题 | worktree 目录权限不足时跳过并记录 |

## 时间估算

- PRD 评审：用户确认
- 实现：1-2 小时
- 测试：30 分钟
- 总计：约 2-3 小时

## 依赖

- Git ≥ 2.5（支持 worktree）
- Python 3.6+（兼容服务器环境）

---

## 待确认

请爸爸确认：

1. **触发时机**：仅 code-sync 时清理，还是也要加 cron/heartbeat？
2. **远程分支**：是否要自动删除已合并的远程分支？（默认不删）
3. **通知**：清理后是否需要飞书通知？
4. **保留策略**：是否需要保留最近 N 天合并的分支？

确认后阿布再实施～👧
