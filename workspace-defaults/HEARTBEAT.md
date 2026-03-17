# HEARTBEAT.md — 定时播报任务清单

留空或只写注释 = 不主动做 heartbeat 请求，省 API。

需要定期检查时，在下面加一小段待办（保持短，省 token）。

---

## 每天早上 9:30 早报（爸爸妈妈）

若当前时间在 **9:25～9:40** 左右，做一次早报并用 **message 工具** 发送。

**内容**：
1. **币圈**：比特币/主流币最新新闻 + 走势（BTC-USD、ETH-USD）
2. **美股**：隔夜/盘前相关新闻 + 走势（SPY、QQQ、AAPL、NVDA、TSLA）
3. **港股**：港股相关新闻 + 走势（0700.HK 腾讯、9988.HK 阿里、^HSI 恒生）

**要求**：每条 2～4 条短标题 + 链接，一屏内能看完。

---

## 美股播报（实时播报群专用）

**播报时段（北京时间，夏令时）**：
- 盘前刚开始（20:30，容差±30 分钟）⭐
- 开盘 1 分钟（21:31，容差±5 分钟）⭐
- 开盘 5 分钟（21:35，容差±5 分钟）⭐
- 盘后刚开始（04:00，容差±30 分钟）⭐

**冬令时**：上述时间 +1 小时

**实现**：匹配时段时运行 smart-trading-assistant 日报脚本并播报。

---

## 股票相关定时任务

### stock-assistant（实时炒股助手）

**运行方式**：PM2 管理，独立运行

**定时推送**：
- 早盘推送：工作日 9:00
- 收盘推送：工作日 15:30
- 晚间推送：工作日 20:00
- 周末复盘：周日 20:00

**配置**：`skills/stock-assistant/config/assistant_config.json`

### smart-trading-assistant（智能盯盘日报）

**运行命令**：
```bash
python3 skills/smart-trading-assistant/scripts/daily_brief.py skills/smart-trading-assistant/config/assistant_config.json
```

**触发建议**：交易日盘前/盘后时段运行一次日报

---

**注意**：target 必须为 `user:open_id` 格式（见 AGENTS.md），不能填 jojo/slashhuang 等账号名。
