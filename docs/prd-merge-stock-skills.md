# PRD: 合并股票相关 Skills

**日期**: 2026-03-10  
**作者**: 阿布  
**状态**: 待确认  

---

## 背景

当前仓库有 3 个股票/财经相关的脚本/skill：

| 名称 | 位置 | 数据源 | 状态 |
|------|------|--------|------|
| stock-monitor-1.3.0 | `skills/stock-monitor-1.3.0/` | Yahoo Finance | ⚠️ 403 错误 |
| smart-trading-assistant | `skills/smart-trading-assistant/` | Yahoo Finance + RSS | ✅ 新结构 |
| trading_alert.py | `scripts/trading_alert.py` | 东方财富 + 新浪财经 | ✅ 双 API 稳定 |

**问题**：
1. `stock-monitor-1.3.0` 使用 Yahoo Finance，当前全部 403 报错（反爬）
2. `trading_alert.py` 已实现双 API 策略（东方财富主用、新浪财经备用），但未集成到 skill 体系
3. 功能重叠：都监控股价、都有条件提醒逻辑
4. 配置分散：`stocks_config.json`、`assistant_config.json`、`trading_watchlist.json` 三份配置

---

## 目标

1. **统一数据源**：采用双 API 策略（东方财富 + 新浪财经），避免 Yahoo Finance 403 问题
2. **合并功能**：将 `trading_alert.py` 的行情获取能力集成到 `smart-trading-assistant`
3. **清理冗余**：删除 `stock-monitor-1.3.0` skill
4. **配置统一**：统一使用 `trading_watchlist.json` 作为 watchlist 配置

---

## 方案

### 架构调整

```
合并前：
├── skills/stock-monitor-1.3.0/          # 删除
│   ├── scripts/stocks_monitor.py        # Yahoo API → 403
│   └── config/stocks_config.json        # 迁移配置
├── skills/smart-trading-assistant/      # 保留并增强
│   ├── scripts/daily_brief.py           # 集成双 API
│   └── config/assistant_config.json     # 统一配置
├── scripts/trading_alert.py             # 删除（功能并入 skill）
└── config/trading_watchlist.json        # 保留（统一配置）

合并后：
├── skills/smart-trading-assistant/      # 主 skill
│   ├── scripts/
│   │   ├── daily_brief.py               # 日报 + 行情
│   │   └── price_fetcher.py             # 新：双 API 股价获取
│   └── config/assistant_config.json     # 统一配置
└── config/trading_watchlist.json        # 统一 watchlist
```

### 实施步骤

#### Step 1: 创建 price_fetcher.py 模块
- 从 `trading_alert.py` 提取股价获取逻辑
- 支持 A 股（.SS/.SZ）、港股（.HK）、美股、加密货币、期货
- 双 API 策略：东方财富主用，新浪财经备用
- 输出格式：`{symbol: {price, change_pct, change, volume}}`

#### Step 2: 更新 daily_brief.py
- 导入 `price_fetcher.py` 获取实时行情
- 替换原有的 Yahoo Finance 调用
- 支持 heartbeat 模式（输出 HEARTBEAT_OK 或播报内容）

#### Step 3: 配置迁移
- 将 `stocks_config.json` 的标的合并到 `trading_watchlist.json`
- 更新 `assistant_config.json` 的 watchlist 引用

#### Step 4: 删除冗余文件
- 删除 `skills/stock-monitor-1.3.0/` 整个目录
- 删除 `scripts/trading_alert.py`
- 删除 `scripts/trading_alert_utils.py`（如有）

#### Step 5: 更新文档
- 更新 `HEARTBEAT.md` 中的 skill 任务说明
- 更新 `smart-trading-assistant/SKILL.md` 的使用说明

---

## 配置格式（统一后）

### trading_watchlist.json
```json
{
  "NVDA": {"name": "英伟达", "currency": "$", "watch_price": 140.00},
  "0700.HK": {"name": "腾讯控股", "currency": "HK$", "watch_price": 500.00},
  "BTC-USD": {"name": "比特币", "currency": "$", "watch_price": 90000.00},
  "GC=F": {"name": "黄金", "currency": "$", "watch_price": 2100.00},
  "PDD": {"name": "拼多多", "currency": "$", "watch_price": 100.00},
  "SMCI": {"name": "超微", "currency": "$", "watch_price": 50.00},
  "COIN": {"name": "Coinbase", "currency": "$", "watch_price": 250.00},
  "HIMS": {"name": "Hims", "currency": "$", "watch_price": 25.00},
  "QQQ": {"name": "QQQ", "currency": "$", "watch_price": 500.00},
  "HSTECH.HK": {"name": "恒生科技指数", "currency": "HK$", "watch_price": 4000.00},
  "BABA": {"name": "阿里巴巴", "currency": "$", "watch_price": 80.00}
}
```

---

## 验收标准

1. ✅ 执行 `python3 skills/smart-trading-assistant/scripts/daily_brief.py` 能正常获取股价（无 403）
2. ✅ heartbeat 轮询时能正常输出行情播报或 HEARTBEAT_OK
3. ✅ `stock-monitor-1.3.0` 目录已删除
4. ✅ `scripts/trading_alert.py` 已删除
5. ✅ 配置统一为 `trading_watchlist.json`
6. ✅ SKILL.md 和 HEARTBEAT.md 文档已更新

---

## 风险与回滚

| 风险 | 缓解措施 |
|------|----------|
| 双 API 策略失效 | 保留 Yahoo API 作为第三备用 |
| 配置迁移遗漏 | 合并前备份原配置文件 |
| heartbeat 不兼容 | 测试后更新 HEARTBEAT.md |

**回滚方案**：
```bash
git revert <merge-commit>
git checkout HEAD -- skills/stock-monitor-1.3.0 scripts/trading_alert.py
```

---

## 后续优化（可选）

1. 添加更多数据源（如富途、老虎 API）
2. 支持 WebSocket 实时推送
3. 增加技术指标计算（MA、RSI 等）
4. 支持自定义提醒规则（飞书卡片交互）

---

## 工作量估算

| 任务 | 预估时间 |
|------|----------|
| price_fetcher.py 开发 | 30 分钟 |
| daily_brief.py 改造 | 30 分钟 |
| 配置迁移 | 15 分钟 |
| 清理文件 | 10 分钟 |
| 文档更新 | 15 分钟 |
| 测试验证 | 30 分钟 |
| **总计** | **约 2 小时** |

---

## 决策点

请爸爸确认：
1. ✅ 是否同意删除 `stock-monitor-1.3.0`？
2. ✅ 是否同意删除 `scripts/trading_alert.py`？
3. ✅ 是否同意统一配置为 `trading_watchlist.json`？
4. ✅ 是否有需要保留的标的或配置？

确认后阿布开始实施～ 👧
