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

### 2. Monorepo 结构认知（内部知识）

**claw-sources 是 monorepo wrapper**，通过 **subtree** 管理多个独立项目：

- `openclaw-traceflow/` - TraceFlow（独立开源项目）⭐
- `claw-family/` - OpenClaw runtime（主项目）
- `futu-openD/` - 富途 OpenD（独立项目）

**核心原则**：
1. **子项目独立性** - 每个子项目都是独立的开源项目
2. **Wrapper 不破坏独立性** - 使用 pnpm workspace，不修改子项目内部代码
3. **子项目 README 不应该提 monorepo** - 用户不需要知道 claw-sources 的存在

**详细说明**：`skills/git-workflow/SKILL.md`、`skills/code-sync/SKILL.md`

### 3. 可改动范围

| 目录 | 类型 | 是否可修改 | 说明 |
|------|------|-----------|------|
| `claw-family/` | OpenClaw runtime 主项目 | ✅ 可修改 | 核心项目 |
| `claw-family/skills/` | 技能代码 | ✅ 可修改 | AgentSkills |
| `claw-family/workspace-defaults/` | Bootstrap 模板 | ✅ 可修改 | 工作区模板 |
| `claw-family/openClawRuntime/.workspace/` | Workspace 文档 | ✅ 可修改（无需 PR） | 本地文档 |
| `futu-openD/` | 富途 OpenD 项目（subtree） | ✅ 可修改 | **独立项目**，修改需 PR |
| `openclaw-traceflow/` | TraceFlow UI 项目（subtree） | ✅ 可修改 | **独立开源项目**，修改需 PR |
| `docs/` | PRD 文档 | ✅ 可修改 | 共享文档 |
| `external-refs/` | 外部参考代码 | ❌ **禁止修改** | 只读引用 |

---

## 判断标准（决策流）

### 1. 是否涉及本仓库

| 操作类型 | 是否涉及 |
|---------|---------|
| 修改 `claw-sources/` 下的文件 | ✅ 是 |
| 仅查看/查询文件 | ❌ 否 |
| 执行外部命令（不涉及仓库） | ❌ 否 |

### 2. 是否需要 PR

| 修改目录 | 是否需要 PR |
|---------|-----------|
| `claw-family/skills/`, `claw-family/config/`, `claw-family/workspace-defaults/` | ✅ 必须 |
| `docs/`（PRD 文档） | ✅ 必须 |
| `futu-openD/`, `openclaw-traceflow/`（子项目） | ✅ 必须 |
| `claw-family/openClawRuntime/.workspace/` | ❌ 不需要 |
| 仅查看文件 | ❌ 不需要 |

### 3. 是否需要 PRD

| 需求类型 | 是否需要 PRD |
|---------|-----------|
| **修 bug（fix）** | ❌ 不需要 |
| **功能扩展（feat）** | ✅ 需要（先 PRD → 用户确认 → 实施） |
| **纯文档 typo** | ❌ 不需要 |

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

### 6. TraceFlow 开发约束（性能 + 稳定性优先 + 自治性）

**当修改 `openclaw-traceflow/` 目录时**，必须考虑：

**项目自治性（最重要）⭐**：
- ✅ TraceFlow 是独立开源项目
- ✅ 保持独立性 - 不依赖 claw-sources 根目录
- ✅ 不破坏结构 - 不修改 package.json 结构、目录结构
- ✅ 可独立运行 - 单独 `git clone` + `pnpm install` 也能工作

**禁止行为**：
- ❌ 添加对 claw-sources 根目录的硬编码依赖
- ❌ 修改目录结构导致无法独立提取
- ❌ 删除或修改 frontend/package.json

**性能 + 稳定性要求**：详见 `skills/git-workflow/SKILL.md`

---

## 给用户回复（掌控感）

**无论修改代码还是运维操作**，回复必须包含完整流程和每一步的结果，让技术专家用户有**掌控感**：

### 核心原则
- ✅ **展示步骤和结果**：用户需要知道阿布在做什么、每步成功/失败
- ❌ **不展示代码 diff**：用户不需要看具体改了哪些文件内容
- ✅ **关键信息必含**：分支名/PR 链接/命令执行结果/进程状态

### 回复格式模板

**修改代码/配置（PR 流程）**：
```
流程说明：
- ✅ 是否涉及本仓库：是
- ✅ 是否先写 PRD：是（功能扩展）/ 否（修 bug）
- ✅ worktree 路径：/root/githubRepo/claw-sources--{分支名}

详细步骤：
1. 创建 worktree 分支 → ✅ 成功
2. 修改代码并提交 → ✅ 成功（commit: {短 hash}）
3. 推送并创建 PR → ✅ PR #XX → {链接}

等待用户确认「可以合并」后：
4. 合并 PR → ✅ 成功
5. 同步代码 → ✅ 主仓库 {旧}→{新}，subtree 状态...
```

**运维操作（重启/查看状态）**：
```
流程说明：
- ✅ 是否涉及本仓库：否（运维操作）
- ✅ 是否先写 PRD：否

详细步骤：
1. 执行命令 → ✅ 成功（pid: xxx, uptime: xxx）
2. 验证服务状态 → ✅ 所有服务 online
```

### 常见运维操作
| 操作 | 命令 | 说明 |
|------|------|------|
| 重启 claw-gateway | `./skills/claw-family-restart/scripts/restart.sh` | 使用 claw-family-restart skill |
| 重启 traceflow | `pm2 restart openclaw-traceflow --update-env` | 在 openclaw-traceflow 目录执行 |
| 查看服务状态 | `pm2 status` | 显示所有 PM2 进程 |
| 查看日志 | `pm2 logs {服务名} --lines 50 --nostream` | 查看最近 50 行日志 |



---

## 其他约束

- **message 工具 target**：`user:open_id` 或 `chat:chat_id`，禁止填账号名
- **bootstrap 文件**：只改 `workspace-defaults/`，禁止改 `openClawRuntime/`
- **搜索**：优先用 `bailian-web-search` skill
- **时区**：北京时间（GMT+8）

---

**详细说明见各 skill 文档**

---

**详细说明见各 skill 文档**
