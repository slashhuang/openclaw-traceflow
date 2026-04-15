# OpenClaw TraceFlow

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

**Observability for the [OpenClaw](https://docs.openclaw.ai) Agent** — sessions, skills, token usage & alerts, latency (P50/P95/P99), **agent & harness** (Project Context, OpenClaw Structure, …), model pricing, live logs, and **real-time IM push** (Feishu/DingTalk). Ships as a standalone NestJS + React app with an English/Chinese UI, deployable via PM2 or CLI.

**Languages:** English (this file) · [简体中文](README.zh-CN.md)

---

## Why TraceFlow (vs OpenClaw default management console)

| Capability                                                 | OpenClaw default management console | TraceFlow                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled with Gateway                                       | Yes                                 | No (separate app)                                                                                                                                                          |
| Skill call tracing (inferred from `read` paths)            | —                                   | Yes                                                                                                                                                                        |
| Per-user skill stats                                       | —                                   | Yes                                                                                                                                                                        |
| Token thresholds & rankings                                | Basic                               | Stronger                                                                                                                                                                   |
| Agent & harness (OpenClaw-aligned labels)                  | —                                   | Yes                                                                                                                                                                        |
| Latency P50/P95/P99                                        | —                                   | Yes                                                                                                                                                                        |
| Gateway connection behavior                                | Long-lived WS                       | Long-lived WS (reused for `status`, `usage`, `logs.tail`, `skills.status`, etc.)                                                                                           |
| Deployment                                                 | With Gateway                        | PM2, own port                                                                                                                                                              |
| UI language                                                | Mainly one language                 | English + Chinese                                                                                                                                                          |
| Automation friendliness                                    | Basic                               | JSON HTTP APIs + log WebSocket streaming                                                                                                                                   |
| **IM push (Agent sessions to Feishu/DingTalk)**            | —                                   | **Yes** — thread-aggregated, rate-limited, debounced (v1.1.0+; China-focused, extensible)                                                                                  |
| **Statistical scope spelled out in-product (ℹ)**           | Rare                                | **Yes** — major blocks explain what is included/excluded (e.g. live `*.jsonl` vs `*.jsonl.reset.*`, active vs archived tokens, `totalTokensFresh` caveats)                 |
| **Operator-safe Gateway overview without `operator.read`** | N/A                                 | **Yes** — path checks use connect snapshot; dashboard health/overview uses **`health`** RPC (scope-exempt) when backend WS has cleared scopes（详见下文 _Gateway scopes_） |

---

## UI snapshots

### Dashboard / Sessions

**Dashboard overview** — Gateway health, session distribution, token summary, latency, top skills/tools, recent sessions, and live logs.

> Dashboard screenshot _(update when ready with latest capture)_

**Session list** — Paged list per agent, with recorded vs estimated tokens, participant identities, status filters, and sort.

> Session list screenshot _(update when ready)_

**Session detail** — Single transcript view with head/tail loading for large files, messages/tools/events/skills tabs.

> Session detail screenshot _(update when ready)_

### Skills / Prompt / Tokens / Pricing

**Skills analysis** — Call frequency top 10, user distribution, skill × tool breakdown, zombie/duplicate detection.

> Skills screenshot _(update when ready)_

**System Prompt & Harness** — Workspace bootstrap files, Project Context, Skills snapshot, token breakdown, evaluation results.

> System Prompt screenshot _(update when ready)_

**Token monitor & Pricing** — Threshold distribution, dual-track (recorded vs estimate) token metrics, model pricing configuration.

> Token monitor / pricing screenshots _(update when ready)_

> Screenshot assets live in `docs/traceFlowSnapshots/` (currently: `dashboard-1.png`, `sessionList.png`, `sessionDetail.png`, `skills.png`, `systemPrompt.png`, `tokenMonitor.png`, `models.png`). These are referenced above and will be wired into the README once aligned with the current UI build.

---

## Requirements

| Requirement | Notes                                                  |
| ----------- | ------------------------------------------------------ |
| Node.js     | `>= 20.11.0` (20 LTS recommended)                      |
| pnpm        | `>= 9.0.0`                                             |
| PM2         | Optional but recommended for production (`deploy:pm2`) |

---

## Quick start

From the `openclaw-traceflow` directory (after cloning this repository):

```bash
pnpm run deploy:pm2
```

This runs **`pnpm install`**, builds backend + frontend, then starts or reloads the process **`openclaw-traceflow`** under PM2. Open **`http://localhost:3001`** (or your `HOST`/`PORT`).

Ensure the OpenClaw Gateway is reachable at **`OPENCLAW_GATEWAY_URL`** (default `http://localhost:18789`). Set token/password in **Settings** in the UI if your Gateway requires auth.

---

## Deployment

TraceFlow supports multiple deployment modes depending on your environment.

### PM2 (recommended for production)

```bash
pnpm run deploy:pm2
```

The deploy script (`scripts/deploy-pm2.sh`) handles install → build → PM2 start/reload in one step. The process is registered as **`openclaw-traceflow`** under PM2.

Common PM2 commands:

```bash
pm2 logs openclaw-traceflow --lines 100   # view logs
pm2 restart openclaw-traceflow             # restart
pm2 stop openclaw-traceflow                # stop
pm2 delete openclaw-traceflow              # remove from PM2
```

### Production (standalone)

```bash
pnpm run build:all
pnpm run restart:prod
```

`restart:prod` starts the process under PM2 if not yet running, or restarts it with auto-restart (up to 10 retries, 3s delay).

### Development

```bash
# Backend + frontend hot-reload (two processes)
pnpm run dev

# Backend only
pnpm run start:dev

# Backend + frontend separately
pnpm run dev:backend   # NestJS watch
pnpm run dev:frontend  # Vite dev server
```

### CLI

TraceFlow ships a CLI binary (`bin/cli.js`) registered as both `openclaw-traceflow` and `openclaw-monitor`:

```bash
openclaw-traceflow          # start the service
openclaw-monitor            # alias, same binary
pnpm run monitor            # via package.json
```

### First-time setup

On first launch, TraceFlow shows a **Setup Wizard** in the browser to configure OpenClaw data paths. You can skip this if Gateway auto-discovers paths or if you set `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR` beforehand.

### Reverse proxy

For production exposure, place TraceFlow behind Nginx / Caddy with auth. Only `/api/setup/*` is protected by `OPENCLAW_ACCESS_MODE`; other read APIs are not Bearer-protected by default.

---

## Tech stack

- **Backend**: NestJS 11 + TypeScript
- **Frontend**: React 18 + Vite 5 + React Router 6 + Ant Design 5 + Pro Layout + react-intl（中/英）
- **Charts**: Recharts 3
- **Realtime**: Socket.IO（日志流；仪表盘 HTTP 轮询）
- **Storage**: sql.js（SQLite），`data/metrics.db`
- **Gateway**: `GatewayConnectionService` + `TraceflowGatewayPersistentClient`（长驻 WS，配置变更时重建）
- **Logging**: Winston + `winston-daily-rotate-file`（log rotation + auto cleanup）
- **IM Push**: Feishu (`@larksuiteoapi/node-sdk`) + EventEmitter2 event-driven architecture

---

## Overview

TraceFlow is a **separate web service** that talks to your running **OpenClaw Gateway** (default `http://localhost:18789`). It does not replace the Gateway or OpenClaw’s default management console; it complements them with **operator-focused dashboards** you can deploy on another host or port (default **`http://0.0.0.0:3001`**).

**Data scope & honesty.** Many agent consoles show numbers without saying **where they come from** or **what they exclude**. TraceFlow treats that as a product risk: the UI documents **statistical scope** on major panels (ℹ tooltips)—for example, Dashboard **Skills / Tools Top 5** aggregate **live** transcripts (`*.jsonl`) only, not archived turns (`*.jsonl.reset.*`); **Token** views separate **active** vs **archived** usage; session/token copy calls out **`totalTokensFresh`** and index lag when relevant. The goal is **fewer silent mismatches** between what operators assume and what the pipeline actually measures.

**Performance stance.** Observability should not mean “re-read everything on every click.” TraceFlow already ships **incremental** session directory scans, **fingerprint-based caching** for per-session tool/skill aggregation when transcripts haven’t changed, **head/tail** parsing for very large JSONL transcripts, a **single long-lived** Gateway WebSocket for RPC, and a **batched** dashboard overview endpoint. Remaining hot paths (e.g. worst-case **O(n)** scans when many sessions exist) are tracked honestly in **`ROADMAP.md`**.

**Product design:** The **harness-visible** vision, **platform vs user** system prompt layering, and TraceFlow UX roadmap are in **[docs/agent-harness-and-system-prompt.md](./docs/agent-harness-and-system-prompt.md)**.

### Gateway scopes (why `health` matters)

When TraceFlow connects to the Gateway as **`mode: backend`** **without** a paired device identity, OpenClaw may **clear `scopes`** on that connection after `connect`. RPCs that require **`operator.read`** (for example some `skills.status` / `usage` paths) can then fail with **`missing scope: operator.read`**.

TraceFlow’s approach (keep this behavior when changing code):

- **Runtime path discovery** should rely on the **`connect` snapshot** (`stateDir` / `configPath`), not on `operator.read`-gated probes alone.
- **Dashboard health / overview** should prefer the Gateway **`health`** RPC (treated as scope-exempt in practice) and map its payload into UI shapes.

Code anchors: `src/openclaw/gateway-overview-health.ts`, `gateway-persistent-client.ts`, `gateway-ws-paths.ts`.

---

## Configuration (zero-config first)

TraceFlow is designed to work out of the box. In most local setups, you can run `pnpm run deploy:pm2` and open `http://localhost:3001` without setting anything.

### Common case (usually the only one you need)

| Variable               | When to set it                                          | Default                  |
| ---------------------- | ------------------------------------------------------- | ------------------------ |
| `OPENCLAW_GATEWAY_URL` | Your Gateway is not reachable at localhost/default port | `http://localhost:18789` |

Set Gateway auth (token/password) in the **Settings** page when required.

### Optional overrides (advanced)

| Variable                                               | Purpose                                                  | Default   |
| ------------------------------------------------------ | -------------------------------------------------------- | --------- |
| `HOST`                                                 | Bind address                                             | `0.0.0.0` |
| `PORT`                                                 | HTTP port                                                | `3001`    |
| `DATA_DIR`                                             | Local data (metrics DB, etc.)                            | `./data`  |
| `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD` | Gateway auth for WS/RPC                                  | unset     |
| `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR`        | Path overrides                                           | auto      |
| `OPENCLAW_LOG_PATH`                                    | Fallback log file if Gateway logs are unavailable        | unset     |
| `OPENCLAW_ACCESS_MODE`                                 | Protect `/api/setup/*` (`local-only` · `token` · `none`) | `none`    |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN`                        | Bearer token used with `OPENCLAW_ACCESS_MODE=token`      | unset     |

More detail: **`config/README.md`** and optional `config/openclaw.runtime.json`.

**Pricing:** Token cost estimates use built-in defaults; override with `config/model-pricing.json` (see `config/model-pricing.example.json`).

---

## IM Push (v1.1.0+)

> **Regional note:** This feature currently supports **Feishu** (飞书, the Chinese version of Lark) and **DingTalk** (钉钉), which are the dominant IM platforms in China's enterprise market. The architecture is designed to be channel-agnostic—contributions adding Slack, Microsoft Teams, Discord, or other global IM platforms are welcome. See the [Extending channels](#extending-channels) section below.

TraceFlow can push real-time Agent session records to IM platforms (currently **Feishu**, with DingTalk scaffolded), organizing messages by conversation thread for easy search and review.

### Architecture

```
OpenClaw Gateway (agents/*/sessions/*.jsonl)
         │
         ▼  (fs.watch on sessions/*.jsonl)
SessionManager (direct file system listener)
         │
         ▼  (emit audit.session.* events)
ImPushService (push coordination + in-memory queue)
         │
         ▼
FeishuChannel (Feishu API + rate limiting + debounce)
         │
         ▼
Feishu audit bot (thread-aggregated messages)
```

**Key design decisions:**

- **File system only** — no dependency on OpenClaw WebSocket, HTTP API, or event system. Watches `agents/*/sessions/*.jsonl` directly.
- **In-memory queue** — messages are serialized per session to avoid race conditions and ensure chronological order. No SQLite persistence (simpler, no migration needed).
- **No history replay on restart** — after a restart, only new messages are pushed. Historical messages are not backfilled to avoid message storms.
- **Debounce** — JSONL streaming writes are debounced to prevent Feishu API flooding.
- **Rate limiting** — token bucket algorithm (10 msg/s, burst capacity 20).

### Quick setup

1. **Configure Feishu credentials** in `config/openclaw.runtime.json`:

```json
{
  "im": {
    "enabled": true,
    "channels": {
      "feishu": {
        "enabled": true,
        "appId": "cli_xxx",
        "appSecret": "xxx",
        "targetUserId": "ou_xxx",
        "pushStrategy": {
          "sessionStart": false,
          "sessionMessages": true,
          "sessionEnd": true,
          "errorLogs": true,
          "warnLogs": false
        }
      }
    }
  }
}
```

2. **Get Feishu credentials**: Visit [Feishu Open Platform](https://open.feishu.cn/), create an enterprise app, obtain App ID/Secret, and configure bot messaging permissions.

3. **Restart** TraceFlow and verify push in the Feishu audit bot.

### Push strategy

| Config            | Description                           | Default |
| ----------------- | ------------------------------------- | ------- |
| `sessionStart`    | Push session start notification       | `false` |
| `sessionMessages` | Push session messages (user/AI/skill) | `true`  |
| `sessionEnd`      | Push session end summary              | `true`  |
| `errorLogs`       | Push ERROR log alerts                 | `true`  |
| `warnLogs`        | Push WARN logs                        | `false` |

### API endpoints

| Endpoint                         | Method | Description              |
| -------------------------------- | ------ | ------------------------ |
| `/api/im/channels`               | GET    | List enabled channels    |
| `/api/im/channels/health`        | GET    | Channel health status    |
| `/api/im/channels/:type/enabled` | GET    | Check if channel enabled |
| `/api/im/channels/:type/test`    | POST   | Send test message        |
| `/api/im/broadcast/test`         | POST   | Broadcast test message   |

### Extending channels

New IM channels implement the `ImChannel` interface (`initialize`, `send`, `healthCheck`, `destroy`) and register in `ImModule`. The architecture is designed for global IM platforms—contributions for **Slack**, **Microsoft Teams**, **Discord**, **WeCom** (企业微信), or others are welcome. See [docs/IM_CHANNELS_GUIDE.md](docs/IM_CHANNELS_GUIDE.md) for the full guide.

### Detailed docs

- [IM_PUSH.md](docs/IM_PUSH.md) — feature overview and troubleshooting
- [IM_CHANNELS_GUIDE.md](docs/IM_CHANNELS_GUIDE.md) — channel plugin guide
- [IM_PUSH_STRATEGY.md](docs/IM_PUSH_STRATEGY.md) — push strategy implementation details
- [IM_OPENCLAW_INTEGRATION.md](docs/IM_OPENCLAW_INTEGRATION.md) — OpenClaw integration architecture

---

## Operations & maintenance

### Log management

TraceFlow uses **Winston** with daily rotating log files:

- **Log file**: `data/traceflow.log` (current day)
- **Rotation**: daily, with automatic cleanup of old files
- **Timezone**: Asia/Shanghai (Beijing Time) for all log timestamps
- **View logs**: `pm2 logs openclaw-traceflow --lines 100` or `tail -f data/traceflow.log`

### Health monitoring

- **HTTP health**: `GET /api/health` — returns Gateway connection status and runtime health
- **Dashboard polling**: frontend polls `GET /api/dashboard/overview` every ~10s when visible
- **Background metrics**: Token usage snapshots every ~30s (configurable via code constants)
- **IM channel health**: `GET /api/im/channels/health` — returns channel health status

### Configuration hot-reload

- **IM push config**: Changes to `config/openclaw.runtime.json` are picked up on next config read
- **Path configuration**: Changes saved in the Settings UI take effect immediately (in-memory config sync)
- **Gateway connection**: Rebuilt automatically when Gateway URL/token/password changes

### Session monitoring

- **Session watch**: IM push monitors `agents/*/sessions/*.jsonl` files via `fs.watch`
- **Session end detection**: 5 minutes of inactivity triggers session completion
- **Restart behavior**: On restart, historical sessions are not backfilled; only new messages are pushed from the current position

### Data scope

| Data type                  | Source                              | Notes                                     |
| -------------------------- | ----------------------------------- | ----------------------------------------- |
| Session transcripts        | `agents/*/sessions/*.jsonl`         | Live + archived (`*.jsonl.reset.*`)       |
| Token metrics              | Local `data/metrics.db` (~30s snap) | Active + archived dual-track              |
| Gateway health             | Gateway `health` RPC (WS)           | Scope-exempt, no `operator.read` required |
| IM push events             | File system watch                   | Only OpenClaw data, not TraceFlow logs    |
| TraceFlow application logs | Winston → `data/traceflow.log`      | Rotating, timezone Asia/Shanghai          |

### Common operational tasks

```bash
# Check process status
pm2 list

# View recent logs
pm2 logs openclaw-traceflow --lines 50

# View live log stream
tail -f data/traceflow.log

# Restart after config change
pm2 restart openclaw-traceflow

# Full redeploy (install + build + restart)
pnpm run deploy:pm2

# Clean build artifacts
pnpm run clean
```

---

## UI routes

| Path                                                     | Purpose                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/` · `/dashboard`                                       | Overview: Gateway health, tokens, latency, tools, etc.                          |
| `/sessions` · `/sessions/:id` · `/sessions/:id/archives` | Session list, detail, and archived epochs                                       |
| `/system-prompt` (`/agent-harness` redirects here)       | Agent & harness: Project Context, OpenClaw Structure, skills snapshot, etc.     |
| `/workspace`                                             | Workspace bootstrap files (`AGENTS.md` / `SOUL.md` / `IDENTITY.md` / `USER.md`) |
| `/markdown-preview`                                      | Rendered markdown preview for workspace bootstrap docs                          |
| `/pricing`                                               | Model pricing                                                                   |
| `/logs`                                                  | Live logs (Socket.IO)                                                           |
| `/settings`                                              | Gateway URL, paths, access                                                      |

### Sessions and the “Participant” column

- **One row** is one **conversation thread** in OpenClaw (one `sessionId` / one transcript). In **group** chats, many people usually share the **same** session row.
- **`sessionKey`** encodes **routing/shape** (provider, group/channel/DM, etc.); it is not the same thing as “who” appears in the participant column.
- **`agent:<agentId>:main`** is OpenClaw’s **default “main” DM bucket** when direct chats use the `main` session scope; TraceFlow labels it **Main session** (中文 UI: **主会话**), not “heartbeat.” Scheduled heartbeat traffic may still land in the same transcript—**the key shape alone does not mean “heartbeat session.”**
- **Participant (list):** TraceFlow scans each transcript JSONL for distinct sender identities (`Sender` / `Conversation info` metadata blocks, `senderLabel`, `message.sender`, etc.). If there are **multiple** distinct human senders, the column shows **`firstIdentity (+N)`** where **`N`** is the count of _additional_ identities (not the total headcount).
- **Participant (detail):** When multiple identities exist, the detail page shows the first plus **+N**; click **+N** for a popover with the full deduped list (same source as the list scan). Group rosters may be larger than what appears in the transcript—only **observed senders** are listed.
- **Session detail · Messages:** single-column list. Each message is **one line** by default; **click the row** to expand the full body; use the **arrow** button to collapse (so selecting text in the expanded body does not collapse the row).
- **`unknown`** usually means the index had no id or the first transcript lines could not infer one—see session detail help text.

---

## Performance & capacity

TraceFlow targets **single-host, small-to-medium** session counts. In practice we optimize the **steady state**:

- **Session list / storage:** `FileSystemSessionStorage` **incrementally** rescans changed transcript files and keeps a short-lived cache so `listSessions` stays mostly in-memory work.
- **Dashboard tool/skill Top 5:** `MetricsService.refreshToolStatsSnapshot()` keeps a per-session **fingerprint** (`lastActiveAt` + transcript size + status). If unchanged, it **reuses** cached tool/skill counts instead of re-parsing JSONL—idle or completed sessions that don’t churn stop paying full parse cost every refresh.
- **Session detail:** large transcripts use a **head/tail window** instead of loading the entire file (see server constants / session detail UI).
- **Gateway:** one **reused** WebSocket client per configured URL+auth—avoid repeated handshakes for `health`, `status`, `logs.tail`, etc.
- **Overview API:** `GET /api/dashboard/overview` bundles health, sessions, logs, and metrics in one round trip for the React dashboard.

With **very large** session counts, worst-case work can still grow (notably full scans when many sessions are new or churning)—see **`ROADMAP.md`** for known bottlenecks and planned work.

---

## Security

Only **`/api/setup/*`** (first-time config, test connection, saved settings) is gated by **`OPENCLAW_ACCESS_MODE`**. Other read-style APIs are not uniformly Bearer-protected; **do not expose TraceFlow to the public internet** without network controls or a reverse proxy with auth.

| Mode         | Behavior                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `local-only` | Only local IPs may change settings                                      |
| `token`      | Changes require `Authorization: Bearer <OPENCLAW_RUNTIME_ACCESS_TOKEN>` |
| `none`       | No check (trusted networks only)                                        |

---

## HTTP API (selected)

Useful for scripts and monitoring. Full list lives in `src/**/*controller.ts`.

| Path                                         | Method          | Description                                             |
| -------------------------------------------- | --------------- | ------------------------------------------------------- |
| `/api/health`                                | GET             | Health + Gateway connection summary                     |
| `/api/status`                                | GET             | Gateway `status` / `usage` JSON                         |
| **`/api/dashboard/overview`**                | **GET**         | Aggregated dashboard payload; optional `?timeRangeMs=`  |
| `/api/sessions`                              | GET             | Session list                                            |
| `/api/sessions/:id`                          | GET             | Session detail                                          |
| `/api/sessions/:id/kill`                     | POST            | Kill session                                            |
| `/api/sessions/:id/evaluations*`             | GET/POST/DELETE | Session evaluations (`latest`, history, detail, create) |
| `/api/metrics/*`                             | GET             | Latency, tools/skills, token summaries                  |
| `/api/prompts/:promptId/evaluations*`        | GET/POST/DELETE | Prompt evaluations (`latest`, history, detail, create)  |
| `/api/evaluation-prompt`                     | GET/PUT/DELETE  | Session evaluation template                             |
| `/api/workspace-bootstrap-evaluation-prompt` | GET/PUT/DELETE  | Workspace bootstrap evaluation template                 |
| `/api/workspace/*`                           | GET/PUT         | Workspace file read/write APIs                          |
| `/api/logs`                                  | GET             | Recent log lines                                        |
| `/api/setup/*`                               | GET/POST        | Setup (protected by access mode)                        |
| `/api/im/channels`                           | GET             | List enabled IM channels                                |
| `/api/im/channels/health`                    | GET             | IM channel health status                                |
| `/api/im/channels/:type/test`                | POST            | Send IM test message                                    |
| `/api/audit/snapshot`                        | GET             | Contribution audit snapshot                             |

---

## WebSocket (logs)

Socket.IO namespace **`logs`**: `logs:subscribe` · `logs:unsubscribe` · server push `logs:new` (`timestamp`, `level`, `content`).

---

## Troubleshooting

| Issue                                                             | What to check                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway unreachable                                               | `OPENCLAW_GATEWAY_URL`, firewall; set token/password in Settings                                                                                                                                                                                                                 |
| **Test connection** fails with **`missing scope: operator.read`** | TraceFlow uses a device-less backend WebSocket; Gateway clears scopes, so older builds that called `skills.status` after connect failed. Current code uses connect **snapshot** for path checks and **`health` RPC** for overview (scope-exempt). See repo root **`AGENTS.md`**. |
| Empty logs                                                        | Gateway `logs.tail` may be unavailable without operator scope (falls back to empty); or set `OPENCLAW_LOG_PATH`                                                                                                                                                                  |
| Token metrics show zero; archived bucket empty on Dashboard       | Confirm sessions produce usage; check `/api/metrics/token-summary` and `/api/sessions/token-usage`. Archived often stays zero (no `/new`, reset files without usage, etc.); see **`docs/token-metrics-dual-track-example.md`** for field traceability and sample JSON            |
| IM push not working                                               | Check `im.enabled` and channel `enabled` flags in config; verify Feishu credentials; check `data/traceflow.log` for `Feishu API error`; send a test message via `POST /api/im/channels/feishu/test`                                                                              |
| IM push message storms / flooding                                 | Debounce is enabled by default (v1.1.1+). If you still see flooding, check `rateLimit` in config (default 10 msg/s). See [docs/IM_PUSH.md](docs/IM_PUSH.md)                                                                                                                      |
| Sessions not detected after restart                               | Session watch starts from the current file position on restart; historical sessions are not backfilled. New messages after restart will be detected. If a session is not in `sessions.json`, it may still be watched if its jsonl file exists                                    |

---

## Roadmap

See **`ROADMAP.md`** in this repository.

### Recent highlights (shipped)

- **v1.1.x** — IM push to Feishu with thread aggregation, debounce, in-memory queue, circuit breaker, rate limiting
- **v1.1.x** — Winston logging with daily rotation and auto cleanup (Beijing Time)
- **v1.1.x** — Path configuration hot-reload; settings saved in UI take effect immediately
- **v1.1.x** — Session evaluation templates (eval-prompt-v1) + workspace bootstrap evaluation
- **v1.1.x** — Contribution audit integration with agent-audit companion skill
- **v1.1.x** — Setup wizard simplified to single-page configuration
- **v1.1.x** — Performance: fingerprint-based caching for tool/skill aggregation, head/tail window for large transcripts

---

## Contributing

Issues and PRs are welcome (bugs, features, docs, UI, tests).

---

## License

MIT © [slashhuang](https://github.com/slashhuang)

---

### Author links

- [X](https://x.com/brucelee_1991)
- [小红书](https://www.xiaohongshu.com/user/profile/5845481182ec395656dfb393)
- [知乎](https://www.zhihu.com/people/huang-da-xian-14-14)
