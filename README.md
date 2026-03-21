# claw-sources（Monorepo）

本仓库为 **单一开发仓库**，以 **git subtree** 维护的一方子项目如下（**无独立「OpenClaw Monitor」子工程**）：

| 目录 | 说明 |
|------|------|
| `openclaw-traceflow/` | OpenClaw 可观测仪表盘（NestJS + React），见 [README](openclaw-traceflow/README.md) / [README.zh-CN](openclaw-traceflow/README.zh-CN.md)；**上游** `git@github.com:slashhuang/openclaw-traceflow.git` |
| `claw-family/` | OpenClaw 与飞书等场景，见该目录文档 |
| `futu-openD/` | 富途 OpenD 相关，见该目录文档 |

`external-refs/` 等为参考代码，**不是** subtree 子项目。

**开发入口**：在 **`openclaw-traceflow/`** 执行 `pnpm install`、`pnpm run start:dev` 等（根目录无独立 Node 工程）。

**Docker**：可在仓库根执行 `docker compose up -d`（`docker-compose.yml` 构建 **`openclaw-traceflow/`**），或 `cd openclaw-traceflow && docker compose up -d`。

- AI/编码助手（Cursor、Claude）：**[AGENTS.md](AGENTS.md)**
- 简化流程：[docs/MONOREPO-SIMPLIFIED.md](docs/MONOREPO-SIMPLIFIED.md)
- subtree 与上游：[docs/monorepo-workflow.md](docs/monorepo-workflow.md)
