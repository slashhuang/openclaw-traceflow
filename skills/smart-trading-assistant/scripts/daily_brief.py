#!/usr/bin/env python3
"""
智能盯盘与行情助手 - 日报脚本
按 PRD 实现：在交易日生成「行情 + 盯盘条件 + 新闻与警惕」的一手汇总

用法：python3 daily_brief.py [config_file]
默认读取 skills/smart-trading-assistant/config/assistant_config.json

输出为 Markdown 格式，可直接作为飞书消息内容。
若当前非交易日或该时段未配置发送，脚本会说明并退出。

数据源：双 API 策略（东方财富主用，新浪财经备用）
"""

import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

# 导入价格获取模块（双 API 策略）
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
from price_fetcher import fetch_price, fetch_multiple_prices

# ==================== 路径处理 ====================

def get_config_path():
    """获取配置文件路径"""
    if len(sys.argv) > 1:
        return os.path.abspath(os.path.expanduser(sys.argv[1]))
    # 默认路径：脚本所在目录的 config/assistant_config.json
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, "..", "config", "assistant_config.json")

def get_state_path():
    """状态文件路径（与配置同目录）"""
    config_path = get_config_path()
    config_dir = os.path.dirname(config_path)
    return os.path.join(config_dir, "assistant_alert_state.json")

def get_calendar_path():
    """交易日历路径（与配置同目录）"""
    config_path = get_config_path()
    config_dir = os.path.dirname(config_path)
    return os.path.join(config_dir, "trading_calendar.json")

# ==================== 数据加载 ====================

def load_config():
    """加载配置文件"""
    config_path = get_config_path()
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 返回默认配置
    return {
        "watchlist": {
            "美股": {
                "英伟达": {"symbol": "NVDA", "currency": "$"}
            },
            "港股": {
                "腾讯控股": {"symbol": "0700.HK", "currency": "HK$"}
            },
            "加密货币": {
                "比特币": {"symbol": "BTC-USD", "currency": "$"}
            },
            "期货/商品": {
                "黄金": {"symbol": "GC=F", "currency": "$"}
            }
        },
        "conditions": [],
        "schedule": {
            "report_times": ["pre_market", "post_market"],
            "trading_day_regions": ["us", "hk"],
            "disabled_sections": []
        },
        "news": {
            "enabled": True,
            "rss_urls": [],
            "keywords": ["美联储", "通胀", "利率", "AI", "芯片"],
            "max_items": 5
        },
        "rebalance": None
    }

