#!/usr/bin/env python3
"""
富途牛牛行情客户端（本地 OpenD）

依赖：
    pip install futu-api

说明：
- 默认连接本机 OpenD：host=127.0.0.1, port=11113
- 仅作为本地高质量行情源使用，失败时由上层回退到网络 API
"""

from typing import Any, Dict, Optional

try:
    # futu-api 官方 SDK
    from futu import OpenQuoteContext, RET_OK
except ImportError:
    # 未安装 futu-api 时，保持优雅降级
    OpenQuoteContext = None  # type: ignore
    RET_OK = 0  # 占位，实际不会使用


def _symbol_to_futu(symbol: str, market: str) -> Optional[str]:
    """将内部 symbol/market 转成富途代码格式"""
    symbol = symbol.upper()
    market = market.upper()

    # A 股（内部一般是 600519.SS / 000001.SZ）
    if market == "CN":
        if symbol.endswith(".SS"):
            code = symbol.replace(".SS", "")
            return f"SH.{code}"
        if symbol.endswith(".SZ"):
            code = symbol.replace(".SZ", "")
            return f"SZ.{code}"
        # 兜底：长度 6 的纯数字，当作 A 股代码使用
        if len(symbol) == 6 and symbol.isdigit():
            # 简单判断 6 开头当作上证，其余当作深证
            return f"SH.{symbol}" if symbol.startswith("6") else f"SZ.{symbol}"
        return None

    # 港股（内部可能是 00700.HK 或 700.HK）
    if market == "HK":
        if symbol.endswith(".HK"):
            code = symbol.replace(".HK", "")
        else:
            code = symbol
        code = code.zfill(5)
        return f"HK.{code}"

    # 美股（内部直接用 NVDA / AAPL）
    if market == "US":
        return f"US.{symbol}"

    return None


def get_quote_from_futu(
    symbol: str,
    market: str,
    host: str = "127.0.0.1",
    port: int = 11113,
    futu_config: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    通过本地富途 OpenD 获取行情快照。

    连接信息优先从 futu_config 读取，未提供或字段缺失时使用 host/port 默认值。
    若 futu_config 包含 websocket_key，则使用它进行认证。

    返回：
        {
            "price": float,        # 最新价
            "change_pct": float,   # 涨跌幅（百分比，例如 2.3）
            "volume": int,         # 成交量（股）
        }
        或 None（获取失败）
    """
    if futu_config is not None:
        if not futu_config.get("enabled", True):
            return None
        host = futu_config.get("host", host)
        port = int(futu_config.get("port", port))

    if OpenQuoteContext is None:
        # 未安装 futu-api，直接放弃，让上层走备用数据源
        return None

    futu_symbol = _symbol_to_futu(symbol, market)
    if not futu_symbol:
        return None

    quote_ctx = None
    try:
        # 创建连接
        quote_ctx = OpenQuoteContext(host=host, port=port)
        
        # 如果有 websocket_key，先进行认证
        if futu_config and futu_config.get("websocket_key"):
            from futu import TrdAccType
            ws_key = futu_config.get("websocket_key")
            # 使用 set_auth 进行认证（futu-api 9.x+）
            try:
                quote_ctx.set_auth(auth_id=ws_key)
            except (AttributeError, TypeError):
                # 旧版本可能不支持 set_auth，尝试直接连接
                pass

        ret, data = quote_ctx.get_market_snapshot([futu_symbol])
        if ret != RET_OK or data is None or data.empty:
            return None

        row = data.iloc[0]

        last_price = float(row.get("last_price", 0) or 0)
        volume = int(row.get("volume", 0) or 0)

        if last_price <= 0:
            return None

        # 计算涨跌幅：优先用 change_rate，没有则用 (last_price - prev_close_price) / prev_close_price * 100
        change_rate = row.get("change_rate")
        if change_rate is None or (isinstance(change_rate, float) and change_rate != change_rate):  # NaN 检查
            prev_close = row.get("prev_close_price", 0)
            if prev_close and prev_close > 0:
                change_rate = (last_price - prev_close) / prev_close * 100
            else:
                change_rate = 0
        change_rate = float(change_rate)

        return {
            "price": last_price,
            "change_pct": change_rate,
            "volume": volume,
        }
    except Exception as e:
        print(f"富途行情获取失败 {symbol} ({market})：{e}")
        return None
    finally:
        if quote_ctx is not None:
            try:
                quote_ctx.close()
            except Exception:
                pass

