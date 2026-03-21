# CLAUDE.md

完整说明见 **[AGENTS.md](./AGENTS.md)**（Monorepo 结构、TraceFlow 入口、Gateway `missing scope` 行为与代码位置）。

若只改 **TraceFlow**，请同时阅读 **`openclaw-traceflow/CLAUDE.md`**（含 README 约定与双远端说明）。

**改代码与提交/推送是两件事**；仅在用户**明确说**要提交或推送时再执行 Git。用户要求推送 **`main`** 且含 **`openclaw-traceflow/`** 时：先 `git push origin main`，再 `git subtree push --prefix=openclaw-traceflow openclaw-traceflow main`。
