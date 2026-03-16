---
name: code-sync
description: 代码同步与 Gateway 重启。当用户说「同步代码」、「更新代码」时自动执行，等同于 ./bootstrap.sh 的核心流程。
metadata:
  {
    "openclaw": {
      "emoji": "🔄",
      "requires": { "bins": ["git", "pm2"] },
    },
  }
---

# 代码同步 Skill

当用户说「同步代码」、「更新代码」、「拉代码」等指令时，自动执行代码同步并重启 Gateway。

## 触发指令

- 「同步代码」
- 「更新代码」
- 「拉代码」
- 「git pull」
- 「重启 Gateway」

## 执行流程

等同于 `./bootstrap.sh` 的核心逻辑：

1. **代码同步**：`git pull --ff-only`
2. **检查 PM2**：确保 PM2 已安装
3. **重启 Gateway**：`pm2 restart claw-gateway` 或 `pm2 start ecosystem.config.cjs`
4. **验证启动**：检查 Gateway 是否 online

## 手动执行

```bash
# 在仓库根目录执行
./skills/code-sync/scripts/sync.sh
```

或

```bash
python3 skills/code-sync/scripts/sync.py
```

## 输出示例

```
[code-sync] 开始同步代码...
[code-sync] 同步代码...
Already up to date.
[code-sync] 重启 claw-gateway...
[code-sync] 完成。Gateway 已 restart。
[code-sync] 当前 commit: abc1234
```

## 依赖

- Git（仓库环境）
- PM2（进程管理）
- Node.js（运行 openclaw）

## 注意事项

- 仅在**生产环境**使用（PM2 管理）
- 本地开发环境请用 `./scripts/start-openclaw.sh --env dev`
- 同步前先确认当前无重要操作在进行

## 状态检查

同步后可用以下命令检查：

```bash
pm2 status
pm2 logs claw-gateway
```
