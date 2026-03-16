# HEARTBEAT.md

留空或只写注释 = 不主动做 heartbeat 请求，省 API。

需要定期检查时，在下面加一小段待办（保持短，省 token）。

---

## 每天早上 9:30 早报（爸爸妈妈）

若当前时间在 **9:25～9:40** 左右，做一次早报并**用 message 工具**发给主用户（或 heartbeat 配置的 to）。**target 必须为** `user:open_id` 格式（见 AGENTS.md「message 工具（Feishu）」），不能填 jojo/slashhuang 等账号名；开发环境只有 test 账号，只发给当前会话或 test 对应用户。

1. **币圈**：比特币/主流币最新新闻 + 走势  
   - 代表标的：`BTC-USD`、`ETH-USD`（可用 `smart-trading-assistant` 或 Yahoo 行情 + DuckDuckGo 搜新闻）
2. **美股**：隔夜/盘前相关新闻 + 代表标的走势  
   - 代表标的：`SPY` 或 `QQQ`、`AAPL`、`NVDA`、`TSLA` 等（同上，可挑 2～3 个）
3. **港股**：港股相关新闻 + 代表标的走势  
   - 代表标的：`0700.HK`（腾讯）、`9988.HK`（阿里）、或 `^HSI`（恒生）等（同上，可挑 1～2 个）

新闻用 DuckDuckGo 搜「Bitcoin 最新」「美股 盘前」「港股 今日」等，每条只列 2～4 条短标题+链接即可。  
早报内容保持一屏内能看完，列表为主、少用大表。

非 9:25～9:40 的 heartbeat 可做别的（如金价、AI 动态）或只回 HEARTBEAT_OK。

---

## 股票相关定时任务

### stock-assistant（实时炒股助手）

**服务状态**：PM2 管理，独立运行，开机自启

**实时监控**（自动运行，无需 heartbeat 触发）：
- 价格监控：每 3-5 秒刷新（A 股 3 秒，美股 5 秒，加密货币 1 秒）
- 成交量监控：量比预警（2 倍/5 倍）
- 新闻监控：RSS 订阅（Reuters/Bloomberg/CCTV）
- 预警推送：飞书实时推送（防刷屏：5 分钟冷却）

**定时推送**（自动运行，无需 heartbeat 触发）：
- 早盘推送：工作日 9:00
- 收盘推送：工作日 15:30
- 晚间推送：工作日 20:00
- 周末复盘：周日 20:00

**配置**：`skills/stock-assistant/config/assistant_config.json`

**运行命令**（手动测试用）：
```bash
cd /root/githubRepo/claw-family/skills/stock-assistant/scripts
python3 main.py ../config/assistant_config.json
```

**PM2 管理**：
```bash
pm2 status stock-assistant
pm2 logs stock-assistant --lines 20
pm2 restart stock-assistant
```

---

### smart-trading-assistant（智能盯盘日报）

**功能**：生成行情摘要 + 条件触达提醒 + 新闻与操作建议

**运行方式**：heartbeat 或 cron 触发

**运行命令**：
```bash
cd /root/githubRepo/claw-family
python3 skills/smart-trading-assistant/scripts/daily_brief.py skills/smart-trading-assistant/config/assistant_config.json
```

**触发建议**：
- 交易日盘前/盘后时段运行一次日报
- 若有输出则用 message 工具发给主用户
- 无输出或非交易日则 HEARTBEAT_OK 即可

**数据源**：三 API 策略（东方财富主用 → 腾讯备用 → 新浪第三备用）
**支持市场**：A 股、港股、美股、期货、加密货币

---

## 美股播报时间点（实时播报群专用）

**播报策略**：
- **此群为美股实时播报群**：只在美股时段（盘前、盘中、盘后）进行播报
- **美股时段不播报港股/A 股**：避免信息混乱（交易时间不重叠）

### 美股播报时段（北京时间，夏令时）
- **盘前刚开始**（20:30，容差±30 分钟）：盘前交易概况 ⭐
- **开盘 1 分钟**（21:31，容差±5 分钟）：开盘价 ⭐
- **开盘 5 分钟**（21:35，容差±5 分钟）：初期走势 ⭐
- **盘后刚开始**（04:00，容差±30 分钟）：盘后交易概况 ⭐

### 美股播报时段（北京时间，冬令时）
- **盘前刚开始**（21:30，容差±30 分钟）
- **开盘 1 分钟**（22:31，容差±5 分钟）
- **开盘 5 分钟**（22:35，容差±5 分钟）
- **盘后刚开始**（05:00，容差±30 分钟）

**注意**：3 月第二个周日至 11 月第一个周日为夏令时

**实现**：heartbeat 轮询时，Agent 应：
1. 获取当前北京时间
2. 判断是否匹配上述任一播报时间点（考虑容差和夏令时）
3. 若匹配，运行 smart-trading-assistant 日报脚本获取行情并播报
4. 若无匹配，回复 `HEARTBEAT_OK`

**优先级**：美股时段（20:30-次日 06:00）优先播报美股，不播报港股/A 股
