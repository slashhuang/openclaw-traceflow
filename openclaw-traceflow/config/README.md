# 运行时配置

## `openclaw.runtime.json`（本地，勿提交仓库）

首次使用请复制示例：

```bash
cp config/openclaw.runtime.example.json config/openclaw.runtime.json
```

再按需编辑。`openclaw.runtime.json` 已列入 `.gitignore`，避免把本机路径、Token 等推送到开源仓库。

## `dataDir`（数据目录）

- **不要**在示例或共享配置里写死绝对路径。
- **省略 `dataDir`**：使用进程**启动时工作目录**下的 `./data`（与 `pnpm run start:dev` 时 `cwd` 一致）。
- 需要固定目录时：在本机 `openclaw.runtime.json` 里写 `dataDir`，或设置环境变量 **`DATA_DIR`**（优先级更高）。

## 敏感配置

Gateway Token / Password、Access Token 等请优先用环境变量（如 `OPENCLAW_GATEWAY_TOKEN`），不要写入会提交的 JSON。
