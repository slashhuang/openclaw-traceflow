# 🦞 OpenClaw TraceFlow

[English](./README.en.md) | [中文](./README.md)

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

OpenClaw TraceFlow is an open-source observability dashboard for OpenClaw.
It helps you inspect sessions, token usage, skill/tool activity, and runtime health.

> This project is actively evolving. APIs and docs may change between versions.

---

## Requirements

- Node.js `>= 20.11.0` (Node 20 LTS recommended)
- pnpm `>= 9.0.0`
- PM2 (optional, required for PM2 deployment)

Check versions:

```bash
node -v
pnpm -v
```

Install pnpm if needed:

```bash
npm i -g pnpm
```

---

## Build & Deploy

### Recommended (PM2)

```bash
pnpm install
pnpm run deploy:pm2
```

Manual equivalent:

```bash
pnpm run build:all
pm2 start dist/main.js --name openclaw-traceflow \
  --restart-delay=3000 \
  --max-restarts=10
```

Open `http://localhost:3001`.

---

## Quick Start (Source)

```bash
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

---

## Highlights

- Session list and session detail inspection
- Skill/tool usage analysis
- Token monitor and alerts
- System prompt analysis
- Pricing configuration and token cost estimation
- Health/status/log views

---

## Configuration

Common environment variables:

- `OPENCLAW_GATEWAY_URL` (default: `http://localhost:18789`)
- `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD` (optional)
- `OPENCLAW_STATE_DIR` (optional; auto-resolved if omitted)
- `OPENCLAW_WORKSPACE_DIR` (optional; auto-resolved if omitted)
- `OPENCLAW_LOG_PATH` (optional fallback log file path)
- `OPENCLAW_CLI` (default: `openclaw`)
- `OPENCLAW_RUNTIME_ACCESS_TOKEN`
- `OPENCLAW_ACCESS_MODE` (`local-only` | `token` | `none`)
- `HOST` (default: `127.0.0.1`)
- `PORT` (default: `3001`)
- `DATA_DIR` (default: `./data`)

For complete details and screenshots, see the Chinese README:
[README.md](./README.md)

---

## Contributing

Issues and pull requests are welcome.

If you are looking for implementation details, routes, and troubleshooting notes,
please check [README.md](./README.md) first.

---

## License

MIT © [slashhuang](https://github.com/slashhuang)
