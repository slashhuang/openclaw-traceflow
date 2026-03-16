# Workspace-Defaults Bootstrap Hook PRD

基于 OpenClaw 的 **hook 能力**（`agent:bootstrap`），将 agent 的 system prompt 中注入的 user.md、agents.md 等 bootstrap 内容，统一由仓库中的 **workspace-defaults** 提供，并做**去重**，避免与 workspace 内同名文件重复注入导致 systemPrompt 过大。

**本文档已实施完成，代码实现在 `hooks/agent-workspace-defaults/handler.js`。**

---

## 1. 背景与问题

- OpenClaw 在每次 agent 运行前会构建 system prompt，其中会注入一批 **bootstrap 文件**（如 `USER.md`、`AGENTS.md`、`IDENTITY.md`、`SOUL.md`、`TOOLS.md`、`HEARTBEAT.md`、`BOOTSTRAP.md`/`BOOT.md` 等），默认从 **agent 的 workspace 目录**（本仓库为 `openClawRuntime/.workspace`）读取。
- 本仓库已通过 **workspace-defaults/** 维护这些文件的「默认版本」，并在启动时把 `BOOT.md` 覆盖到 `.workspace`（见 prd-bootstrap.md §6.1）。但其他文件（如 `USER.md`、`AGENTS.md`）若同时存在于 `.workspace` 与「默认来源」，可能出现：
  - 两处内容不一致时难以确定以谁为准；
  - 若两处都被注入，则 **重复注入、systemPrompt 膨胀**。
- 目标：**单一事实来源** = 仓库内 **workspace-defaults/**，对 bootstrap 内容做**去重**，保证同一逻辑文件只注入一次，且内容来自 workspace-defaults（当存在时）。

---

## 2. 目标与范围

| 项目 | 说明 |
|------|------|
| **目标** | 通过 OpenClaw 的 `agent:bootstrap` hook，用 workspace-defaults 下的文件替代/去重 bootstrap 注入，避免 systemPrompt 过大。 |
| **范围** | 在仓库中新增 **hooks** 目录，实现一个**带 agent 的 hook**（监听 `agent:bootstrap`），在注入前对 `context.bootstrapFiles` 做替换与去重。 |
| **不在此 PRD** | 修改 OpenClaw 源码、修改 openClawRuntime 下已 gitignore 的目录内容、变更现有 BOOT.md 覆盖脚本逻辑（可继续保留）。 |

---

## 3. 需求要点

1. **Hook 能力**
   使用 OpenClaw 官方支持的 **agent 相关 hook**：在 bootstrap 文件被注入前触发，可**读写** `event.context.bootstrapFiles`（见官方文档 [Hooks - OpenClaw](https://docs.openclaw.ai/automation/hooks) 中 `agent:bootstrap`：*Before workspace bootstrap files are injected (hooks may mutate `context.bootstrapFiles`)*）。

2. **单一来源**
   使用**本仓库**的 **workspace-defaults** 目录。**bootstrapFiles 须包含** workspace-defaults 下**除 BOOT.md、README.md 外**的所有文件，即：`USER.md`、`AGENTS.md`、`IDENTITY.md`、`SOUL.md`、`TOOLS.md`、`HEARTBEAT.md`（若目录中存在）。BOOT.md、README.md 不纳入本 hook；MEMORY.md 不处理，保持 OpenClaw 原有行为。

3. **去重**
   - 同名匹配**只根据文件名相同**（如 `USER.md`、`AGENTS.md`），不关心 path。对同一文件名的项在 `bootstrapFiles` 中只保留**一份**。
   - 当 workspace-defaults 中存在该文件时，该份内容**必须来自 workspace-defaults**。
   - 不在 workspace-defaults 中的 bootstrap 文件保持原有逻辑（不删除、不替换）。

4. **Hook 命名与位置**
   - Hook 名称需**带有 agent**（与 agent 生命周期相关，且监听的是 `agent:bootstrap`）。命名示例：`agent-workspace-defaults`（或 `workspace-defaults-agent`，以项目最终约定为准）。
   - Hook 实现放在仓库根下 **hooks/** 目录中，例如：
     `hooks/agent-workspace-defaults/`
     内含 OpenClaw 约定的 `HOOK.md`（含 metadata、`events: ["agent:bootstrap"]`）与 **handler.js**（实现语言为 JavaScript）。

5. **加载方式**
   - 使用 **extraDirs** 做**仓库级 hook** 加载：在生成配置（ensure 脚本或 partial）中将**本仓库根下 `hooks/` 的绝对路径**写入 `hooks.internal.load.extraDirs`，gateway 启动时即可加载。
   - 在配置中启用该 hook（如 `hooks.internal.entries["agent-workspace-defaults"].enabled: true`，key 与 hook 的 `name` 一致）。

6. **不破坏现有架构**
   - 遵守 **architecture.mdc**：不修改 `openClawRuntime/` 下被 gitignore 的路径；可改的为 `config/openclaw.partial.json`、`scripts/`、`workspace-defaults/`、`docs/` 等。
   - Hook 代码放在 **hooks/**，属「可提交」目录；若需在生成配置时注入 `extraDirs`，则仅在 **scripts/** 或 **config/partial** 中增加逻辑，不直接写 openClawRuntime。

7. **`.workspace/` 目录的性质**
   - `openClawRuntime/.workspace/` 下的文件（如 `AGENTS.md`、`SOUL.md` 等）是 OpenClaw 的**状态/缓存目录**。
   - **这些文件的内容不影响实际运行** — hook 会直接从 `workspace-defaults/` 读取并注入到 `ctx.bootstrapFiles`。
   - **不需要**手动同步 `.workspace/` 与 `workspace-defaults/` 的内容。

---

## 4. 技术方案概要（已实施）

**实施状态**：已完成，代码见 `hooks/agent-workspace-defaults/`。

1. **事件**
   - 监听 **`agent:bootstrap`**（`event.type === 'agent' && event.action === 'bootstrap'`）。
   - 在 OpenClaw 将 bootstrap 列表用于 system prompt 之前，对 `event.context.bootstrapFiles` 进行原地修改。

2. **逻辑**
   - 白名单 = **本仓库 workspace-defaults 下除 BOOT.md、README.md 外的文件**（即 USER.md、AGENTS.md、IDENTITY.md、SOUL.md、TOOLS.md、HEARTBEAT.md）。
   - workspace-defaults 进入 OpenClaw JSON 配置时，写的是**根据目录推导的绝对路径**（如 ensure 脚本由仓库根推导出 `workspace-defaults` 的绝对路径并写入配置）；hook 从配置中读取该路径，约定见 §6。
   - 对 `bootstrapFiles`：**去重时以 workspace-defaults 为准**；同名匹配**仅根据文件名**（不关心 path），同一文件名只保留一项，内容来自 workspace-defaults（若存在）；非白名单或 workspace-defaults 中不存在的条目不改动。

3. **配置与发现**
   - 在 **config/openclaw.partial.json** 或 **ensure-openclaw-runtime.sh** 的合并逻辑中，将仓库内 **hooks/** 的绝对路径加入 `hooks.internal.load.extraDirs`，使 OpenClaw 能发现 `hooks/agent-workspace-defaults`。
   - 在 partial 或生成逻辑中启用该 hook（`hooks.internal.entries["<hook-name>"].enabled: true`）。

4. **与 BOOT.md、README.md 的关系**
   - 本 hook **不处理** BOOT.md、README.md（不纳入白名单）。BOOT.md 仍由现有启动脚本覆盖到 `.workspace`（prd-bootstrap §6.1）；README.md 不注入。

---

## 5. 验收标准（已完成）

- [x] 仓库根下存在 **hooks/** 目录，且存在带 **agent** 的 hook 子目录（如 `hooks/agent-workspace-defaults/`），内含 **handler.js**。
- [x] HOOK.md 声明 `events: ["agent:bootstrap"]`，name 与配置中启用名一致。
- [x] 当 workspace-defaults 中存在 USER.md、AGENTS.md 等（除 BOOT.md、README.md 外）时，system prompt 中对应内容**仅出现一次**，且内容以 workspace-defaults 为准。
- [x] BOOT.md、README.md、MEMORY.md 不被本 hook 误改；其他非白名单 bootstrap 行为不变。
- [x] 生成配置（openClawRuntime/openclaw.generated.json）中包含对仓库 hooks 目录的加载及该 hook 的启用（不要求手改 generated 文件，由脚本或 partial 保证）。
- [x] 符合 architecture.mdc 与 do-not-edit-gitignored 规则：不向 openClawRuntime、.env 等 gitignore 路径写入；hooks 与脚本、partial 为可提交变更。

---

## 6. 自检与澄清（不清晰处补充）

以下为 PRD 自检时发现易歧义的点，在此固定约定，实施时以本节为准。

| 不清晰点 | 澄清 |
|----------|------|
| **workspace-defaults 路径** | 使用**本仓库**的 workspace-defaults。进入 OpenClaw JSON 配置时，写的是**根据目录推导的绝对路径**（如 ensure 脚本由仓库根推导）；hook 从配置中读取该路径。 |
| **白名单范围** | **包含** workspace-defaults 下除 **BOOT.md、README.md** 外的所有文件（即 USER.md、AGENTS.md、IDENTITY.md、SOUL.md、TOOLS.md、HEARTBEAT.md）。BOOT.md、README.md 不纳入；**MEMORY.md 不处理**，保持 OpenClaw 原有行为。 |
| **bootstrapFiles 项结构** | OpenClaw 约定为 `WorkspaceBootstrapFile[]`（含 path、content 等）。替换时用 workspace-defaults 文件的 **content** 覆盖该项，path 与 OpenClaw 一致；具体字段以 OpenClaw 文档为准。 |
| **hooks 加载方式** | **extraDirs 仓库级 hook**：在生成配置中将本仓库 **hooks/** 的绝对路径写入 `hooks.internal.load.extraDirs`，gateway 启动时加载，不依赖 agent workspace。 |
| **同名匹配与去重** | **只根据文件名相同**（如 USER.md），不关心 path。去重以 workspace-defaults 为准：同一文件名只保留一份，内容来自 workspace-defaults（若存在）；否则保留原有项。 |
| **handler 实现语言** | **必须使用 handler.js**（JavaScript），HOOK.md 与 OpenClaw 约定一致。 |
| **验收「内容一致」** | 在 OpenClaw 单文件/总 bootstrap 长度限制内一致；若被截断则以截断前部分一致为通过。 |
| **`.workspace/` 目录性质** | `openClawRuntime/.workspace/` 是 OpenClaw 的状态目录，其中的文件（如 `AGENTS.md`）是缓存，**不影响实际注入内容**；hook 直接从 `workspace-defaults/` 读取。 |

---

## 7. 参考

- OpenClaw Hooks：<https://docs.openclaw.ai/automation/hooks>
- `agent:bootstrap`：Before workspace bootstrap files are injected (hooks may mutate `context.bootstrapFiles`)。
- 本仓库 prd-bootstrap.md §6.1（workspace-defaults 与 BOOT.md 覆盖）。
- **代码实现**：`hooks/agent-workspace-defaults/handler.js`、`hooks/agent-workspace-defaults/HOOK.md`
- 本仓库 workspace-defaults 现有文件：AGENTS.md, USER.md, BOOT.md, IDENTITY.md, SOUL.md, TOOLS.md, HEARTBEAT.md, README.md（本 hook 仅处理其中除 BOOT.md、README.md 外的文件）。

---

## 8. 小结

- **做什么**：用 `agent:bootstrap` hook，从**本仓库 workspace-defaults** 提供除 BOOT.md、README.md 外的文件（USER.md、AGENTS.md、IDENTITY.md、SOUL.md、TOOLS.md、HEARTBEAT.md），去重以 workspace-defaults 为准。
- **在哪做**：仓库 **hooks/** 下实现 hook（如 `agent-workspace-defaults`），**handler.js**；通过 **extraDirs** 仓库级加载。
- **不处理**：BOOT.md、README.md 不纳入；MEMORY.md 不处理。不改动 OpenClaw 源码、gitignore 路径。
- **实施状态**：已完成，见 `hooks/agent-workspace-defaults/`。
