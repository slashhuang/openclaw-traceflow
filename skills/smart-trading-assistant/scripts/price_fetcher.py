#!/usr/bin/env python3
"""
股价获取模块 - 双 API 策略（东方财富主用，新浪财经备用）
支持：A 股（.SS/.SZ）、港股（.HK）、美股、加密货币、期货

用法：
    from price_fetcher import fetch_price
    result = fetch_price("NVDA")
    # 返回：{"price": 140.5, "change_pct": 2.3, "change": 3.15, "volume": 12345678}
"""

import json
import re
import ssl
import urllib.request
from datetime import datetime
from typing import Optional, Dict, Any

# ============ 东方财富 API ============
def fetch_from_eastmoney(symbol: str) -> Optional[Dict[str, Any]]:
    """
    东方财富 API（主用）
    支持：A 股、港股、美股、期货、加密货币
    """
    try:
        # 东方财富行情接口
        # 格式：market.symbol
        # A 股：1.600519, 0.000001 (上证指数)
        # 港股：1.00700
        # 美股：125.NVDA
        # 期货：8.GC
        # 加密货币：125.BTCUSD
        
        market_code = _get_eastmoney_market_code(symbol)
        if not market_code:
            return None
        
        url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={market_code}&fields=f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f169,f170"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://quote.eastmoney.com/"
        }
        
        req = urllib.request.Request(url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        if data.get("data"):
            result = data["data"]
            price = result.get("f43")  # 最新价
            if price is not None and price != 0:
                return {
                    "price": float(price) / 100,  # 东方财富价格单位是分，需要除以 100
                    "change_pct": float(result.get("f170", 0)) / 100,  # 涨跌幅 %
                    "change": float(result.get("f49", 0)) / 100,  # 涨跌额
                    "volume": result.get("f47", 0),  # 成交量
                    "source": "eastmoney"
                }
        return None
    except Exception as e:
        print(f"东方财富 API 获取 {symbol} 失败：{e}")
        return None


def _get_eastmoney_market_code(symbol: str) -> Optional[str]:
    """
    将 Yahoo Finance 代码转换为东方财富代码格式
    
    东方财富市场代码说明：
    - 0: 上交所 A 股
    - 1: 深交所 A 股、港股
    - 105: 港股（另一种格式）
    - 128: 美股
    - 8: 期货
    - 125: 加密货币
    """
    symbol = symbol.upper()
    
    # A 股
    if symbol.endswith(".SS"):  # 上交所
        code = symbol.replace(".SS", "")
        return f"1.{code}"
    elif symbol.endswith(".SZ"):  # 深交所
        code = symbol.replace(".SZ", "")
        return f"0.{code}"
    
    # 港股（东方财富格式：105.HK 代码）
    elif symbol.endswith(".HK"):
        code = symbol.replace(".HK", "")
        # 东方财富港股格式：105.00700 或 1.00700
        code = code.zfill(5)  # 补齐 5 位
        return f"105.{code}"
    
    # 美股（东方财富格式：128.代码）
    elif symbol in ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN", "META", "TSLA", "PDD", "BABA", "COIN", "SMCI", "HIMS", "QQQ", "SPY", "GLD", "SLV"]:
        return f"128.{symbol}"
    
    # 期货（东方财富格式：8.代码）
    elif symbol in ["GC=F", "SI=F", "CL=F", "NG=F"]:
        base = symbol.replace("=F", "")
        return f"8.{base}"
    
    # 加密货币（东方财富格式：125.代码 USD）
    elif symbol in ["BTC-USD", "ETH-USD"]:
        base = symbol.replace("-USD", "")
        return f"125.{base}USD"
    
    return None


# ============ 腾讯财经 API（备用） ============
def fetch_from_tencent(symbol: str) -> Optional[Dict[str, Any]]:
    """
    腾讯财经 API（备用）
    支持：A 股、港股、美股
    
    返回格式：v_usNVDA="200~英文名~代码~当前价~昨收~开盘~..."
    """
    try:
        tencent_symbol = _get_tencent_symbol(symbol)
        if not tencent_symbol:
            return None
        
        url = f"https://qt.gtimg.cn/q={tencent_symbol}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://stockapp.finance.qq.com/"
        }
        
        req = urllib.request.Request(url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            content = response.read().decode('gbk')  # 腾讯返回 GBK 编码
        
        # 解析返回：v_usNVDA="200~英文名~NVDA.OQ~182.65~177.82~..."
        match = re.search(r'"([^"]+)"', content)
        if not match:
            return None
        
        parts = match.group(1).split('~')
        
        # 腾讯格式：
        # 0: 状态码，1: 英文名，2: 代码，3: 当前价，4: 昨收，5: 开盘
        # 10: 涨跌额，11: 涨跌幅%，17: 成交量
        
        if len(parts) < 12:
            return None
        
        try:
            current_price = float(parts[3]) if parts[3] else 0
            prev_close = float(parts[4]) if parts[4] else 0
            change = float(parts[10]) if parts[10] else 0
            change_pct = float(parts[11]) if parts[11] else 0
        except (ValueError, IndexError) as e:
            print(f"腾讯解析 {symbol} 数据失败：{e}")
            return None
        
        if current_price == 0:
            return None
        
        return {
            "price": current_price,
            "change_pct": change_pct,
            "change": change,
            "volume": int(float(parts[17])) if len(parts) > 17 and parts[17] else 0,
            "source": "tencent"
        }
    except Exception as e:
        print(f"腾讯财经 API 获取 {symbol} 失败：{e}")
        return None


def _get_tencent_symbol(symbol: str) -> Optional[str]:
    """
    将 Yahoo Finance 代码转换为腾讯代码格式
    
    腾讯代码格式：
    - sh/sz + 代码：A 股
    - hk + 代码：港股
    - us + 代码：美股
    """
    symbol = symbol.upper()
    
    # A 股
    if symbol.endswith(".SS"):
        code = symbol.replace(".SS", "")
        return f"sh{code}"
    elif symbol.endswith(".SZ"):
        code = symbol.replace(".SZ", "")
        return f"sz{code}"
    
    # 港股（腾讯格式：hk + 5 位代码）
    elif symbol.endswith(".HK"):
        code = symbol.replace(".HK", "")
        code = code.zfill(5)  # 补齐 5 位，如 00700
        return f"hk{code}"
    
    # 美股
    elif symbol in ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN", "META", "TSLA", "PDD", "BABA", "COIN", "SMCI", "HIMS", "QQQ", "SPY", "GLD", "SLV"]:
        return f"us{symbol}"
    
    return None


# ============ CoinGecko API（加密货币专用） ============
def fetch_from_coingecko(symbol: str) -> Optional[Dict[str, Any]]:
    """
    CoinGecko API（加密货币专用，免费无需 API key）
    支持：BTC, ETH 等主流加密货币
    """
    try:
        # CoinGecko ID 映射
        crypto_ids = {
            "BTC-USD": "bitcoin",
            "ETH-USD": "ethereum",
            "BNB-USD": "binancecoin",
            "XRP-USD": "ripple",
            "ADA-USD": "cardano",
            "SOL-USD": "solana",
            "DOGE-USD": "dogecoin",
        }
        
        crypto_id = crypto_ids.get(symbol)
        if not crypto_id:
            return None
        
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={crypto_id}&vs_currencies=usd&include_24hr_change=true"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }
        
        req = urllib.request.Request(url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        if crypto_id in data:
            price_data = data[crypto_id]
            price = price_data.get("usd")
            change_pct = price_data.get("usd_24h_change", 0)
            
            if price and price > 0:
                # 计算涨跌额
                prev_close = price / (1 + change_pct / 100) if change_pct else price
                change = price - prev_close
                
                return {
                    "price": float(price),
                    "change_pct": float(change_pct),
                    "change": float(change),
                    "source": "coingecko"
                }
        return None
    except Exception as e:
        print(f"CoinGecko API 获取 {symbol} 失败：{e}")
        return None


# ============ Binance API（加密货币专用） ============
def fetch_from_binance(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Binance API（加密货币专用，免费无需 API key）
    支持：BTC, ETH, BNB 等主流加密货币
    
    使用 data-api.binance.vision 域名（国内可访问）
    """
    try:
        # Binance 交易对映射
        binance_symbols = {
            "BTC-USD": "BTCUSDT",
            "ETH-USD": "ETHUSDT",
            "BNB-USD": "BNBUSDT",
            "XRP-USD": "XRPUSDT",
            "ADA-USD": "ADAUSDT",
            "SOL-USD": "SOLUSDT",
            "DOGE-USD": "DOGEUSDT",
        }
        
        binance_symbol = binance_symbols.get(symbol)
        if not binance_symbol:
            return None
        
        # 获取当前价格
        price_url = f"https://data-api.binance.vision/api/v3/ticker/price?symbol={binance_symbol}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }
        
        req = urllib.request.Request(price_url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        price = float(data.get("price", 0))
        if price <= 0:
            return None
        
        # 获取 24 小时涨跌幅（使用 24hr ticker）
        change_pct = 0
        try:
            ticker_url = f"https://data-api.binance.vision/api/v3/ticker/24hr?symbol={binance_symbol}"
            req = urllib.request.Request(ticker_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                ticker_data = json.loads(response.read().decode('utf-8'))
            
            change_pct = float(ticker_data.get("priceChangePercent", 0))
        except Exception:
            pass  # 无涨跌幅时使用 0
        
        # 计算涨跌额和昨收
        prev_close = price / (1 + change_pct / 100) if change_pct else price
        change = price - prev_close
        
        return {
            "price": price,
            "change_pct": change_pct,
            "change": change,
            "source": "binance"
        }
    except Exception as e:
        print(f"Binance API 获取 {symbol} 失败：{e}")
        return None


# ============ 腾讯期货 API（期货专用） ============
def fetch_from_tencent_futures(symbol: str) -> Optional[Dict[str, Any]]:
    """
    腾讯期货 API（专门用于国际期货）
    支持：黄金 (GC)、白银 (SI)、原油 (CL)、天然气 (NG)
    
    返回格式：v_hf_GC="5218.39,-0.45,5217.00,5217.50,5230.90,5191.30,..."
    格式：当前价，涨跌额，开盘，昨收，最高，最低
    """
    futures_map = {
        "GC=F": "hf_GC",   # 黄金
        "SI=F": "hf_SI",   # 白银
        "CL=F": "hf_CL",   # 原油
        "NG=F": "hf_NG",   # 天然气
    }
    
    tencent_symbol = futures_map.get(symbol)
    if not tencent_symbol:
        return None
    
    try:
        url = f"https://qt.gtimg.cn/q={tencent_symbol}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://stockapp.finance.qq.com/"
        }
        
        req = urllib.request.Request(url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            content = response.read().decode('gbk')  # 期货返回 GBK 编码
        
        # 解析返回：v_hf_GC="5218.39,-0.45,5217.00,5217.50,5230.90,5191.30,..."
        match = re.search(r'"([^"]+)"', content)
        if not match:
            return None
        
        parts = match.group(1).split(',')
        
        # 腾讯期货格式：
        # 0: 当前价，1: 涨跌额，2: 开盘，3: 昨收，4: 最高，5: 最低
        
        if len(parts) < 4:
            return None
        
        try:
            current_price = float(parts[0]) if parts[0] else 0
            change = float(parts[1]) if parts[1] else 0
            prev_close = float(parts[3]) if parts[3] else 0
            
            if prev_close == 0:
                return None
            
            change_pct = (change / prev_close * 100) if prev_close else 0
        except (ValueError, IndexError) as e:
            print(f"腾讯期货解析 {symbol} 数据失败：{e}")
            return None
        
        if current_price == 0:
            return None
        
        return {
            "price": current_price,
            "change_pct": change_pct,
            "change": change,
            "source": "tencent_futures"
        }
    except Exception as e:
        print(f"腾讯期货 API 获取 {symbol} 失败：{e}")
        return None


# ============ 新浪财经 API（第三备用） ============
def fetch_from_sina(symbol: str) -> Optional[Dict[str, Any]]:
    """
    新浪财经 API（第三备用）
    主要用于 A 股
    """
    try:
        sina_symbol = _get_sina_symbol(symbol)
        if not sina_symbol:
            return None
        
        # 只支持 A 股（新浪美股/港股不稳定）
        if not (sina_symbol.startswith("sh") or sina_symbol.startswith("sz")):
            return None
        
        url = f"https://hq.sinajs.cn/list={sina_symbol}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://finance.sina.com.cn/"
        }
        
        req = urllib.request.Request(url, headers=headers)
        ctx = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            content = response.read().decode('gbk')
        
        match = re.search(r'"([^"]+)"', content)
        if not match:
            return None
        
        parts = match.group(1).split(',')
        if len(parts) < 32:
            return None
        
        try:
            current_price = float(parts[3]) if parts[3] else 0
            prev_close = float(parts[2]) if parts[2] else 0
        except (ValueError, IndexError) as e:
            print(f"新浪解析 {symbol} 数据失败：{e}")
            return None
        
        if current_price == 0:
            return None
        
        change = current_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        
        return {
            "price": current_price,
            "change_pct": change_pct,
            "change": change,
            "volume": int(parts[8]) if parts[8] else 0,
            "source": "sina"
        }
    except Exception as e:
        print(f"新浪财经 API 获取 {symbol} 失败：{e}")
        return None


def _get_sina_symbol(symbol: str) -> Optional[str]:
    """
    将 Yahoo Finance 代码转换为新浪代码格式
    
    新浪代码格式说明：
    - sh/sz + 代码：A 股
    - rt_hk + 代码：港股实时
    - gb_ + 小写代码：美股
    - hf_ + 代码：国际期货
    - bint_ + 代码：加密货币（新浪不支持加密货币，返回 None）
    """
    symbol = symbol.upper()
    
    # A 股
    if symbol.endswith(".SS"):  # 上交所
        code = symbol.replace(".SS", "")
        return f"sh{code}"
    elif symbol.endswith(".SZ"):  # 深交所
        code = symbol.replace(".SZ", "")
        return f"sz{code}"
    
    # 港股（新浪格式：rt_hk + 5 位代码）
    elif symbol.endswith(".HK"):
        code = symbol.replace(".HK", "")
        code = code.zfill(5)  # 补齐 5 位
        return f"rt_hk{code}"
    
    # 美股（新浪格式：gb_ + 小写代码）
    elif symbol in ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN", "META", "TSLA", "PDD", "BABA", "COIN", "SMCI", "HIMS", "QQQ", "SPY", "GLD", "SLV"]:
        return f"gb_{symbol.lower()}"
    
    # 期货（新浪格式：hf_ + 代码）
    elif symbol == "GC=F":
        return "hf_GC"
    elif symbol == "SI=F":
        return "hf_SI"
    elif symbol == "CL=F":
        return "hf_CL"
    elif symbol == "NG=F":
        return "hf_NG"
    
    # 加密货币（新浪不支持，返回 None）
    elif symbol in ["BTC-USD", "ETH-USD"]:
        return None
    
    return None


# ============ 主函数 ============
def fetch_price(symbol: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
    """
    获取股价（多 API 策略：加密货币优先用 CoinGecko，其他用东方财富 → 腾讯 → 新浪）
    
    Args:
        symbol: Yahoo Finance 代码（如 NVDA, 0700.HK, BTC-USD）
        use_cache: 是否使用缓存（暂未实现）
    
    Returns:
        {
            "price": 140.5,
            "change_pct": 2.3,
            "change": 3.15,
            "volume": 12345678,
            "source": "eastmoney" | "tencent" | "tencent_futures" | "sina" | "coingecko" | "binance"
        }
        或 None（获取失败）
    """
    # 加密货币优先用 Binance（CoinGecko 国内访问慢）
    if symbol in ["BTC-USD", "ETH-USD", "BNB-USD", "XRP-USD", "ADA-USD", "SOL-USD", "DOGE-USD"]:
        result = fetch_from_binance(symbol)
        if result:
            return result
        # Binance 失败时尝试 CoinGecko
        result = fetch_from_coingecko(symbol)
        if result:
            return result
    
    # 期货优先用腾讯期货接口
    if symbol in ["GC=F", "SI=F", "CL=F", "NG=F"]:
        result = fetch_from_tencent_futures(symbol)
        if result:
            return result
    
    # 1. 先试东方财富（A 股最准）
    result = fetch_from_eastmoney(symbol)
    if result:
        return result
    
    # 2. 东方财富失败，试腾讯财经（美股/港股好）
    result = fetch_from_tencent(symbol)
    if result:
        return result
    
    # 3. 腾讯失败，试新浪财经（A 股备用）
    result = fetch_from_sina(symbol)
    if result:
        return result
    
    # 4. 都失败
    print(f"⚠️  {symbol} 股价获取失败（所有 API 均失败）")
    return None


def fetch_multiple_prices(symbols: list) -> Dict[str, Dict[str, Any]]:
    """
    批量获取多个股价
    
    Args:
        symbols: 代码列表 ["NVDA", "0700.HK", "BTC-USD"]
    
    Returns:
        {
            "NVDA": {"price": 140.5, "change_pct": 2.3, ...},
            "0700.HK": {"price": 500.0, "change_pct": -1.2, ...},
            ...
        }
    """
    results = {}
    for symbol in symbols:
        result = fetch_price(symbol)
        if result:
            results[symbol] = result
    return results


# ============ 测试 ============
if __name__ == "__main__":
    test_symbols = [
        "NVDA",        # 美股
        "0700.HK",     # 港股
        "600519.SS",   # A 股
        "PDD",         # 美股中概
        "BABA",        # 美股中概
    ]
    
    print("测试股价获取（三 API 策略：东方财富 → 腾讯 → 新浪）：\n")
    for symbol in test_symbols:
        result = fetch_price(symbol)
        if result:
            currency = "HK$" if symbol.endswith(".HK") else "$"
            print(f"✅ {symbol}: {currency}{result['price']:.2f} ({result['change_pct']:+.2f}%) [{result['source']}]")
        else:
            print(f"❌ {symbol}: 获取失败")
