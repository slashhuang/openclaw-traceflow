# Bootstrap 启动方式 PRD（feishu-openclaw-wrapper）

面向 OpenClaw + 飞书插件的**启动封装**（wrapper）仓库（本仓库即 claw-family）：单命令完成配置生成与 gateway 启动，运行时落在 `openClawRuntime/`，**不修改 OpenClaw 源码**，不用 `.env`，环境由 **`--env`** 指定。

**本文档为实施目标**：按此 PRD 改造仓库；当前代码可能与文档不一致，以本文档为准。

---

## 1. 本地开发 vs 生产环境（必读）

| 维度 | 本地开发 | 生产环境 |
|------|----------|----------|
| **启动** | `./scripts/start-openclaw.sh --env dev` | 推荐在仓库根目录执行 **`./bootstrap.sh`**（内部用 PM2 跑 `./scripts/start-openclaw.sh`）；完整命令见 §3。 |
| **Bot 配置** | `bot.dev.json` | `bot.prod.json` |
| **飞书账号** | 仅 **test**（阿布-测试）等开发账号 | **jojo**、**slashhuang** 等真实用户 |
| **使用场景** | 本机调试、联调 | 服务器部署，给妈妈/爸爸用 |

**注意**：本地开发务必用 `--env dev`，避免本机连到生产 bot、与线上环境混淆；生产部署必须显式传 `--env prod`（或依赖默认 prod）。

---

## 2. 前置依赖

- Node.js >= 22
- pnpm 或 npm
- **openclaw 全局安装**：`npm i -g openclaw` 或 `pnpm add -g openclaw`
- Bash 环境（Linux / macOS，或 Windows + WSL/Git Bash）
- 可用的飞书凭证与模型凭证（建议通过环境变量或 bot 配置注入）
- 生产环境 PM2 部署时需安装：`npm i -g pm2`
- **jq**（用于配置合并）

---

## 3. 怎么启动：完整命令（第一次看仓库必读）

**约定**：以下所有命令都在**仓库根目录**（即 `claw-family/`）下执行。第一次使用请先完成 §2 前置依赖，再按场景选 §3.1（本地）或 §3.2（生产）。

---

### 3.1 本地开发（本机调试）

在你自己电脑上跑、只连测试飞书账号时，执行：

```bash
cd /path/to/claw-family
./scripts/start-openclaw.sh --env dev
```

这一条命令会：生成运行时配置（用 `bot.dev.json`）、启动 openclaw gateway。前台运行，Ctrl+C 即停。

---

### 3.2 生产环境（服务器部署，给妈妈/爸爸用）

生产环境**推荐**用根目录的 **`bootstrap.sh`** 做一站式启动（实施本 PRD 时需实现该脚本，见下）。

**第一步：在服务器上进入仓库根目录**

```bash
cd /path/to/claw-family
```

**第二步：执行生产入口脚本（推荐）**

```bash
./bootstrap.sh
```

`bootstrap.sh` **必须**完成至少以下事项（实施时可增加其他步骤，如依赖检查）：

- **代码同步**：例如 `git pull`，保证运行的是最新代码。
- **使用 PM2 启动**：执行 `pm2 start ecosystem.config.cjs`（或等价逻辑），使网关由 PM2 管理。
- **常驻**：进程以 daemon 方式运行，掉线自动重启（由 PM2 保证）。

**PM2 实际跑的是什么？**

`ecosystem.config.cjs` 里配置的入口脚本**仅一条**（你不需要自己敲，PM2 会按配置执行）：

```bash
./scripts/start-openclaw.sh
```

**不传任何参数**。`start-openclaw.sh` 规定：未传 `--env` 时**默认为 prod**，因此由 PM2 调起时自动使用生产配置（`bot.prod.json`）、生成 `openClawRuntime/openclaw.generated.json` 并启动 gateway。

**若不用 bootstrap、改用手动 PM2：**

在仓库根目录依次执行：

```bash
# 1. 仅生成生产环境运行时配置（可选，start-openclaw.sh 启动时也会自动生成）
./scripts/ensure-openclaw-runtime.sh --env prod

# 2. 用 PM2 启动（ecosystem 里配置的 script 就是 ./scripts/start-openclaw.sh）
pm2 start ecosystem.config.cjs
```

之后日常维护可用：

```bash
pm2 status
pm2 logs claw-gateway
pm2 restart claw-gateway
```

---

### 3.3 命令层次关系（生产环境，一句话版）

你敲的是：

```bash
./bootstrap.sh
```

底层实际发生的调用链是：