def load_state():
    """加载预警状态"""
    state_path = get_state_path()
    if os.path.exists(state_path):
        with open(state_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_state(state):
    """保存预警状态"""
    state_path = get_state_path()
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with open(state_path, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def load_calendar():
    """加载交易日历"""
    calendar_path = get_calendar_path()
    if os.path.exists(calendar_path):
        with open(calendar_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 返回空日历（默认每天都算交易日）
    return {"us": [], "hk": []}

# ==================== 行情获取 ====================

def get_price_data(symbol):
    """
    获取股价数据（双 API 策略：东方财富主用，新浪财经备用）
    
    返回：
        {
            "price": 140.5,
            "prev_close": 137.35,  # 用于计算涨跌幅
            "change_pct": 2.3,
            "change": 3.15,
            "source": "eastmoney" | "sina"
        }
        或 None（获取失败）
    """
    result = fetch_price(symbol)
    if result is None:
        return None
    
    # 计算昨收（用于涨跌幅计算）
    price = result["price"]
    change_pct = result.get("change_pct", 0)
    change = result.get("change", 0)
    
    # prev_close = price / (1 + change_pct/100)
    if change_pct != 0:
        prev_close = price / (1 + change_pct / 100)
    else:
        prev_close = price  # 无涨跌幅时使用当前价
    
    return {
        "price": price,
        "prev_close": prev_close,
        "change_pct": change_pct,
        "change": change,
        "source": result.get("source", "unknown")
    }

# ==================== 交易日历检查 ====================

def is_trading_day(regions, calendar):
    """检查今天是否为指定地区的交易日"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    for region in regions:
        if region in calendar:
            holidays = calendar[region]
            if today in holidays:
                return False  # 是假日，非交易日
    
    # 周末检查
    weekday = datetime.now().weekday()
    if weekday >= 5:  # 周六=5, 周日=6
        return False
    
    return True

# ==================== 条件检查 ====================

def find_stock_in_watchlist(stock_name, watchlist):
    """在分组或扁平的 watchlist 中查找股票配置"""
    if stock_name in watchlist:
        config = watchlist[stock_name]
        if isinstance(config, dict) and "symbol" in config:
            return config
        # 如果是分组，递归查找
        return None
    
    # 分组格式：递归查找
    for group_name, stocks in watchlist.items():
        if isinstance(stocks, dict) and stock_name in stocks:
            return stocks[stock_name]
    
    return None

def check_conditions(watchlist, conditions, prices, state):
    """检查盯盘条件，返回触发的条件列表"""
    triggered = []
    now = datetime.now()
    
    for condition in conditions:
        if not condition.get("enabled", True):
            continue
        
        stock_name = condition.get("stock")
        stock_config = find_stock_in_watchlist(stock_name, watchlist)
        if stock_config is None:
            continue
        
        symbol = stock_config["symbol"]
        if symbol not in prices or prices[symbol] is None:
            continue
        
        price_data = prices[symbol]
        current_price = price_data["price"]
        prev_close = price_data.get("prev_close", current_price)
        change_pct = price_data.get("change_pct", 0)  # 直接使用 API 返回的涨跌幅
        
        condition_type = condition.get("type")
        target = condition.get("target")
        triggered_flag = False
        
        if condition_type == "price_above" and current_price >= target:
            triggered_flag = True
        elif condition_type == "price_below" and current_price <= target:
            triggered_flag = True
        elif condition_type == "pct_up":
            # 使用 API 直接返回的 change_pct
            if change_pct >= target:
                triggered_flag = True
        elif condition_type == "pct_down":
            if change_pct <= -target:
                triggered_flag = True
        
        if triggered_flag:
            # 检查冷却时间
            state_key = f"{stock_name}:{condition_type}:{target}"
            last_triggered = state.get(state_key, {}).get("last_triggered")
            cooldown_hours = condition.get("cooldown_hours", 24)
            
            if last_triggered:
                last_time = datetime.fromisoformat(last_triggered)
                if (now - last_time).total_seconds() < cooldown_hours * 3600:
                    continue  # 冷却中，跳过
            
            # 记录触发
            triggered.append({
                "stock": stock_name,
                "symbol": symbol,
                "condition": condition,
                "current_price": current_price,
                "prev_close": prev_close,
                "change_pct": change_pct
            })
            
            # 更新状态
            state[state_key] = {
                "last_triggered": now.isoformat(),
                "price": current_price
            }
    
    return triggered

# ==================== 新闻获取 ====================

def fetch_news(config):
    """从 RSS 获取新闻"""
    if not config.get("enabled", True):
        return []
    
    rss_urls = config.get("rss_urls", [])
    keywords = config.get("keywords", [])
    max_items = config.get("max_items", 5)
    
    all_news = []
    
    for url in rss_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                xml_content = response.read().decode('utf-8')
            
            root = ET.fromstring(xml_content)
            # 处理不同格式的 RSS
            items = root.findall(".//item") or root.findall(".//{http://purl.org/rss/1.0/}item")
            
            for item in items[:max_items * 2]:  # 多取一些用于筛选
                title_elem = item.find("title")
                link_elem = item.find("link")
                desc_elem = item.find("description")
                
                if title_elem is not None and link_elem is not None:
                    title = title_elem.text or ""
                    link = link_elem.text or ""
                    desc = desc_elem.text if desc_elem is not None else ""
                    
                    # 关键词筛选
                    if keywords:
                        text = (title + " " + desc).lower()
                        if not any(kw.lower() in text for kw in keywords):
                            continue
                    
                    all_news.append({
                        "title": title,
                        "link": link,
                        "description": desc[:200] if desc else ""
                    })
        except Exception as e:
            print(f"获取 RSS {url} 失败：{e}", file=sys.stderr)
            continue
    
    return all_news[:max_items]

# ==================== 行情摘要生成 ====================

# 市场分类配置
MARKET_CONFIG = {
    "美股": {"emoji": "🇺🇸", "order": 1},
    "港股": {"emoji": "🇭🇰", "order": 2},
    "A 股": {"emoji": "🇨🇳", "order": 3},
    "加密货币": {"emoji": "₿", "order": 4},
    "期货/商品": {"emoji": "🏆", "order": 5},
}

def generate_market_summary(watchlist, prices):
    """生成行情摘要（分类播报）"""
    lines = ["## 📊 行情摘要\n"]
    
    # 检查 watchlist 是否为分组格式（嵌套 dict）
    is_grouped = any(isinstance(v, dict) and "symbol" not in v for v in watchlist.values())
    
    if is_grouped:
        # 分组格式：按市场分类播报
        for market_name, stocks in watchlist.items():
            market_config = MARKET_CONFIG.get(market_name, {"emoji": "📈", "order": 99})
            emoji = market_config["emoji"]
            
            market_lines = [f"### {emoji} {market_name}\n"]
            has_data = False
            
            for name, config in stocks.items():
                symbol = config["symbol"]
                if symbol not in prices or prices[symbol] is None:
                    market_lines.append(f"- **{name}** ({symbol}): 数据暂不可用")
                    has_data = True
                    continue
                
                price_data = prices[symbol]
                current = price_data["price"]
                change_pct = price_data.get("change_pct", 0)
                change = price_data.get("change", 0)
                currency = config.get("currency", "$")
                source = price_data.get("source", "")
                
                change_str = f"{change:+.2f} ({change_pct:+.2f}%)"
                source_tag = f" [{source}]" if source else ""
                
                market_lines.append(f"- **{name}** ({symbol}): {currency}{current:.2f}  {change_str}{source_tag}")
                has_data = True
            
            if has_data:
                lines.extend(market_lines)
                lines.append("")
    else:
        # 旧格式：扁平列表
        lines.append("### 📈 全部\n")
        for name, config in watchlist.items():
            symbol = config["symbol"]
            if symbol not in prices or prices[symbol] is None:
                lines.append(f"- **{name}** ({symbol}): 数据暂不可用")
                continue
            
            price_data = prices[symbol]
            current = price_data["price"]
            change_pct = price_data.get("change_pct", 0)
            change = price_data.get("change", 0)
            currency = config.get("currency", "$")
            source = price_data.get("source", "")
            
            change_str = f"{change:+.2f} ({change_pct:+.2f}%)"
            source_tag = f" [{source}]" if source else ""
            
            lines.append(f"- **{name}** ({symbol}): {currency}{current:.2f}  {change_str}{source_tag}")
        
        lines.append("")
    
    return "\n".join(lines)

# ==================== 条件触达生成 ====================

def generate_alerts(triggered):
    """生成条件触达提醒"""
    if not triggered:
        return "## 🔔 条件触达\n\n今日无触达条件。✅\n"
    
    lines = ["## 🔔 条件触达\n"]
    
    for item in triggered:
        stock = item["stock"]
        symbol = item["symbol"]
        condition = item["condition"]
        current = item["current_price"]
        change_pct = item.get("change_pct", 0)
        
        condition_type = condition["type"]
        target = condition["target"]
        
        if condition_type == "price_above":
            desc = f"价格 ≥ {target}"
        elif condition_type == "price_below":
            desc = f"价格 ≤ {target}"
        elif condition_type == "pct_up":
            desc = f"涨幅 ≥ {target}%"
        elif condition_type == "pct_down":
            desc = f"跌幅 ≥ {target}%"
        else:
            desc = f"{condition_type}: {target}"
        
        lines.append(f"- ⚠️ **{stock}** ({symbol}): {desc}，当前 {current:.2f} ({change_pct:+.2f}%)")
    
    return "\n".join(lines) + "\n"

# ==================== 新闻摘要生成 ====================

def generate_news_summary(news):
    """生成新闻摘要"""
    if not news:
        return "## 📰 相关新闻\n\n今日无相关新闻。\n"
    
    lines = ["## 📰 相关新闻\n"]
    
    for item in news:
        lines.append(f"- [{item['title']}]({item['link']})")
        if item.get('description'):
            lines.append(f"  > {item['description'][:100]}...")
    
    return "\n".join(lines) + "\n"

# ==================== 操作建议生成 ====================

def generate_suggestions(triggered, prices):
    """生成操作建议/警惕事项"""
    lines = ["## 💡 操作建议\n"]
    
    if not triggered:
        lines.append("- 今日市场平稳，保持关注即可。")
    else:
        for item in triggered:
            stock = item["stock"]
            condition = item["condition"]
            current = item["current_price"]
            
            if condition["type"] in ["pct_up", "price_above"]:
                lines.append(f"- **{stock}**: 涨幅较大，可考虑是否止盈部分仓位，或设置移动止损。")
            elif condition["type"] in ["pct_down", "price_below"]:
                lines.append(f"- **{stock}**: 跌幅较大，检查是否触及止损位，注意风险控制。")
    
    lines.append("- 关注今晚美联储表态及明日经济数据发布。")
    
    return "\n".join(lines) + "\n"

# ==================== 主函数 ====================

def main():
    config = load_config()
    state = load_state()
    calendar = load_calendar()
    
    watchlist = config.get("watchlist", {})
    conditions = config.get("conditions", [])
    schedule = config.get("schedule", {})
    news_config = config.get("news", {})
    disabled_sections = schedule.get("disabled_sections", [])
    
    # 检查是否为交易日
    trading_regions = schedule.get("trading_day_regions", ["us", "hk"])
    if not is_trading_day(trading_regions, calendar):
        print("今日非交易日，跳过发送。")
        return
    
    # 获取所有价格（双 API 策略）
    # 支持分组格式和扁平格式
    prices = {}
    
    def collect_symbols(watchlist_dict):
        """递归收集所有 symbol"""
        symbols = []
        for name, config in watchlist_dict.items():
            if isinstance(config, dict) and "symbol" in config:
                # 扁平格式或叶子节点
                symbols.append((name, config["symbol"]))
            elif isinstance(config, dict):
                # 分组格式，递归处理
                symbols.extend(collect_symbols(config))
        return symbols
    
    all_stocks = collect_symbols(watchlist)
    for name, symbol in all_stocks:
        prices[symbol] = get_price_data(symbol)
    
    # 检查条件
    triggered = check_conditions(watchlist, conditions, prices, state)
    
    # 获取新闻
    news = fetch_news(news_config) if "news" not in disabled_sections else []
    
    # 生成报告
    output_lines = ["# 📈 智能盯盘日报\n", f"_生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}_\n"]
    
    if "market" not in disabled_sections:
        output_lines.append(generate_market_summary(watchlist, prices))
        output_lines.append("")
    
    if "alerts" not in disabled_sections:
        output_lines.append(generate_alerts(triggered))
        output_lines.append("")
    
    if "news" not in disabled_sections:
        output_lines.append(generate_news_summary(news))
        output_lines.append("")
    
    if "suggestions" not in disabled_sections:
        output_lines.append(generate_suggestions(triggered, prices))
    
    # 保存状态
    save_state(state)
    
    # 输出
    print("\n".join(output_lines))

if __name__ == "__main__":
    main()
