# OpenClaw TraceFlow

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

**Observability for the [OpenClaw](https://docs.openclaw.ai) Agent** — sessions, skills, token usage & alerts, latency (P50/P95/P99), system prompt insight, model pricing, and live logs. Ships as a standalone NestJS + React app with an English/Chinese UI.

**Languages:** English (this file) · [简体中文](README.zh-CN.md)

---

## Why TraceFlow (vs OpenClaw default management console)

| Capability | OpenClaw default management console | TraceFlow |
|------------|-------------------------------------|-----------|
| Bundled with Gateway | Yes | No (separate app) |
| Skill call tracing (inferred from `read` paths) | — | Yes |
| Per-user skill stats | — | Yes |
| Token thresholds & rankings | Basic | Stronger |
| System prompt analysis | — | Yes |
| Latency P50/P95/P99 | — | Yes |
| Gateway connection behavior | Long-lived WS | Long-lived WS (reused for `status`, `usage`, `logs.tail`, `skills.status`, etc.) |
| Deployment | With Gateway | PM2, own port |
| UI language | Mainly one language | English + Chinese |
| Automation friendliness | Basic | JSON HTTP APIs + log WebSocket streaming |
| **Statistical scope spelled out in-product (ℹ)** | Rare | **Yes** — major blocks explain what is included/excluded (e.g. live `*.jsonl` vs `*.jsonl.reset.*`, active vs archived tokens, `totalTokensFresh` caveats) |
| **Operator-safe Gateway overview without `operator.read`** | N/A | **Yes** — path checks use connect snapshot; dashboard health/overview uses **`health`** RPC (scope-exempt) when backend WS has cleared scopes (see monorepo root **`AGENTS.md`**) |

---

## UI snapshots

### Dashboard / Sessions

![Dashboard](./docs/traceFlowSnapshots/dashboard-1.png)
![Session List](./docs/traceFlowSnapshots/sessionList.png)
![Session Detail](./docs/traceFlowSnapshots/sessionDetail.png)

### Skills / Prompt / Tokens / Pricing

![Skills](./docs/traceFlowSnapshots/skills.png)
![System Prompt](./docs/traceFlowSnapshots/systemPrompt.png)
![Token Monitor](./docs/traceFlowSnapshots/tokenMonitor.png)
![Pricing](./docs/traceFlowSnapshots/models.png)

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| Node.js | `>= 20.11.0` (20 LTS recommended) |
| pnpm | `>= 9.0.0` |
| PM2 | Optional but recommended for production (`deploy:pm2`) |

---

## Quick start

From the `openclaw-traceflow` directory (after cloning this repository):

```bash
pnpm run deploy:pm2
```

This runs **`pnpm install`**, builds backend + frontend, then starts or reloads the process **`openclaw-traceflow`** under PM2. Open **`http://localhost:3001`** (or your `HOST`/`PORT`).

Ensure the OpenClaw Gateway is reachable at **`OPENCLAW_GATEWAY_URL`** (default `http://localhost:18789`). Set token/password in **Settings** in the UI if your Gateway requires auth.

---

## Tech stack

- Backend: NestJS + TypeScript
- Frontend: React + Vite + Ant Design
- Realtime/log streaming: Socket.IO

---

## Overview

TraceFlow is a **separate web service** that talks to your running **OpenClaw Gateway** (default `http://localhost:18789`). It does not replace the Gateway or OpenClaw’s default management console; it complements them with **operator-focused dashboards** you can deploy on another host or port (default **`http://0.0.0.0:3001`**).

**Data scope & honesty.** Many agent consoles show numbers without saying **where they come from** or **what they exclude**. TraceFlow treats that as a product risk: the UI documents **statistical scope** on major panels (ℹ tooltips)—for example, Dashboard **Skills / Tools Top 5** aggregate **live** transcripts (`*.jsonl`) only, not archived turns (`*.jsonl.reset.*`); **Token** views separate **active** vs **archived** usage; session/token copy calls out **`totalTokensFresh`** and index lag when relevant. The goal is **fewer silent mismatches** between what operators assume and what the pipeline actually measures.

**Performance stance.** Observability should not mean “re-read everything on every click.” TraceFlow already ships **incremental** session directory scans, **fingerprint-based caching** for per-session tool/skill aggregation when transcripts haven’t changed, **head/tail** parsing for very large JSONL transcripts, a **single long-lived** Gateway WebSocket for RPC, and a **batched** dashboard overview endpoint. Remaining hot paths (e.g. worst-case **O(n)** scans when many sessions exist) are tracked honestly in **`ROADMAP.md`**.

---

## Configuration (zero-config first)

TraceFlow is designed to work out of the box. In most local setups, you can run `pnpm run deploy:pm2` and open `http://localhost:3001` without setting anything.

### Common case (usually the only one you need)

| Variable | When to set it | Default |
|----------|----------------|---------|
| `OPENCLAW_GATEWAY_URL` | Your Gateway is not reachable at localhost/default port | `http://localhost:18789` |

Set Gateway auth (token/password) in the **Settings** page when required.

### Optional overrides (advanced)

| Variable | Purpose | Default |
|----------|---------|---------|
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | HTTP port | `3001` |
| `DATA_DIR` | Local data (metrics DB, etc.) | `./data` |
| `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD` | Gateway auth for WS/RPC | unset |
| `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR` | Path overrides | auto |
| `OPENCLAW_LOG_PATH` | Fallback log file if Gateway logs are unavailable | unset |
| `OPENCLAW_ACCESS_MODE` | Protect `/api/setup/*` (`local-only` · `token` · `none`) | `none` |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | Bearer token used with `OPENCLAW_ACCESS_MODE=token` | unset |

More detail: **`config/README.md`** and optional `config/openclaw.runtime.json`.

**Pricing:** Token cost estimates use built-in defaults; override with `config/model-pricing.json` (see `config/model-pricing.example.json`).

---

## UI routes

| Path | Purpose |
|------|---------|
| `/` · `/dashboard` | Overview: Gateway health, tokens, latency, tools, etc. |
| `/sessions` · `/sessions/:id` | Session list and detail |
| `/skills` | Skill usage statistics |
| `/system-prompt` | System prompt analysis |
| `/tokens` | Token monitoring & alerts |
| `/pricing` | Model pricing |
| `/logs` | Live logs (Socket.IO) |
| `/settings` | Gateway URL, paths, access |

### Sessions and the “Participant” column

- **One row** is one **conversation thread** in OpenClaw (one `sessionId` / one transcript). In **group** chats, many people usually share the **same** session row.
- **`sessionKey`** encodes **routing/shape** (provider, group/channel/DM, etc.); it is not the same thing as “who” appears in the participant column.
- **`agent:<agentId>:main`** is OpenClaw’s **default “main” DM bucket** when direct chats use the `main` session scope; TraceFlow labels it **Main session** (中文 UI: **主会话**), not “heartbeat.” Scheduled heartbeat traffic may still land in the same transcript—**the key shape alone does not mean “heartbeat session.”**
- **Participant (list):** TraceFlow scans each transcript JSONL for distinct sender identities (`Sender` / `Conversation info` metadata blocks, `senderLabel`, `message.sender`, etc.). If there are **multiple** distinct human senders, the column shows **`firstIdentity (+N)`** where **`N`** is the count of *additional* identities (not the total headcount).
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

| Mode | Behavior |
|------|----------|
| `local-only` | Only local IPs may change settings |
| `token` | Changes require `Authorization: Bearer <OPENCLAW_RUNTIME_ACCESS_TOKEN>` |
| `none` | No check (trusted networks only) |

---

## HTTP API (selected)

Useful for scripts and monitoring. Full list lives in `src/**/*controller.ts`.

| Path | Method | Description |
|------|--------|-------------|
| `/api/health` | GET | Health + Gateway connection summary |
| `/api/status` | GET | Gateway `status` / `usage` JSON |
| **`/api/dashboard/overview`** | **GET** | Aggregated dashboard payload; optional `?timeRangeMs=` |
| `/api/sessions` | GET | Session list |
| `/api/sessions/:id` | GET | Session detail |
| `/api/sessions/:id/kill` | POST | Kill session |
| `/api/metrics/*` | GET | Latency, tools/skills, token summaries |
| `/api/logs` | GET | Recent log lines |
| `/api/setup/*` | GET/POST | Setup (protected by access mode) |

---

## WebSocket (logs)

Socket.IO namespace **`logs`**: `logs:subscribe` · `logs:unsubscribe` · server push `logs:new` (`timestamp`, `level`, `content`).

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Gateway unreachable | `OPENCLAW_GATEWAY_URL`, firewall; set token/password in Settings |
| **Test connection** fails with **`missing scope: operator.read`** | TraceFlow uses a device-less backend WebSocket; Gateway clears scopes, so older builds that called `skills.status` after connect failed. Current code uses connect **snapshot** for path checks and **`health` RPC** for overview (scope-exempt). See repo root **`AGENTS.md`**. |
| Empty logs | Gateway `logs.tail` may be unavailable without operator scope (falls back to empty); or set `OPENCLAW_LOG_PATH` |
| Token metrics show zero | Confirm sessions produce usage; check `/api/metrics/token-summary` and `/api/sessions/token-usage` |

---

## Roadmap

See **`ROADMAP.md`** in this repository.

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