1. **你执行**：`./bootstrap.sh`（在仓库根目录）
2. **bootstrap 内部会**：代码同步 → 启动 PM2（`pm2 start ecosystem.config.cjs` 或等价逻辑）
3. **PM2 根据 `ecosystem.config.cjs` 执行**：`./scripts/start-openclaw.sh`（在仓库根目录、由 bash 解释）
4. **start-openclaw.sh 会**：因未收到 `--env`，按默认 prod 生成配置（`openClawRuntime/openclaw.generated.json`），再执行 `openclaw gateway run ...`，即真正跑起网关。

所以：**你只跑 `./bootstrap.sh`，就会完成从拉代码到网关常驻的全流程。** 实施时需保证 `ecosystem.config.cjs` 的 `script` 仅为 `./scripts/start-openclaw.sh`（不带 `--env`），以依赖默认 prod。

---

### 3.4 其他常用命令（都在仓库根目录执行）

| 你执行的完整命令 | 说明 |
|------------------|------|
| `./scripts/start-openclaw.sh --env dev` | 本地开发，前台启动（同 §3.1） |
| `./scripts/start-openclaw.sh --env prod` | 生产配置前台启动（不经过 PM2，一般仅用于排查） |
| `./scripts/ensure-openclaw-runtime.sh --env prod` | 只生成生产运行时配置，不启动网关 |
| `./scripts/ensure-openclaw-runtime.sh --env dev` | 只生成开发运行时配置，不启动网关 |
| `./scripts/check-openclaw.sh` | 检查本机是否已安装 openclaw 及版本 |

---

## 4. 配置体系

| 文件 | 用途 | 生成/编辑 |
|------|------|------------|
| `config/openclaw.partial.json` | 模型、gateway、agents、hooks；飞书由 bot 文件提供 | 手动 |
| `bot.dev.json` | 飞书开发账号（如 test） | 手动 |
| `bot.prod.json` | 飞书生产账号（jojo、slashhuang） | 手动 |
| `config/openclaw.env.json` 或根目录 `openclaw.env.json` | 路径、VERBOSE 等；**环境由 `--env` 决定，不在此配置** | 手动 |
| `openClawRuntime/openclaw.generated.json` | 最终运行时配置（脚本合并 partial + bot + skills） | 脚本生成，不提交 |

**运行时目录**：根目录为 `openClawRuntime/`。`OPENCLAW_WORKSPACE_DIR`、`OPENCLAW_STATE_DIR` 在 openclaw.env.json 中命名（如 `.workspace`、`.clawStates`），**相对路径按 openClawRuntime 解析**。`OPENCLAW_CONFIG_PATH` 指向 `openClawRuntime/openclaw.generated.json`。端口用 OpenClaw 默认。

---

## 5. 飞书 Bot 配置（bot.dev.json / bot.prod.json）

两文件均为**仅含飞书通道**的 JSON，结构一致：顶层 `feishu`，内挂 `accounts`（dev 为 test 等，prod 为 jojo、slashhuang）。合并时用所选 bot 的 `feishu` **整体替换** partial 的 `channels.feishu`，再注入 skills 路径与 workspace（见 §6.1）。

**凭证**：bot 内含 appId/appSecret，提交有泄露风险；建议占位符或 gitignore bot 文件、只提交 example 模板。

---

## 6. 技术方案实现

### 6.1 目录与合并

