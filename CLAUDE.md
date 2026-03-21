# CLAUDE.md

完整说明见 **[AGENTS.md](./AGENTS.md)**（Monorepo 结构、TraceFlow 入口、Gateway `missing scope` 行为与代码位置）。

若只改 **TraceFlow**，请同时阅读 **`openclaw-traceflow/CLAUDE.md`**（含 README 约定与 **main 上 origin + subtree 双推送**）。

**推送 main 且含 `openclaw-traceflow/` 变更时**：先 `git push origin main`，再 `git subtree push --prefix=openclaw-traceflow openclaw-traceflow main`。
