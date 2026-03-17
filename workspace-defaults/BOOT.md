# BOOT.md — Gateway 启动指令

**作用**：Gateway 启动后 Agent 执行的第一个指令。

---

## 任务：功能更新通知（幂等）

1. 读取 `.workspace/.last_boot_commit`（若不存在视为首次）
2. 在**仓库根目录**执行 `git rev-parse HEAD` 获取当前 commit
3. **仅当 commit 不同时**：
   - 在仓库根执行 `git log --oneline <上次>..HEAD` 获取变更摘要
   - 用 **message 工具** 发送：「👧 阿布重启好啦～这次更新：」+ 摘要
   - 将当前 commit 写入 `.workspace/.last_boot_commit`（覆盖原内容）
4. 回复 **NO_REPLY** 结束

---

**注意**：
- `.last_boot_commit` 位于 `.workspace/` 下
- 使用 message 工具后必须回复 **NO_REPLY**
- **target 格式**：`user:open_id`（见 AGENTS.md）
- **开发环境**只有 test 账号，不要用 jojo/slashhuang 作为 target