- **OPENCLAW_RUNTIME_ROOT** = 仓库根下 `openClawRuntime`；相对路径的 workspace/state 在其下解析。
- **workspace-defaults 文件注入**：
  - `BOOT.md`：由 `start-openclaw.sh` 复制到 `openClawRuntime/.workspace/BOOT.md`
  - `AGENTS.md`、`SOUL.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`IDENTITY.md`：由 `agent-workspace-defaults` hook 在 `agent:bootstrap` 时从 `workspace-defaults/` 读取并注入到 `ctx.bootstrapFiles`
  - **`.workspace/` 下的文件是 OpenClaw 的状态/缓存，不需要与 `workspace-defaults/` 保持一致**
- **合并流程**：(1) 加载 openclaw.env.json；(2) 由 `--env`（start 解析，默认 prod）确定 bot 文件 → dev 用 `bot.dev.json`，prod 用 `bot.prod.json`；(3) partial + bot 的 `feishu` 整体写入 `channels.feishu`，注入 `skills.load.extraDirs`、`agents.defaults.workspace`（绝对路径）；(4) 输出到 `openClawRuntime/openclaw.generated.json`（原子写入）。启动时设 `OPENCLAW_CONFIG_PATH` 并执行 `openclaw gateway run --allow-unconfigured`。
- **启动前停止旧进程**：为避免端口占用与重复进程，**每次启动前**必须先停止已在运行的 openclaw gateway（例如执行 `openclaw gateway stop`），再执行 `openclaw gateway run ...`，确保启动稳健。

### 6.2 脚本职责

| 脚本 | 职责 |
|------|------|
| `start-openclaw.sh` | 解析 `--env dev`/`prod`，**不传时默认为 prod**（供 PM2 调起时用）；加载 openclaw.env.json，建目录、覆盖 BOOT.md，调 ensure；**启动前先执行 `openclaw gateway stop`**，再启动 gateway（避免端口占用、确保稳健） |
| `ensure-openclaw-runtime.sh` | 接受 `--env dev`/`prod`（与 start 一致），合并 partial + bot，写出 `openClawRuntime/openclaw.generated.json`；可被 start 调用或单独执行 |
| `check-openclaw.sh` | 检查 openclaw 版本 |
| `bootstrap.sh` | 生产入口：代码同步 + `pm2 start ecosystem.config.cjs`（或等价），不直接传 `--env` 给 start，依赖 start 默认 prod |

环境由 **`--env`** 决定；路径/VERBOSE 等来自 openclaw.env.json。**未配置 OPENCLAW_CONFIG_PATH 时**，默认使用 `openClawRuntime/openclaw.generated.json`。

### 6.3 项目结构与 .gitignore

```
claw-family/
├── bootstrap.sh                    # 生产入口（§3.2；实施时实现）
├── ecosystem.config.cjs             # PM2 配置，script 为 ./scripts/start-openclaw.sh（不传参）
├── bot.dev.json / bot.prod.json    # 飞书账号（§1）
├── config/openclaw.partial.json    # 模型、gateway、agents
├── openclaw.env.json               # 路径、VERBOSE（或 config/ 下）
├── openClawRuntime/                 # 运行时根（gitignore）
│   ├── openclaw.generated.json
│   ├── .workspace
│   └── .clawStates
├── workspace-defaults/             # BOOT.md 等
├── scripts/
│   ├── start-openclaw.sh           # 解析 --env，默认 prod
│   ├── ensure-openclaw-runtime.sh
│   └── check-openclaw.sh
└── skills/
```

.gitignore：`openClawRuntime/`；若 bot 不提交则忽略 `bot.dev.json`、`bot.prod.json`，仅提交 example。

### 6.4 实施后需同步的文档

实施本 PRD 后更新 **architecture.mdc**、**CLAUDE.md**、**config/README.md**：运行时与不可改路径改为 `openClawRuntime/`，启动为 `start-openclaw.sh --env dev/prod`。

---

## 7. 其他

- **Skills**：ensure 脚本注入 `skills.load.extraDirs` 指向 `skills/`，维护 `skills/*/SKILL.md` 即可。
- **更新代码**：服务器上 `git pull` 后执行 `./scripts/ensure-openclaw-runtime.sh --env prod`，再 `pm2 restart claw-gateway`（或 start 时自动生成则仅重启）。
- **生产（PM2）**：必须用 `--env prod` 启动；进程名如 `claw-gateway`。实际生产用 **`./bootstrap.sh`** 做一站式启动（代码同步 + PM2 + daemon）；PM2 通过 `ecosystem.config.cjs` 执行的是 `./scripts/start-openclaw.sh`（完整命令与层次见 §3.2、§3.3）。

---

## 8. 常见问题

| 问题 | 排查 |
|------|------|
| 本地却连到生产 / 生产却用 dev 账号 | 确认启动命令：**本地** `--env dev`，**生产** `--env prod`；检查当前用的是哪个 bot 文件。 |
| 路径或配置不对 | 检查 openclaw.env.json；相对路径在 openClawRuntime 下解析。 |
| skills 未生效 | `skills/` 含 SKILL.md；重跑 ensure 并重启。 |
| 未找到 openclaw | `npm i -g openclaw` 或 `pnpm add -g openclaw`。 |
| PM2 启动失败 | 先跑 ensure（含 `--env prod`）；看 `pm2 logs <进程名>`。 |

---

## 9. Review 与设计说明

- **文档定位**：本 PRD 为**改造仓库的目标规格**，实施时以本文档为准修改脚本与配置，不迁就当前实现。
- **本地 vs 生产**：§1 表格明确 dev/prod、bot 文件、账号、场景；常见问题首条为「误用 env」的排查。
- **技术要点**：飞书由 bot 提供，合并时整体替换 `channels.feishu`；workspace 注入绝对路径；环境仅由 `--env` 决定，不用 .env；凭证见 §5 建议。
- **Wrapper**：不改 OpenClaw 源码，单命令完成配置生成与启动；实施后需同步 architecture.mdc、CLAUDE.md、config/README.md（§6.4）。
