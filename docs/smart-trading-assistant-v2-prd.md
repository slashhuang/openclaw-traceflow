# PRD: 智能盯盘助手 v2.0 — 日内异动监控优化

**创建日期**: 2026-03-16  
**作者**: 阿布 👧  
**状态**: 待评审

---

## 1. 背景与问题

### 1.1 当前状态
`smart-trading-assistant` 技能目前提供：
- 行情摘要（基于收盘价计算涨跌幅）
- 条件触达（仅支持基于昨收的涨跌幅/价位监控）
- 新闻聚合
- 操作建议

### 1.2 核心问题
1. **缺少日内异动监控**：只能监控「较昨日收盘」的涨跌，无法识别盘中突然拉升/跳水
2. **无成交量监控**：无法检测放量突破/异常交易
3. **数据留存不足**：状态文件仅记录预警触发时间，无历史价格/成交量数据
4. **播报信息重复**：每次播报都是静态快照，缺少对比和趋势

### 1.3 用户反馈
> "刚刚播报内容的有效信息基本重复，你想想办法优化下。可以考虑基于开盘价做比例监控，可能需要留存数据？比如某只股票突然拉升或者交易量突然增大"
> — 爸爸 (slashhuang), 2026-03-16

---

## 2. 优化目标

### 2.1 核心目标
1. **新增日内异动监控**：基于开盘价监控盘中涨跌幅
2. **新增成交量突增监控**：检测较历史平均的放量
3. **数据持久化**：留存每日开盘价、历史成交量数据
4. **播报优化**：增加「异动 alert」板块，突出显示值得关注的变化

### 2.2 成功指标
- 能检测到单日涨幅 >5% 的盘中异动
- 能检测到成交量 >3 倍日均的放量
- 播报信息量提升 50%+（增加对比数据）
- 误报率 <10%（通过合理 cooldown 控制）

---

## 3. 详细方案设计

### 3.1 新增监控类型

| 监控类型 | 代码 | 说明 | 计算方式 |
|---------|------|------|---------|
| 日内涨幅 | `intraday_pct_up` | 较开盘价上涨超过阈值 | `(current - open) / open * 100` |
| 日内跌幅 | `intraday_pct_down` | 较开盘价下跌超过阈值 | `(open - current) / open * 100` |
| 成交量突增 | `volume_spike` | 成交量超过历史平均 N 倍 | `volume > avg_volume * multiplier` |

### 3.2 数据结构变更

#### 3.2.1 状态文件 (`assistant_alert_state.json`)

**当前结构**:
```json
{
  "英伟达:pct_up:3": {
    "last_triggered": "2026-03-11T23:02:54.108724",
    "price": 180.25
  }
}
```

**新结构**:
```json
{
  "alerts": {
    "英伟达:pct_up:3": {
      "last_triggered": "2026-03-11T23:02:54.108724",
      "price": 180.25
    }
  },
  "daily_open": {
    "NVDA": {
      "2026-03-16": 178.50,
      "2026-03-15": 175.20
    }
  },
  "volume_history": {
    "NVDA": {
      "2026-03-16": 45000000,
      "2026-03-15": 42000000,
      "2026-03-14": 38000000
    }
  }
}
```

#### 3.2.2 配置文件 (`assistant_config.json`)

**新增配置项**:
```json
{
  "conditions": [
    {
      "stock": "英伟达",
      "type": "intraday_pct_up",
      "target": 5,
      "enabled": true,
      "cooldown_hours": 24
    },
    {
      "stock": "英伟达",
      "type": "volume_spike",
      "target": 3,
      "enabled": true,
      "cooldown_hours": 12,
      "volume_avg_days": 20
    }
  ],
  "data_retention": {
    "daily_open_days": 30,
    "volume_history_days": 90
  }
}
```

### 3.3 价格获取扩展

#### 3.3.1 新增返回字段
`price_fetcher.py` 的 `fetch_price()` 返回：
```python
{
    "price": 180.25,        # 当前价
    "prev_close": 177.82,   # 昨收
    "open": 178.50,         # 今开 (新增)
    "high": 182.00,         # 今高 (新增)
    "low": 177.00,          # 今低 (新增)
    "volume": 45000000,     # 成交量
    "change_pct": 1.37,     # 涨跌幅%
    "change": 2.43,         # 涨跌额
    "source": "tencent"
}
```

#### 3.3.2 API 支持情况

| API | 开盘价 | 成交量 | 备注 |
|-----|-------|-------|------|
| 东方财富 | ✅ | ✅ | 主用 |
| 腾讯财经 | ✅ | ✅ | 备用 |
| 新浪财经 | ✅ | ✅ | 第三备用 |

### 3.4 监控逻辑实现

#### 3.4.1 日内涨跌幅监控
```python
def check_intraday_pct(stock_name, symbol, condition, price_data, state):
    current = price_data["price"]
    open_price = get_or_fetch_open(symbol, price_data, state)
    
    if open_price == 0:
        return None  # 无开盘价，跳过
    
    pct = (current - open_price) / open_price * 100
    threshold = condition["target"]
    
    if condition["type"] == "intraday_pct_up" and pct >= threshold:
        return {"pct": pct, "open": open_price, "current": current}
    elif condition["type"] == "intraday_pct_down" and pct <= -threshold:
        return {"pct": pct, "open": open_price, "current": current}
    
    return None
```

