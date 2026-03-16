---
name: agent-workspace-defaults
description: "Use repo workspace-defaults for bootstrap files, dedupe by filename"
metadata: {"openclaw":{"emoji":"📁","events":["agent:bootstrap"]}}
---

# agent-workspace-defaults

在 `agent:bootstrap` 时用本仓库 **workspace-defaults** 下的文件（除 BOOT.md、README.md 外）替换/去重 `bootstrapFiles`，同名仅按文件名匹配，以 workspace-defaults 为准。见 docs/prd-workspace-defaults-bootstrap-hook-2026-03-09.md。

## 配置

由 ensure-openclaw-runtime.sh 在生成配置时注入 `workspaceDefaultsPath`（workspace-defaults 目录的绝对路径）；hook 从 `hooks.internal.entries["agent-workspace-defaults"].options.workspaceDefaultsPath` 读取。
