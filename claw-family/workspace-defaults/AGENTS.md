# AGENTS.md — 行为约束

## 用户识别（每次会话必须执行）

**查表匹配 `sender_id`，禁止靠记忆**：

| open_id | 身份 | 称呼 |
|---------|------|------|
| `ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4` | 爸爸 | 爸爸 |
| `ou_3ea312add9031b59971788b123de0dd8` | 爸爸 | 爸爸 |
| `ou_1afae1efa419ef087198876d603e72bb` | 妈妈 | 妈妈 |
| `ou_58ce4d20f0f6f1e008fc5264b8e5e0b0` | 妈妈 | 妈妈 |

**回复语言**：中文

---

## 仓库认知

### 1. 工作仓库
- **主仓库**：`claw-sources`（monorepo 根目录）
- **路径**：`/root/githubRepo/claw-sources/`
- **所有代码工作都在此仓库下进行**

### 2. 可改动范围

| 目录 | 类型 | 是否可修改 |
|------|------|-----------|
| `claw-family/` | OpenClaw runtime 主项目 | ✅ 可修改 |
| `claw-family/skills/` | 技能代码 | ✅ 可修改 |
| `claw-family/workspace-defaults/` | Bootstrap 模板 | ✅ 可修改 |
| `claw-family/openClawRuntime/.workspace/` | Workspace 文档 | ✅ 可修改（无需 PR） |
| `futu-openD/` | 富途 OpenD 项目（subtree） | ✅ 可修改 |
| `openclaw-traceflow/` | TraceFlow UI 项目（subtree） | ✅ 可修改 |
| `docs/` | PRD 文档 | ✅ 可修改 |
| `external-refs/` | 外部参考代码 | ❌ **禁止修改**（只读引用） |

---

## 核心原则

### 1. Single Source of Truth
- **AGENTS.md**：约束行为（做什么）
- **skill 文档**：实现细节（怎么做）
- 不在 AGENTS.md 重复 skill 流程

### 2. 理解流程适用场景，禁止机械执行
- **BOOT.md**：仅在 Gateway **实际重启后**由系统自动执行
- **禁止主动检查** `.last_boot_commit` 并触发重启通知
- **配置/文档修改**：不需要重启，不触发 BOOT.md，不发重启通知

### 3. 改代码必须 worktree + PR
- 详见 `skills/git-workflow/SKILL.md`

### 4. 代码同步必须用 skill
- 命令：`python3 skills/code-sync/scripts/sync.py`
- 详见 `skills/code-sync/SKILL.md`

### 5. 禁止行为
- ❌ `gh pr merge`（必须用 `merge_pr.sh`）
- ❌ `./bootstrap.sh`（必须用 code-sync）
- ❌ 在 main 上直接 commit

---

## 其他约束

- **message 工具 target**：`user:open_id` 或 `chat:chat_id`，禁止填账号名
- **bootstrap 文件**：只改 `workspace-defaults/`，禁止改 `openClawRuntime/`
- **搜索**：优先用 `bailian-web-search` skill
- **时区**：北京时间（GMT+8）

---

**详细说明见各 skill 文档**
