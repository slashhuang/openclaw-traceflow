# Runtime configuration / 运行时配置

## English

- **`openclaw.runtime.json`** is **local-only** and **gitignored**. Copy from the example:

  ```bash
  cp config/openclaw.runtime.example.json config/openclaw.runtime.json
  ```

- **`dataDir`**: Do not commit absolute paths. If omitted, data lives under **`./data` relative to the process cwd** (same as when you run `pnpm run start:dev`). Override with `dataDir` in this file or with the **`DATA_DIR`** env var (env wins).

- **Secrets** (Gateway token/password, access token) should prefer **environment variables** (e.g. `OPENCLAW_GATEWAY_TOKEN`) over committed JSON.

---

## 中文

### `openclaw.runtime.json`（本地，勿提交仓库）

首次使用请复制示例：

```bash
cp config/openclaw.runtime.example.json config/openclaw.runtime.json
```

再按需编辑。该文件已列入 `.gitignore`，避免把本机路径、Token 等推送到远程。

### `dataDir`（数据目录）

- **不要**在示例或共享配置里写死绝对路径。  
- **省略 `dataDir`**：使用进程**启动时工作目录**下的 `./data`（与 `pnpm run start:dev` 的 `cwd` 一致）。  
- 需要固定目录时：在本机 `openclaw.runtime.json` 里写 `dataDir`，或设置环境变量 **`DATA_DIR`**（优先级更高）。

### 敏感配置

Gateway Token / Password、Access Token 等请优先用环境变量（如 `OPENCLAW_GATEWAY_TOKEN`），不要写入会被提交的 JSON。

---

## Product scope & performance / 产品口径与性能

统计口径（各面板纳入/排除项）与性能取向见仓库 **[`../README.md`](../README.md)**、**[`../README.zh-CN.md`](../README.zh-CN.md)**（Overview / 概述，Performance & capacity / 性能与容量）及 **[`../ROADMAP.md`](../ROADMAP.md)**。
