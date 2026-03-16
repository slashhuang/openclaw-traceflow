# BOOT.md — Gateway 启动指令

**作用**：Gateway 启动后 Agent 执行的第一个指令。

---

## 任务：功能更新通知（幂等）

完成上述初始化后：

- **`.last_boot_commit` 位置**：位于 `.workspace/` 下，即 `.workspace/.last_boot_commit`（从仓库根算）。读、写都用该路径，不要猜其它目录。

1. 读取 `.workspace/.last_boot_commit`（若不存在视为首次）
2. 在**仓库根目录**执行 `git rev-parse HEAD` 获取当前 commit
3. **仅当 commit 不同时**：
   - 在仓库根执行 `git log --oneline <上次>..HEAD` 获取变更摘要
   - 用 **message 工具** 发送：「👧 阿布重启好啦～这次更新：」+ 摘要  
     **target 格式**：必须用 `user:open_id`（见 AGENTS.md「message 工具（Feishu）」）。生产环境可发妈妈 `user:ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4`、爸爸 `user:ou_3ea312add9031b59971788b123de0dd8`；**开发环境只有 test 账号**，只发给当前会话或省略多收件人，不要用 jojo/slashhuang 作为 target。
   - 将当前 commit 写入 `.workspace/.last_boot_commit`（覆盖原内容）
4. 回复 **NO_REPLY** 结束

---

**注意**：使用 message 工具后必须回复 **NO_REPLY**。


---

## 核心原则：飞书指令 → worktree + PR 交付（需求三）

规范来源：`docs/prd-workflow-2025-03-07.md` 需求三；技术细节见 `docs/PR-WORKFLOW.md`。

### 🚫 禁止直接修改

**凡在飞书（或本会话）收到的、涉及本仓库代码/配置修改的指令，都必须用 git worktree 在独立分支上完成，交付物为 GitHub PR 链接。**

### 是否涉及本仓库

| 操作类型 | 是否走 worktree+PR | 说明 |
|----------|-------------------|------|
| 修改代码/配置/文档（.js, .sh, .json, .md 等） | ✅ 需要 | config/, scripts/, skills/, docs/, workspace-defaults/ 等 |
| 新增/删除文件 | ✅ 需要 | 任何文件 |
| 仅查看、回答问题、讨论 | ❌ 不需要 | 不修改文件则无需 worktree |
| **例外** | 可不走 worktree+PR | 仅**纯文案/拼写 typo**（不改变逻辑、不新增文件）；紧急 hotfix 可事后补 PR |

### 修 bug（fix） vs 功能扩展

- **修 bug**：用户明确说是修 bug → **不写 PRD**，直接建 worktree + 分支 → 实现 → **1 个 PR**（实现 PR）→ 飞书回复中给 PR 链接。
- **功能扩展**（新功能、重构、结构/行为类变更）：
  1. 先为 **PRD 文档** 建 worktree + 分支 → 只提交 PRD → **PR ①（仅含 PRD）** → 把 PRD 内容/链接给用户看；
  2. 用户飞书里**明确说「确认」「同意」「可以」**后，**PR ① 须先合并**；
  3. 用户再说「基于该 PRD 实施」后，再建**第二个** worktree + 分支 → 实现 → **PR ②（实现）** → 飞书回复中给 PR ② 链接。
- 边界不清时：用户说是修 bug → 不写 PRD；否则按功能扩展，先 PRD 再实施。

### 飞书回复必须包含（AC6）

**当涉及本仓库时**，在流程相应阶段回复中须包含：

- **是否涉及本仓库**：本次指令是否会修改 claw-family 的代码/配置；
- **是否先写 PRD**：功能扩展则说明「先写 PRD 供确认」；修 bug 则说明「按 fix 流程，不写 PRD」；
- **worktree 路径**：若已创建 worktree，给出路径（如 `../claw-family--feat-xxx`）；
- **PR 链接**：完成开发并创建 PR 后，必须把 GitHub PR 链接回复给用户。

**当不涉及本仓库时**：只需说明「本次不涉及本仓库修改」，其余三项可省略或标「不适用」。

### 标准流程（简要）

```
收到需求
    ↓
是否涉及本仓库修改？
    ├─ 否 → 直接回答；回复中说明「本次不涉及本仓库修改」
    └─ 是 → 修 bug？
              ├─ 是 → worktree + 实现 → 1 个 PR → 回复含 PR 链接等
              └─ 否（功能扩展）→ PRD 单独 PR → 用户确认 → PR 合并 → 用户说「基于该 PRD 实施」→ 实现 worktree + PR ② → 回复含 PR 链接等
```

### 分支命名与 worktree 命令

| 类型 | 前缀 | 示例 |
|------|------|------|
| 新功能 | `feat/` | `feat/feishu-github-sync` |
| Bug 修复 | `fix/` | `fix/startup-error` |
| 文档/PRD | `docs/` | `docs/prd-xxx` |
| 配置/杂项 | `chore/` | `chore/update-config` |

worktree 创建示例：`git fetch origin main` → `git worktree add ../claw-sources--feat-xxx -b feat/xxx origin/main`。详见 `docs/PR-WORKFLOW.md` 与 `skills/git-workflow/SKILL.md`。

### 对话示例

**用户**：帮我修一下启动脚本报错

**阿布**：好的～这是修 bug，阿布按 fix 流程来，不写 PRD。  
涉及本仓库 ✅ / 不写 PRD（fix） / worktree：`../claw-sources--fix-startup-error`  
（完成后）PR 链接：https://github.com/slashhuang/claw-sources/pull/xx

---

**用户**：加一个 XXX 功能

**阿布**：好的～这是功能扩展，阿布先写 PRD 给你确认。  
涉及本仓库 ✅ / 先写 PRD 供确认 / worktree：`../claw-sources--docs-prd-xxx`  
PRD PR 链接：https://github.com/slashhuang/claw-sources/pull/xx  
你确认后合并这个 PR，再说「基于该 PRD 实施」，阿布再开实现 PR～

---

**用户**：看一下 config 里有什么

**阿布**：本次不涉及本仓库修改。（直接读文件回答即可）
