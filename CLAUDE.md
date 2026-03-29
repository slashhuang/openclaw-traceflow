# CLAUDE.md（claw-sources 根）

**用途**：人类与 AI 的**最短路由**；完整上下文见 **[AGENTS.md](./AGENTS.md)**。

---

## 你该读哪个文件

1. **任何子项目 / Monorepo 规则 / Gateway `missing scope`** → [AGENTS.md](./AGENTS.md)
2. **只改 TraceFlow**（`openclaw-traceflow/`）→ 再读 [openclaw-traceflow/CLAUDE.md](openclaw-traceflow/CLAUDE.md)

---

## 硬规则（违反会误操作）

| 规则 | 说明 |
|------|------|
| 工作目录 | TraceFlow：`cd openclaw-traceflow` 再 `pnpm install` / `pnpm run start:dev`；**根目录无独立 Nest 应用** |
| Git | 用户说**提交**→ 默认仅本地 `add`/`commit`，不自动 push、不 fetch subtree。用户明确**推送/同步**时再 push；否则不要代提交 |
| 双远端推送 | 推 **`main`** 且含 **`openclaw-traceflow/`** 时，根目录**依次**：`git push origin main` → `git subtree push --prefix=openclaw-traceflow openclaw-traceflow main`（勿默认 `git fetch` subtree） |
| Gateway | Backend 无设备连接 **scopes 可能被清空**；路径用 connect **snapshot**，概览用 **`health` RPC**（详见 AGENTS.md） |

---

## 一句话地图

- **仪表盘与 Gateway**：`openclaw-traceflow/`
- **技能 / 飞书等**：`claw-family/`
- **只读对照**：`external-refs/openclaw/`
