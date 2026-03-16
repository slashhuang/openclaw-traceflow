# OpenClaw Integration

Complete setup and usage guide for integrating the self-improvement skill with OpenClaw.

## Overview

OpenClaw uses workspace-based prompt injection combined with event-driven hooks. Context is injected from workspace files at session start, and hooks can trigger on lifecycle events.

## Workspace Structure

```
~/.openclaw/
├── workspace/                   # Working directory
│   ├── AGENTS.md               # Multi-agent coordination patterns
│   ├── SOUL.md                 # Behavioral guidelines and personality
│   ├── TOOLS.md                # Tool capabilities and gotchas
│   ├── MEMORY.md               # Long-term memory (main session only)
│   └── memory/                 # Daily memory files
│       └── YYYY-MM-DD.md
├── skills/                      # Installed skills
│   └── <skill-name>/
│       └── SKILL.md
└── hooks/                       # Custom hooks
    └── <hook-name>/
        ├── HOOK.md
        └── handler.ts
```

## Injected Prompt Files

- **AGENTS.md** — Multi-agent workflows and delegation patterns
- **SOUL.md** — Behavioral guidelines and communication style
- **TOOLS.md** — Tool capabilities, integration gotchas, local configuration

## Available Hook Events

| Event | When It Fires |
|-------|---------------|
| `agent:bootstrap` | Before workspace files inject |
| `command:new` | When `/new` command issued |
| `command:reset` | When `/reset` command issued |
| `command:stop` | When `/stop` command issued |
| `gateway:startup` | When gateway starts |

## Learning Workflow

Promote learnings: project-specific → `.learnings/`; behavioral → SOUL.md; tool-related → TOOLS.md; workflow → AGENTS.md.

## Reference

- OpenClaw Hooks: <https://docs.openclaw.ai/automation/hooks>
- 本仓库 workspace 与 bootstrap：`docs/prd-workspace-defaults-bootstrap-hook-2026-03-09.md`、`docs/prd-bootstrap.md`