#### 3.4.2 成交量突增监控
```python
def check_volume_spike(stock_name, symbol, condition, price_data, state):
    volume = price_data.get("volume", 0)
    if volume == 0:
        return None
    
    avg_days = condition.get("volume_avg_days", 20)
    avg_volume = calculate_avg_volume(symbol, avg_days, state)
    
    if avg_volume == 0:
        return None  # 历史数据不足
    
    multiplier = condition["target"]
    if volume >= avg_volume * multiplier:
        return {
            "volume": volume,
            "avg_volume": avg_volume,
            "ratio": volume / avg_volume
        }
    
    return None
```

### 3.5 播报格式优化

#### 3.5.1 新增「🔥 日内异动」板块
```markdown
## 🔥 日内异动

| 股票 | 类型 | 数值 | 详情 |
|------|------|------|------|
| 英伟达 | 盘中拉升 | +6.2% | 开盘$178.50 → 当前$189.50 |
|  Coinbase | 放量突破 | 4.2x | 成交量 45M vs 均量 10.7M |
| 比特币 | 盘中跳水 | -3.5% | 开盘$74,000 → 当前$71,400 |
```

#### 3.5.2 行情摘要增强
```markdown
### 🇺🇸 美股
- **英伟达** (NVDA): $180.25 (+1.37%) | 开$178.50 高$182.00 低$177.00 | 量 45M
```

#### 3.5.3 条件触达优化
```markdown
## 🔔 条件触达

- ⚠️ **英伟达** (NVDA): 日内涨幅 ≥5%，当前 +6.2% (开盘$178.50→当前$189.50)
- 📈 **Coinbase** (COIN): 成交量突增 ≥3x，当前 4.2x (45M vs 均量 10.7M)
```

---

## 4. 实施计划

### 4.1 阶段划分

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| Phase 1 | 数据结构扩展 + 状态文件迁移 | 2h |
| Phase 2 | 价格获取扩展（开盘价、成交量） | 2h |
| Phase 3 | 日内涨跌幅监控逻辑 | 2h |
| Phase 4 | 成交量突增监控逻辑 | 2h |
| Phase 5 | 播报格式优化 | 1h |
| Phase 6 | 测试与调优 | 2h |

**总计**: 约 11 小时

### 4.2 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `scripts/price_fetcher.py` | 修改 | 增加开盘价、成交量返回 |
| `scripts/daily_brief.py` | 修改 | 增加日内监控逻辑、播报优化 |
| `config/assistant_config.json` | 修改 | 增加新监控类型示例 |
| `config/assistant_alert_state.json` | 修改 | 数据结构扩展 |
| `README.md` | 修改 | 更新文档 |

### 4.3 兼容性处理
- 旧状态文件自动迁移（检测旧格式时转换）
- 新配置项可选（无配置时使用默认值）
- 无开盘价时降级为昨收监控

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 返回数据不一致 | 开盘价缺失 | 多 API 备用，降级处理 |
| 状态文件过大 | 性能下降 | 定期清理旧数据（可配置保留天数） |
| 误报过多 | 用户体验差 | 合理设置 cooldown，支持 per-stock 配置 |
| 历史数据不足 | 成交量监控不准 | 初期提示数据不足，累积后启用 |

---

## 6. 验收标准

### 6.1 功能验收
- [ ] 能正确获取开盘价、成交量数据
- [ ] 日内涨跌幅监控触发准确
- [ ] 成交量突增监控触发准确
- [ ] 状态文件正确保存和加载
- [ ] 播报格式正确显示新增信息

### 6.2 性能验收
- [ ] 脚本运行时间 <30 秒
- [ ] 状态文件大小 <1MB（90 天数据）
- [ ] 无内存泄漏

### 6.3 用户体验验收
- [ ] 播报信息清晰易懂
- [ ] 无重复/冗余信息
- [ ] 异动 alert 突出显示

---

## 7. 后续扩展（可选）

### 7.1 Phase 2 候选功能
1. **多周期监控**：5 分钟/15 分钟/1 小时涨跌幅
2. **技术指标**：RSI 超买超卖、MACD 金叉死叉
3. **关联监控**：板块联动、龙头股带动
4. **智能建议**：基于历史数据的操作建议

### 7.2 数据可视化
- K 线图（简易 ASCII 或链接到 TradingView）
- 成交量柱状图
- 涨跌幅热力图

---

## 8. 附录

### 8.1 配置示例
```json
{
  "conditions": [
    {
      "stock": "英伟达",
      "type": "intraday_pct_up",
      "target": 5,
      "enabled": true,
      "cooldown_hours": 24
    },
    {
      "stock": "英伟达",
      "type": "intraday_pct_down",
      "target": 5,
      "enabled": true,
      "cooldown_hours": 24
    },
    {
      "stock": "英伟达",
      "type": "volume_spike",
      "target": 3,
      "enabled": true,
      "cooldown_hours": 12,
      "volume_avg_days": 20
    }
  ]
}
```

### 8.2 参考资源
- 东方财富 API 文档：https://push2.eastmoney.com/
- 腾讯财经 API：https://qt.gtimg.cn/
- 新浪财经 API：https://finance.sina.com.cn/

---

**PRD 结束**

爸爸看完记得告诉阿布要不要开始实施哦～ 💪
