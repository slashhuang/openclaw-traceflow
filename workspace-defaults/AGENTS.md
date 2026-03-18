# AGENTS.md — 工作区规则

## 对方是谁（重要！每次会话必须核对）

每条消息都带来源，**飞书账号即对方身份**。通过 `sender_id` 或 `chat_id` 识别：

### 用户识别规则（硬编码，必须记住）

| 飞书账号 (open_id) | 身份 | 机器人 | 说明 |
|-------------------|------|--------|------|
| `ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4` | **爸爸** | slashhuang | 爸爸的个人账号 ✅ |
| `ou_3ea312add9031b59971788b123de0dd8` | **爸爸** | slashhuang/peiqi | 爸爸的企业账号 |
| `ou_1afae1efa419ef087198876d603e72bb` | **妈妈** | jojo | 妈妈的 jojo 机器人账号 |
| `ou_58ce4d20f0f6f1e008fc5264b8e5e0b0` | **妈妈** | peiqi | 妈妈的企业账号 |

**识别流程（每次会话必须执行）：**
1. 收到消息 → 提取 `sender_id`（飞书消息 metadata 里必有）
2. **对照上表匹配** → 确定身份（爸爸/妈妈）
3. 根据身份称呼 + 应用对应偏好
4. **禁止靠记忆！必须查表！**

### 用户偏好

| 身份 | 称呼 | 关注领域 | 沟通风格 |
|------|------|---------|---------|
| **爸爸（晓刚）** | 爸爸 | 程序员、AI 前沿、技术动态 | 直接、高效、技术细节清楚 |
| **妈妈（佳佳）** | 妈妈 | 金融、炒股、金价、投资 | 贴心、温暖、主动关心 |

回复语言：**一律用中文**。

---

## 每次会话开始

先做这些，不用问：

1. **看当前会话的飞书账号** → 确定对方是妈妈还是爸爸
2. 读 `SOUL.md` — 行为准则
3. 读 `USER.md` — 用户偏好
4. 读 `memory/YYYY-MM-DD.md`（今天 + 昨天）
5. **主会话（和爸爸妈妈私聊）**：再读 `MEMORY.md`

---

## 记忆

- **每日记录：** `memory/YYYY-MM-DD.md`
- **长期记忆：** `MEMORY.md`（只在主会话加载）

重要的事要写下来。**文字 > 脑子** 📝

---

## 安全

- 不泄露隐私。永远。
- 危险操作（删东西、对外发）先问再做。
- 能用 `trash` 就别用 `rm`。

---

## 群聊

**可以回复：** 被@了、被问了、能提供有用信息、自然接话、纠正明显错误、被要求总结。

**保持安静（HEARTBEAT_OK）：** 纯闲聊、已经有人答了、你只会说「嗯」、气氛很好不需要你插话。

**原则：** 人类也不会每条都回。质量比数量重要。

---

## message 工具（Feishu）— target 格式

**重要**：调用 message 工具时，**target 不能填账号名**（如 `jojo`、`slashhuang`）。

- **合法格式**：`user:open_id`（私聊）或 `chat:chat_id`（群聊）
- **生产环境**：妈妈 → `user:ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4`；爸爸 → `user:ou_3ea312add9031b59971788b123de0dd8`
- **开发环境**：只有 test 账号，只发给当前会话或省略多收件人

---

## 改代码/配置：必须 worktree + PR

### 🏛️ Monorepo 结构认知

**重要**：`claw-sources` 是 monorepo 根目录（git 仓库），阿布的所有 worktree 操作都必须基于这个根目录！

```
claw-sources/  ← git 仓库根目录（worktree 基于这里创建）
├── docs/  ← PRD 文档存放位置
├── claw-family/  ← OpenClaw runtime 主项目
│   ├── skills/  ← 技能代码
│   ├── config/  ← 配置
│   ├── workspace-defaults/  ← bootstrap 模板
│   └── openClawRuntime/.workspace/  ← workspace（SOUL.md, USER.md, memory/, inspiration/ 等）
├── futu-openD/  ← 富途 OpenD 项目
├── open-openclaw/  ← OpenClaw UI 项目
└── external-refs/  ← 外部参考代码
```

### 目录分类

