# PRD: 代码同步增强 - 支持主仓库 + Subtree 同步

**创建时间:** 2026-03-23  
**状态:** 待确认  
**分支:** feat/code-sync-subtree

---

## 背景

当前 `skills/code-sync/scripts/sync.py` 只同步主仓库（git pull），不支持 subtree 项目的同步。当用户说「更新代码」时，需要同时：
1. 同步主仓库（claw-sources）
2. 同步所有 subtree 项目（claw-family, futu-openD, openclaw-traceflow, external-refs/openclaw）
3. 报告详细的执行结果

---

## 目标

1. **一键同步**：用户说「更新代码」时自动完成主仓库 + 所有 subtree 的同步
2. **详细报告**：同步完成后告知用户每个项目的同步结果（成功/失败 + commit）
3. **幂等安全**：重复执行不会造成问题，失败时部分成功也可接受

---

## 功能需求

### F1: 主仓库同步
- 执行 `git pull --ff-only`
- 记录同步前后的 commit
- 记录同步结果（成功/失败）

### F2: Subtree 同步
- 遍历所有 subtree 项目：
  - claw-family → claw-family-upstream
  - futu-openD → futu-openD-upstream
  - openclaw-traceflow → openclaw-traceflow
  - external-refs/openclaw → openclaw-upstream
- 对每个 subtree 执行 `git subtree pull --prefix <dir> <remote> main --squash`
- 记录每个 subtree 的同步结果

### F3: Gateway 重启
- 保持现有逻辑：pm2 restart claw-gateway
- 验证 Gateway 启动状态

### F4: 执行报告
同步完成后生成 JSON 报告，包含：
```json
{
  "timestamp": "2026-03-23T19:00:00+08:00",
  "mainRepo": {
    "success": true,
    "beforeCommit": "abc1234",
    "afterCommit": "def5678",
    "message": "Fast-forward"
  },
  "subtrees": [
    {
      "dir": "claw-family",
      "remote": "claw-family-upstream",
      "success": true,
      "beforeCommit": "...",
      "afterCommit": "...",
      "message": "Squashed commit..."
    },
    ...
  ],
  "gatewayRestart": {
    "success": true,
    "action": "restart"
  }
}
```

---

## 非功能需求

- **性能**：subtree 同步串行执行，避免并发冲突
- **容错**：单个 subtree 失败不影响其他同步
- **日志**：详细日志输出便于排查问题

---

## 修改范围

### 修改文件
1. `skills/code-sync/scripts/sync.py` - 主同步脚本
2. `scripts/subtree-sync.sh` - 复用现有 subtree 同步逻辑（可选）

### 新增文件
1. `skills/code-sync/scripts/sync_subtree.py` - Subtree 同步模块（可选）

---

## 用户交互

### 触发方式
- 用户说：「更新代码」、「同步代码」、「拉代码」
- 执行：`python3 skills/code-sync/scripts/sync.py`

### 回复格式
```
👧 阿布同步完成啦～

**主仓库:** ✅ 已更新 (abc1234 → def5678)

**Subtree 项目:**
- claw-family: ✅ 已更新 (111 → 222)
- futu-openD: ✅ 无更新
- openclaw-traceflow: ❌ 失败：冲突
- external-refs/openclaw: ✅ 已更新 (333 → 444)

**Gateway:** ✅ 已重启

详情：[查看完整报告]
```

---

## 验收标准

1. ✅ 主仓库 git pull 成功
2. ✅ 所有 subtree 执行同步（成功或失败都有记录）
3. ✅ Gateway 重启成功
4. ✅ 生成详细执行报告
5. ✅ 用户收到清晰的同步结果通知

---

## 后续优化（可选）

- 支持选择性同步（只同步指定 subtree）
- 支持 dry-run 模式预览变更
- 支持 subtree push（双向同步）
