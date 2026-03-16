---
name: stock-assistant
description: 实时智能炒股助手。7x24 小时实时监控价格、成交量、新闻公告，毫秒级预警推送。支持 A 股/港股/美股/加密货币。
metadata:
  {
    "openclaw": {
      "emoji": "💰",
      "requires": { "bins": ["python3"] },
    },
  }
---

# 实时智能炒股助手 (Stock Assistant)

**核心功能**：
- 7x24 小时实时监控（永不疲劳）
- 毫秒级预警推送（不错过任何机会）
- 多用户独立配置（爸爸妈妈分开管理）
- 防限流策略（WebSocket 优先、推送合并）

---

## 触发词

**用户询问**：
- 「股票怎么样」
- 「我的持仓」
- 「股价预警」
- 「实时盯盘」

---

## 用法

### 1. 配置持仓

编辑 `skills/stock-assistant/config/assistant_config.json`：

```json
{
  "users": {
    "爸爸": {
      "feishu_user_id": "ou_3ea312add9031b59971788b123de0dd8",
      "holdings": {
        "NVDA": {
          "symbol": "NVDA",
          "market": "US",
          "cost": 450.00,
          "shares": 100,
          "target_price": 500.00,
          "stop_loss": 420.00
        }
      }
    }
  }
}
```

### 2. 安装依赖（首次或换机器必做）

**推荐方式**：在项目根目录执行：
```bash
npm run prepare
```

这会安装所有 Skill 的 Python 依赖。或手动安装：
```bash
pip3 install -r skills/stock-assistant/requirements.txt
```

国内网络建议使用清华镜像源：
```bash
pip3 install -r skills/stock-assistant/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

`npm run local` / `npm run dev` / `./bootstrap.sh` 会自动执行依赖安装；生产环境首次部署时执行 `npm run prepare` 即可。

### 3. 启动监控

```bash
cd /root/githubRepo/claw-family
python3 skills/stock-assistant/scripts/main.py
```

### 4. 查看预警

预警会自动推送到飞书：
- 触及止损价：<1 秒推送
- 涨跌±5%：<3 秒推送
- 成交量异常：<10 秒推送

---

## 配置说明

### 用户配置

| 字段 | 说明 | 示例 |
|------|------|------|
| `feishu_user_id` | 飞书用户 ID | `ou_xxx` |
| `holdings` | 持仓列表 | 见下方 |
| `alerts` | 预警阈值 | 见下方 |
| `schedule` | 定时任务开关 | 见下方 |

### 持仓配置

| 字段 | 说明 | 示例 |
|------|------|------|
| `symbol` | 股票代码 | `NVDA` |
| `market` | 市场（CN/US/HK/CRYPTO） | `US` |
| `cost` | 成本价 | `450.00` |
| `shares` | 股数 | `100` |
| `target_price` | 目标价 | `500.00` |
| `stop_loss` | 止损价 | `420.00` |

### 预警配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `price_change_pct.warning` | 涨跌预警阈值 | `3` |
| `price_change_pct.critical` | 涨跌紧急阈值 | `5` |
| `stop_loss.enabled` | 止损监控开关 | `true` |
| `stop_loss.pct` | 止损百分比 | `7` |
| `volume_ratio.warning` | 量比预警阈值 | `2` |

### 防限流配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `max_alerts_per_stock_per_day` | 每只股票每日最多推送 | `10` |
| `max_alerts_per_user_per_minute` | 每用户每分钟最多推送 | `5` |
| `silent_hours.start` | 静默时段开始 | `23:00` |
| `silent_hours.end` | 静默时段结束 | `07:00` |
| `merge_interval_seconds` | 推送合并间隔（秒） | `300` |

### 富途行情配置（global_settings.futu）

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `enabled` | 是否启用富途本地行情 | `true` |
| `host` | OpenD 地址 | `127.0.0.1` |
| `port` | OpenD API 端口 | `11113` |
| `websocket_port` | WebSocket 端口（预留） | `33333` |
| `websocket_key` | WebSocket 密钥（预留） | 建议用环境变量，见下 |

**websocket_key 建议通过 .env 配置**（避免写入配置文件）：在项目根目录或当前工作目录下创建 `.env`，增加一行：

```bash
FUTU_WEBSOCKET_KEY=你的OpenD密钥
```

启动时脚本会自动加载 `.env`；若未设置环境变量，则使用 `global_settings.futu.websocket_key`。

在 `assistant_config.json` 的 `global_settings.futu` 中修改 host/port 等即可，无需改代码。

**环境兼容**：服务器（Linux）请启动 futu-openD（见 `../../futu-openD/README.md`）；Mac 本地请自行运行富途 Mac OpenD 应用，并将 API 端口设为 **11113**、WebSocket 端口设为 **33333**，与上述默认一致即可双环境共用同一配置。

---

## 监控指标

### 实时监控

| 指标 | 刷新频率 | 预警条件 |
|------|----------|----------|
| 价格 | 3-5 秒/次 | ±3%/±5%/止损价 |
| 成交量 | 3-5 秒/次 | 量比>2/>5 |
| 大单 | 5 秒/次 | 单笔>1000 万 |
| 新闻/公告 | 实时 | 业绩预告/重大合同 |

### 定时任务

| 任务 | 时间 | 内容 |
|------|------|------|
| 早盘推送 | 工作日 9:00 | 隔夜新闻、美股走势 |
| 收盘推送 | 工作日 15:30 | 当日总结、资金流向 |
| 周末复盘 | 周日 20:00 | 本周总结、仓位检查 |

---

## 推送示例

### 触及止损价（<1 秒）

```
🚨 紧急预警 - NVDA 触及止损价