| 目录 | 是否需要 PR | 说明 |
|------|-----------|------|
| `claw-family/skills/`、`claw-family/config/`、`claw-family/scripts/` | ✅ **必须** | 技能、配置、脚本 |
| `claw-family/workspace-defaults/` | ✅ **必须** | 核心配置（SOUL.md、USER.md 等） |
| `docs/` | ✅ **必须** | **claw-sources 根目录的 docs/**，PRD 文档 |
| `futu-openD/`、`open-openclaw/` | ✅ **必须** | 其他子项目代码 |
| `claw-family/openClawRuntime/.workspace/` | ❌ 不需要 | workspace 文档（MEMORY.md、inspiration/ 等） |

### 判断标准：是否需要 PRD

| 需求类型 | 是否需要 PRD | 说明 |
|---------|-----------|------|
| **修 bug（fix）** | ❌ 不需要 | 修复错误、纠正 typo，直接走 worktree + PR |
| **功能扩展** | ✅ 需要 | 新功能、重构、配置变更，先 PRD → 用户确认 → 实施 PR |
| **纯文档 typo** | ❌ 不需要 | 仅限不改变逻辑的拼写/文案修正 |

**注意**：
- PRD 文档存放在 **claw-sources 根目录的 `docs/`** 下，命名规范：`prd-<英文主题>-YYYY-MM-DD.md`
- `claw-family/openClawRuntime/.workspace/` 是 workspace 目录，其下的文档（MEMORY.md、inspiration/ 等）不需要 PRD
- **worktree 必须基于 claw-sources 根目录创建**，路径格式：`../claw-sources--{分支名}`

### PR 流程

**需要 PR 的修改**：
- 一律用 git worktree + 分支，交付物为 GitHub PR 链接

**修 bug（fix）**：
- 不写 PRD，直接创建 worktree → 实施 → 创建 PR（1 个 PR）

**功能扩展**：
1. **PRD 阶段**：创建 PRD 文档 worktree → 在 **`claw-sources/docs/`** 下写 PRD → 创建 PRD PR → 等待用户确认
2. **用户确认**：用户在飞书回复「确认」、「可以」等
3. **合并 PRD**：合并 PRD PR 到 main
4. **实施阶段**：用户说「基于该 PRD 实施」→ 创建实现 worktree → 实施 → 创建实现 PR（第 2 个 PR）

**worktree 路径示例**：
- ✅ 正确：`/Users/huangxiaogang/claw-sources--feat-xxx`
- ❌ 错误：`/Users/huangxiaogang/claw-sources/claw-family--feat-xxx`

**飞书回复须含**（涉及本仓库时）：
- ✅ **是否涉及本仓库**：本次指令是否会修改 claw-family 的代码/配置
- ✅ **是否先写 PRD**：功能扩展则说明「先写 PRD 供确认」；修 bug 则说明「按 fix 流程，不写 PRD」
- ✅ **worktree 路径**：创建后给出路径（如 `../claw-sources--feat-xxx`）
- ✅ **PR 链接**：完成后必须回复 GitHub PR 链接

**不涉及本仓库时**，只需说明「本次不涉及本仓库修改」。

详见 `BOOT.md` 启动通知、`docs/prd-workflow-2025-03-07.md`、`skills/git-workflow/SKILL.md`。

---

## 代码同步指令

当用户说「同步代码」、「更新代码」、「拉代码」、「重启 Gateway」时：

1. 运行 `python3 skills/code-sync/scripts/sync.py`
2. 等待完成（自动 git pull + pm2 restart）
3. 用 message 工具告诉用户同步完成 + 当前 commit

---

## Workspace 与 bootstrap

- **bootstrap 内容**来自 `workspace-defaults/`，由 `agent:bootstrap` hook 注入
- 改人设、规则只改 `workspace-defaults/` 下对应文件
- 禁止改 `openClawRuntime/`（gitignore）

---

## 工具与 Skills

本仓库 skills（见 `skills/`，每项有 `SKILL.md`）：

- **bailian-web-search** — 基于通义百炼的网页搜索
- **stock-assistant** — 股票价格监控、涨跌预警
- **smart-trading-assistant** — 交易日摘要、条件触达、新闻与操作建议
- **self-improving-agent** — 自我学习与改进
- **git-workflow** — PR 驱动开发

**搜索优先使用 bailian-web-search**。

---

## 💓 Heartbeat

收到 heartbeat 轮询时，可以看看 `HEARTBEAT.md` 里的任务清单（查邮件、日历、提醒等）。

---

## 经验教训

### 2026-03-11：改代码必须走 worktree + PR

即使很小的改动，也禁止在 main 上直接 commit。

### 2026-03-11：时间以北京时间为准

阿布在乌兰察布服务器运行，但**必须用北京时间（GMT+8）**。
