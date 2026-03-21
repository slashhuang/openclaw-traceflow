---
name: traceflow-deploy
description: Deploys or starts openclaw-traceflow with PM2 production flow. Use when user asks to deploy/start/restart/update-and-start traceflow, openclaw-traceflow, or monitor service.
metadata:
  {
    "openclaw": {
      "emoji": "🚀",
      "requires": { "bins": ["node", "pnpm", "pm2"] }
    }
  }
---

# TraceFlow Deploy Skill

Use this skill to deploy and start `openclaw-traceflow` with the default PM2 production workflow.

## Trigger Phrases

Apply this skill when user intent matches any of:

- "deploy traceflow"
- "start traceflow"
- "restart traceflow"
- "update and start traceflow"
- "deploy openclaw-traceflow"
- "start openclaw monitor"
- "restart openclaw monitor"

Also apply for equivalent Chinese phrasing:

- "部署 traceflow"
- "启动 traceflow"
- "重启 traceflow"
- "更新并启动 traceflow"
- "部署 openclaw-traceflow"
- "启动监控服务"
- "重启监控服务"

## Default Flow (PM2 Production)

1. Locate monorepo and enter `openclaw-traceflow`.
2. Verify dependencies: `node`, `pnpm`, `pm2`.
3. Install dependencies if needed (`node_modules` missing).
4. Run `pnpm run deploy:pm2`.
5. Verify process with `pm2 status openclaw-traceflow`.
6. Print recent logs with `pm2 logs openclaw-traceflow --lines 50 --nostream`.

## Manual Command

From `claw-family` directory:

```bash
./skills/traceflow-deploy/scripts/deploy.sh
```

## Expected Output (Example)

```text
[traceflow-deploy] Using monorepo root: /path/to/claw-sources
[traceflow-deploy] Running production deployment via PM2...
[traceflow-deploy] Checking PM2 process status...
[traceflow-deploy] Recent logs (50 lines, no stream)...
[traceflow-deploy] Done.
```

## Troubleshooting

- Missing `pnpm` or `pm2`:
  - Install and re-run:
  - `npm i -g pnpm`
  - `npm i -g pm2`
- Port conflict on `3001`:
  - Check process: `lsof -i :3001`
  - Stop conflicting process, then rerun deploy.
- PM2 process unhealthy:
  - Check details: `pm2 describe openclaw-traceflow`
  - Review logs: `pm2 logs openclaw-traceflow --lines 200 --nostream`

## Notes

- Default behavior is production deployment.
- For local development, use `openclaw-traceflow` project commands directly (`pnpm run start:dev`).
- Canonical docs for ports, env vars, and APIs: monorepo `openclaw-traceflow/README.md` and `openclaw-traceflow/CLAUDE.md` (TraceFlow defaults: UI **3001**, Gateway **18789**, dashboard poll **~10s** when tab visible).
