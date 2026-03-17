# PRD: Git Workflow 技能与 AGENTS.md 流程优化

**Status:** `draft`  
**提出方:** slashhuang（爸爸）  
**日期:** 2026-03-17

---

## Context

当前 `git-workflow` 技能和 `AGENTS.md` 中存在以下问题：

1. **PRD 存放位置不明确**：技能描述中提到"修改文档（docs/, workspace-defaults/）"会触发 worktree，但未明确区分：
   - `claw-family/docs/`：产品需求文档（PRD），需走完整 PR 流程
   - `openClawRuntime/.workspace/docs/`：workspace 文档（MEMORY.md、USER.md 等），不需要 PR

2. **PRD 先行流程未严格执行**：技能描述中未强调**功能扩展必须先写 PRD 文档**，用户确认后才能开始实施

3. **分支命名与 PRD 关联不清晰**：未明确分支名应与 PRD 文件名对应

4. **缺少明确的判断逻辑**：什么情况下需要 PRD，什么情况下可以直接修 bug

---

## Goal

**用户视角：**
- 在飞书提需求时，阿布能明确告知：
  - 是否涉及本仓库修改
  - 是否需要先写 PRD（功能扩展）还是直接修 bug
  - worktree 路径
  - 最终交付 PR 链接

**执行方视角：**
- 收到飞书指令后，能自动判断是否需要 PRD
- 功能扩展：先创建 PRD 文档 PR → 用户确认 → 合并 PRD → 用户说"基于该 PRD 实施" → 创建实现 PR
- 修 bug：直接创建 worktree → 实现 → 创建 PR

---

## Acceptance Criteria

### AC1: 明确 PRD 存放位置
- ✅ 所有产品需求文档（PRD）必须放在 `claw-family/docs/` 下
- ✅ PRD 命名规范：`prd-<英文主题>-YYYY-MM-DD.md`
- ✅ workspace 文档（`openClawRuntime/.workspace/` 下的 MEMORY.md、USER.md 等）不需要 PRD

### AC2: 严格执行 PRD 先行
- ✅ **功能扩展**（新功能、重构、配置变更等）：必须先写 PRD 文档，用户确认后才能实施
- ✅ **修 bug**（fix）：不需要 PRD，直接走 worktree + PR 流程
- ✅ PRD 文档本身也需走 worktree + PR 流程，作为单独的 PR 提交

### AC3: 更新 git-workflow/SKILL.md
- ✅ 明确区分 `claw-family/docs/`（需求文档）和 workspace 文档
- ✅ 添加 PRD 先行流程说明
- ✅ 明确分支命名与 PRD 的关联
- ✅ 添加判断逻辑表（是否需要 PRD）

### AC4: 更新 AGENTS.md
- ✅ 在"改代码/配置：必须 worktree + PR"章节中明确 PRD 流程
- ✅ 添加功能扩展 vs 修 bug 的判断标准
- ✅ 明确飞书回复格式（是否涉及本仓库、是否先写 PRD、worktree 路径、PR 链接）

### AC5: 飞书回复格式
涉及本仓库时，飞书回复必须包含：
- ✅ 是否涉及本仓库
- ✅ 是否先写 PRD（功能扩展则说明，修 bug 则说明按 fix 流程）
- ✅ worktree 路径（创建后）
- ✅ PR 链接（完成后）

---

## Out of Scope

- 不修改其他技能（如 stock-assistant、smart-trading-assistant 等）
- 不修改 OpenClaw 核心代码
- 不改变现有的 worktree 创建和 PR 创建脚本

---

## 修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `docs/prd-git-workflow-optimization-2026-03-17.md` | 新增 | 本 PRD 文档 |
| `skills/git-workflow/SKILL.md` | 修改 | 更新流程说明 |
| `workspace-defaults/AGENTS.md` | 修改 | 更新 PRD 流程说明 |

---

## 分支命名规范

| PRD 类型 | 分支前缀 | 示例 |
|---------|---------|------|
| PRD 文档 PR | `docs/` | `docs/prd-git-workflow-optimization-2026-03-17` |
| 功能实现 PR | `feat/` | `feat/git-workflow-optimization` |
| Bug 修复 PR | `fix/` | `fix/startup-error` |

---

## Stakeholders

| 角色 | 人员 |
|------|------|
| 提出方 | slashhuang（爸爸） |
| 审批方 | slashhuang、jojo |
| 实现方 | 阿布 |

---

## Status 流转

`draft` → （用户确认后）`approved` → （实现完成后）`implemented` → （验证后）`verified`

---

*Last updated: 2026-03-17*
