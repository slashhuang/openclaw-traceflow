---
name: claw-family-restart
description: Restarts the claw-family Gateway service with PM2. Use when user asks to restart Gateway, claw-family, or claw-gateway.
metadata:
  {
    "openclaw": {
      "emoji": "🔄",
      "requires": { "bins": ["pm2"] }
    }
  }
---

# claw-family-restart Skill

Use this skill to restart the claw-family Gateway service with PM2.

## Trigger Phrases

Apply this skill when user intent matches any of:

- "restart gateway"
- "restart claw-family"
- "restart claw-gateway"
- "reboot gateway"
- "reload gateway"

Also apply for equivalent Chinese phrasing:

- "重启 gateway"
- "重启 claw-family"
- "重启网关"
- "重载 gateway"

## Default Flow (PM2 Restart)

1. Verify PM2 process exists: `pm2 status claw-gateway`
2. Restart with environment reload: `pm2 restart claw-gateway --update-env`
3. Verify process healthy: `pm2 status claw-gateway`
4. Print recent logs: `pm2 logs claw-gateway --lines 30 --nostream`

## Manual Command

From `claw-family` directory:

```bash
./skills/claw-family-restart/scripts/restart.sh
```

## Expected Output (Example)

```text
[claw-family-restart] Checking PM2 process status...
[claw-family-restart] Restarting claw-gateway with --update-env...
[claw-family-restart] Verifying process healthy...
[claw-family-restart] Recent logs (30 lines, no stream)...
[claw-family-restart] Done.
```

## Troubleshooting

- PM2 process not found:
  - Check process name: `pm2 list`
  - May need to start first: `pm2 start ecosystem.config.cjs`
- Restart fails:
  - Check details: `pm2 describe claw-gateway`
  - Review logs: `pm2 logs claw-gateway --lines 200 --nostream`
- Environment variables not updated:
  - Ensure using `--update-env` flag
  - Verify `.env` or environment is set correctly

## Notes

- Always use `--update-env` to reload environment variables
- This skill is **isolated** from code-sync and git-workflow flows
- For code changes, use `code-sync` skill first, then restart separately
- Gateway process name: `claw-gateway` (defined in `ecosystem.config.cjs`)
