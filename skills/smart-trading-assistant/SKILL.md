---
name: smart-trading-assistant
description: 智能盯盘与行情助手。在交易日产出「行情摘要 + 条件触达提醒 + 新闻与操作建议」的汇总，通过 cron 一手推送到飞书。支持美股、港股、比特币、黄金等；可配置盯盘条件（涨跌超 X%、触及价位）、交易日历、新闻关键词；可选再平衡提醒。
metadata:
  {
    "openclaw": {
      "emoji": "📈",
      "requires": { "bins": ["python3"] },
    },
  }
---

# 智能盯盘与行情助手

按 [PRD：智能盯盘与行情助手](docs/prd-smart-trading-assistant-2026-03-08.md) 实现：在**交易日**生成一份「行情 + 盯盘条件 + 新闻与警惕」的**一手汇总**，通过飞书推送给用户。

## 快速开始

### 1. 配置

编辑本 skill 下的 `config/assistant_config.json`：

- **watchlist**：自选/持仓列表（美股、港股、BTC-USD、GC=F 等）。
- **conditions**：盯盘条件（涨跌超 X%、价格 ≥/≤ 某价位），满足时并入当日汇总。
- **schedule**：在哪些时段出报告（如 pre_market / post_market）；是否仅交易日发送。
- **news**：是否拉取新闻、RSS 地址、关键词筛选。
- **rebalance**：可选，再平衡配置路径，满足时在汇总中给出再平衡提醒。

交易日历在 `config/trading_calendar.json`（美股/港股休市日），可按年维护。

**数据源**：三 API 策略（东方财富 → 腾讯 → 新浪），支持 A 股（.SS/.SZ）、港股（.HK）、美股、期货、加密货币。

### 2. 运行一次（测试）

在**仓库根目录**执行：

```bash
cd /root/githubRepo/claw-family
python3 skills/smart-trading-assistant/scripts/daily_brief.py skills/smart-trading-assistant/config/assistant_config.json
```

输出为 Markdown，可直接作为飞书消息内容。若当前非交易日或该时段未配置发送，脚本会说明并退出。

### 3. 定时推送（cron）

与 OpenClaw 的 cron 配合，在交易日指定时段运行并把输出发到飞书，例如：

```bash
# 港股/亚洲时段：工作日 9:15 一次
openclaw cron add --name "智能盯盘-早盘" --cron "15 9 * * 1-5" --tz "Asia/Shanghai" \
  --message "运行 python3 $(pwd)/skills/smart-trading-assistant/scripts/daily_brief.py $(pwd)/skills/smart-trading-assistant/config/assistant_config.json 并把输出发给我" --channel feishu

# 美股收盘后：北京时间 5:00
openclaw cron add --name "智能盯盘-美股盘后" --cron "0 5 * * 2-6" --tz "Asia/Shanghai" \
  --message "运行 python3 $(pwd)/skills/smart-trading-assistant/scripts/daily_brief.py $(pwd)/skills/smart-trading-assistant/config/assistant_config.json 并把输出发给我" --channel feishu
```

（具体 cron 表达式可按 `schedule.report_times` 与交易所时段自行调整。）

### 4. Heartbeat 任务

## Heartbeat 任务

若**未**配置本 skill 的 cron，可在某次 heartbeat 时（例如交易日盘前/盘后时段）运行一次日报并把结果发给主用户：

- 运行：在**仓库根目录**（`/root/githubRepo/claw-family/`）执行：
  ```bash
  python3 skills/smart-trading-assistant/scripts/daily_brief.py skills/smart-trading-assistant/config/assistant_config.json
  ```
- 若有输出则用 **message 工具**发给主用户；无输出或非交易日则 HEARTBEAT_OK 即可。

推荐仍以 cron 卡准点推送为主；heartbeat 为补充。

**数据源**：三 API 策略（东方财富主用 → 腾讯备用 → 新浪第三备用），支持 A 股、港股、美股、期货、加密货币。

### 5. 关闭某类提醒

在 `assistant_config.json` 中：

- `schedule.disabled_sections`：可填 `["news"]` 或 `["rebalance"]` 等，关闭对应区块。
- 将 `news.enabled` 设为 `false` 即不拉新闻。

## 配置说明

| 配置块 | 说明 |
|--------|------|
| **watchlist** | `名称 -> { symbol, currency, watch_price? }`。支持代码格式：NVDA（美股）、0700.HK（港股）、600519.SS（A 股）、BTC-USD（加密货币）、GC=F（期货）等。 |
| **conditions** | 条件列表：`type` 为 `price_above` / `price_below` / `pct_up` / `pct_down`，`target` 为数值，`stock` 为 watchlist 中的名称；可选 `cooldown_hours`、`enabled`。 |
| **schedule** | `report_times`：本次运行视为哪一时段（pre_market / post_market / intraday）；`trading_day_regions`：["us","hk"] 表示仅当美股或港股为交易日时发送；`disabled_sections`：不输出的区块。 |
| **news** | `enabled`、`rss_urls`、`keywords`、`max_items`。首版仅支持 RSS。 |
| **rebalance** | 可选 `config_path` 指向再平衡配置；若存在则调用再平衡逻辑并将结果并入汇总。 |

## 状态文件

- 条件触达的「首次/续警」状态写在 `config/assistant_alert_state.json`（已 gitignore）。
- 与 stock-monitor 的 `stocks_alert.json` 独立，避免互相覆盖。

## 依赖

- Python 3，标准库 + `urllib.request`（RSS 用 xml.etree）。
- 行情来自 Yahoo Finance Chart API（与 stock-monitor 一致）；新闻来自配置的 RSS。