股票：英伟达（NVDA）
当前价：$420.00
止损价：$420.00
持仓盈亏：-7.0%

⚠️ 立即执行止损！

纪律：-7% 强制止损，不抱侥幸心理
```

### 涨跌预警（<3 秒）

```
⚠️ NVDA 价格异动提醒

当前价：$480.00
涨跌幅：+5.2% 🔥
成交量：5000 万股（5 日均量 2 倍）

建议：
- 已持有：继续持有，目标价$500
- 未持有：观望，等待回调

止损价：$420（-7%）
```

### 持仓异动汇总（5 分钟合并）

```
📊 持仓股异动汇总（10:30-10:35）

- NVDA：+3.2%
- AAPL：+2.5%
- MSFT：+1.8%

综合：科技股普涨，建议继续持有
```

---

## 技术架构

```
实时数据源（WebSocket）
    ↓
实时数据处理引擎
    ↓
预警优先级队列（紧急>预警>普通）
    ↓
飞书推送（<1 秒响应）
```

**数据源**：
- A 股/港股：本地富途 OpenD（优先）+ 东方财富 Web/API（备用）
- 美股：东方财富 API（如账户开通美股行情，可扩展为优先走富途）
- 加密货币：Binance WebSocket

**防限流**：
- WebSocket 优先（不限流）
- 推送合并（5 分钟汇总）
- 频率限制（每日最多 10 条/股票）
- 静默时段（23:00-07:00）

---

## 依赖

- Python 3.6+
- websockets（WebSocket 连接）
- aiohttp（异步 HTTP）
- aiofiles（异步文件）
- futu-api（富途 OpenD 本地行情）

安装依赖：
```bash
pip3 install websockets aiohttp aiofiles futu-api
```

本地需开启富途 OpenD，端口与 `global_settings.futu` 中配置一致（见上方「富途行情配置」）。Mac 本地用官方 OpenD 应用时请将端口设为 11113 / 33333；服务器请启动 futu-openD（见 `../../futu-openD/README.md`）。

---

**维护者**：阿布 👧  
**创建日期**：2026-03-11
