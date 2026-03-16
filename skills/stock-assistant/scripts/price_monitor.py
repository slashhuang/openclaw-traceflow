#!/usr/bin/env python3
"""
价格监控模块

功能：
- 实时价格监控（WebSocket/轮询）
- 预警判断（涨跌、止损、成交量）
- 防限流控制
"""

import asyncio
import json
import os
import time
from datetime import datetime
from typing import Dict, Any, Optional

import aiohttp

from futu_client import get_quote_from_futu


def _resolve_futu_config(futu_config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """合并富途配置：websocket_key 优先从环境变量 FUTU_WEBSOCKET_KEY 读取（可写在 .env）"""
    if futu_config is None:
        return None
    resolved = dict(futu_config)
    env_key = os.environ.get("FUTU_WEBSOCKET_KEY")
    if env_key is not None and env_key.strip():
        resolved["websocket_key"] = env_key.strip()
    return resolved


class PriceMonitor:
    """价格监控器"""
    
    def __init__(self, config: Dict[str, Any], push_service):
        self.config = config
        self.push_service = push_service
        self.session: Optional[aiohttp.ClientSession] = None
        
        # 限流计数器
        self.daily_alert_count: Dict[str, int] = {}
        self.last_merge_time: Dict[str, float] = {}
        self.pending_alerts: Dict[str, list] = {}
        
        # 缓存
        self.price_cache: Dict[str, Dict[str, Any]] = {}
    
    async def start(self):
        """启动监控"""
        self.session = aiohttp.ClientSession()
        
        # 为每个用户的每个持仓启动监控（Python 3.6 兼容）
        loop = asyncio.get_event_loop()
        tasks = []
        for user_id, user_config in self.config['users'].items():
            for symbol, holding in user_config['holdings'].items():
                task = loop.create_task(
                    self.monitor_symbol(user_id, symbol, holding)
                )
                tasks.append(task)
        
        # 等待所有任务
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def stop(self):
        """停止监控"""
        if self.session:
            await self.session.close()
    
    async def monitor_symbol(self, user_id: str, symbol: str, holding: Dict[str, Any]):
        """监控单只股票"""
        market = holding['market']
        
        # 根据市场选择监控频率
        if market == 'CN':
            interval = 3  # A 股 3 秒
        elif market == 'US':
            interval = 5  # 美股 5 秒
        elif market == 'CRYPTO':
            interval = 1  # 加密货币 1 秒
        else:
            interval = 5  # 默认 5 秒
        
        # 初始化限流计数器
        key = f"{user_id}:{symbol}"
        self.daily_alert_count[key] = 0
        self.last_merge_time[key] = time.time()
        self.pending_alerts[key] = []
        
        while True:
            try:
                # 获取价格
                price_data = await self.get_price(symbol, market)
                
                if price_data:
                    # 获取成交量数据
                    volume_data = await self.get_volume(symbol, market)
                    if volume_data:
                        price_data['volume'] = volume_data['volume']
                        price_data['volume_ratio'] = volume_data['volume_ratio']
                    
                    # 检查预警
                    await self.check_alerts(user_id, symbol, holding, price_data)
                    
                    # 更新缓存
                    self.price_cache[key] = {
                        'price': price_data['price'],
                        'time': datetime.now()
                    }
                
                # 等待下次刷新
                await asyncio.sleep(interval)
                
            except Exception as e:
                print(f"监控 {symbol} 出错：{e}")
                await asyncio.sleep(5)  # 出错后等待 5 秒
    
    async def get_price(self, symbol: str, market: str) -> Optional[Dict[str, Any]]:
        """获取价格（优先使用本地富途，其次东方财富 / 新浪）"""
        try:
            # 1. 优先尝试本地富途 OpenD（支持 A 股 / 港股 / 部分美股）
            raw_futu = self.config.get("global_settings", {}).get("futu")
            futu_config = _resolve_futu_config(raw_futu)
            if market in ("CN", "HK", "US") and (futu_config is None or futu_config.get("enabled", True)):
                loop = asyncio.get_event_loop()
                futu_data = await loop.run_in_executor(
                    None,
                    lambda: get_quote_from_futu(symbol, market, futu_config=futu_config),
                )
                if futu_data:
                    return futu_data

            # 2. 主数据源：东方财富
            price_data = await self._get_price_eastmoney(symbol, market)
            if price_data:
                return price_data

            # 3. 备用数据源：新浪财经
            price_data = await self._get_price_sina(symbol, market)
            if price_data:
                return price_data

            return None

        except Exception as e:
            print(f"获取 {symbol} 价格失败：{e}")
            return None
    
    async def _get_price_eastmoney(self, symbol: str, market: str) -> Optional[Dict[str, Any]]:
        """东方财富 API（带 headers）"""
        try:
            if market == 'CN':
                secid = self._get_cn_secid(symbol)
                url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f43,f170"
            elif market == 'US':
                # 美股 secid 格式：105.股票代码
                url = f"https://push2.eastmoney.com/api/qt/stock/get?secid=105.{symbol}&fields=f43,f170"
            else:
                return None
            
            # 添加 headers 避免被识别为爬虫
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://quote.eastmoney.com/'
            }
            
            async with self.session.get(url, headers=headers, timeout=10) as response:
                content = await response.text()
                
                # 检查是否返回 HTML（限流或错误）
                if content.strip().startswith('<!DOCTYPE') or content.strip().startswith('<html'):
                    print(f"东方财富返回 HTML（可能限流）：{symbol}")
                    return None
                
                # 尝试解析 JSON
                try:
                    data = json.loads(content)
                except json.JSONDecodeError:
                    print(f"东方财富返回非 JSON：{symbol} - {content[:100]}")
                    return None
                
                if data.get('data'):
                    result = data['data']
                    price = result.get('f43')
                    change_pct = result.get('f170')
                    
                    if price:
                        # A 股单位是分（除以 100），美股单位是千分之一美元（除以 1000）
                        if market == 'CN':
                            price_value = float(price) / 100
                        else:  # US
                            price_value = float(price) / 1000
                        
                        return {
                            'price': price_value,
                            'change_pct': float(change_pct) / 100 if change_pct else 0
                        }
                
                return None
                
        except Exception as e:
            print(f"东方财富 API 失败 {symbol}：{e}")
            return None
    
    async def _get_price_sina(self, symbol: str, market: str) -> Optional[Dict[str, Any]]:
        """新浪财经 API（备用）"""
        try:
            if market == 'US':
                # 美股：gb_ + 小写代码
                sina_symbol = f"gb_{symbol.lower()}"
                url = f"https://hq.sinajs.cn/list={sina_symbol}"
            elif market == 'CN':
                # A 股
                if symbol.endswith('.SS'):
                    code = symbol.replace('.SS', '')
                    sina_symbol = f"sh{code}"
                elif symbol.endswith('.SZ'):
                    code = symbol.replace('.SZ', '')
                    sina_symbol = f"sz{code}"
                else:
                    return None
                url = f"https://hq.sinajs.cn/list={sina_symbol}"
            else:
                return None
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.sina.com.cn/'
            }
            
            async with self.session.get(url, headers=headers, timeout=10) as response:
                content = await response.text()
                
                # 解析新浪格式：var hq_str_sh600519="名称，当前价，昨收，..."
                if '=' not in content:
                    return None
                
                parts = content.split('=')[1].strip().strip('"').split(',')
                if len(parts) < 3:
                    return None
                
                current_price = float(parts[2]) if parts[2] else 0
                prev_close = float(parts[1]) if parts[1] else 0
                
                if current_price > 0:
                    change_pct = (current_price - prev_close) / prev_close * 100
                    return {
                        'price': current_price,
                        'change_pct': change_pct
                    }
                
                return None
                
        except Exception as e:
            print(f"新浪财经 API 失败 {symbol}：{e}")
            return None
    
    def _get_cn_secid(self, symbol: str) -> str:
        """获取 A 股市场代码（处理 ETF 名称）"""
        if symbol.endswith('.SS'):
            code = symbol.replace('.SS', '')
            return f"1.{code}"
        elif symbol.endswith('.SZ'):
            code = symbol.replace('.SZ', '')
            return f"0.{code}"
        else:
            # ETF 名称需要特殊处理（如"沪深 300ETF"）
            # 简化处理：返回 None，使用备用数据源
            return None
    
    async def get_volume(self, symbol: str, market: str) -> Optional[Dict[str, Any]]:
        """获取成交量数据（含 5 日均量）"""
        try:
            if market == 'CN':
                secid = self._get_cn_secid(symbol)
                # 东方财富 API 获取成交量和 5 日均量
                url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f47,f170"
            elif market == 'US':
                # 美股成交量 secid 格式：105.股票代码
                url = f"https://push2.eastmoney.com/api/qt/stock/get?secid=105.{symbol}&fields=f47,f170"
            else:
                return None
            
            async with self.session.get(url, timeout=10) as response:
                data = await response.json()
                
                if data.get('data'):
                    result = data['data']
                    volume = result.get('f47', 0)  # 成交量（手）
                    
                    # 计算量比（需要 5 日均量，这里简化处理）
                    # 实际应该从历史数据计算
                    avg_volume_5d = volume * 0.8  # 简化估算
                    volume_ratio = volume / avg_volume_5d if avg_volume_5d else 1
                    
                    return {
                        'volume': volume * 100,  # 手→股
                        'volume_ratio': volume_ratio
                    }
                
                return None
                
        except Exception as e:
            print(f"获取 {symbol} 成交量失败：{e}")
            return None
    
    async def check_alerts(self, user_id: str, symbol: str, holding: Dict[str, Any], price_data: Dict[str, Any]):
        """检查预警（价格 + 成交量）"""
        current_price = price_data['price']
        change_pct = price_data['change_pct']
        cost = holding['cost']
        
        # 计算持仓盈亏
        profit_pct = (current_price - cost) / cost * 100
        
        # 获取用户配置
        user_config = self.config['users'][user_id]
        alerts_config = user_config.get('alerts', {})
        
        # 检查止损（最高优先级）
        if alerts_config.get('stop_loss', {}).get('enabled', True):
            stop_loss_pct = alerts_config.get('stop_loss', {}).get('pct', 7)
            if profit_pct <= -stop_loss_pct:
                await self.send_urgent_alert(
                    user_id=user_id,
                    symbol=symbol,
                    type='stop_loss',
                    message=f"触及止损线！当前{profit_pct:.1f}%"
                )
                return  # 止损后不再检查其他预警
        
        # 检查成交量预警（Phase 2 新增）
        volume_ratio = price_data.get('volume_ratio', 1)
        volume_warning = alerts_config.get('volume_ratio', {}).get('warning', 2)
        volume_critical = alerts_config.get('volume_ratio', {}).get('critical', 5)
        
        if volume_ratio >= volume_critical:
            await self.send_volume_alert(
                user_id=user_id,
                symbol=symbol,
                volume_ratio=volume_ratio,
                volume=price_data.get('volume', 0),
                profit_pct=profit_pct,
                level='critical'
            )
        elif volume_ratio >= volume_warning:
            await self.send_volume_alert(
                user_id=user_id,
                symbol=symbol,
                volume_ratio=volume_ratio,
                volume=price_data.get('volume', 0),
                profit_pct=profit_pct,
                level='warning'
            )
        
        # 检查涨跌预警
        warning_pct = alerts_config.get('price_change_pct', {}).get('warning', 3)
        critical_pct = alerts_config.get('price_change_pct', {}).get('critical', 5)
        
        if abs(change_pct) >= critical_pct:
            await self.send_critical_alert(
                user_id=user_id,
                symbol=symbol,
                change_pct=change_pct,
                profit_pct=profit_pct
            )
        elif abs(change_pct) >= warning_pct:
            await self.send_warning_alert(
                user_id=user_id,
                symbol=symbol,
                change_pct=change_pct,
                profit_pct=profit_pct
            )
    
    async def send_urgent_alert(self, user_id: str, symbol: str, type: str, message: str):
        """发送紧急预警（立即推送）"""
        user_config = self.config['users'][user_id]
        feishu_user_id = user_config['feishu_user_id']
        
        alert_message = f"""🚨 紧急预警 - {symbol}

{message}

持仓信息：
- 成本价：${user_config['holdings'][symbol]['cost']}
- 当前价：${self.price_cache.get(f'{user_id}:{symbol}', {}).get('price', 0):.2f}

纪律：严格执行止损，不抱侥幸心理"""
        
        await self.push_service.send(feishu_user_id, alert_message, priority='urgent')
    
    async def send_critical_alert(self, user_id: str, symbol: str, change_pct: float, profit_pct: float):
        """发送紧急预警（涨跌±5%）"""
        if not await self.check_rate_limit(user_id, symbol):
            return
        
        user_config = self.config['users'][user_id]
        feishu_user_id = user_config['feishu_user_id']
        holding = user_config['holdings'][symbol]
        
        emoji = "🔥" if change_pct > 0 else "❄️"
        
        alert_message = f"""⚠️ {symbol} 价格异动提醒 {emoji}

当前价：${holding.get('target_price', 0):.2f}
涨跌幅：{change_pct:+.1f}%
持仓盈亏：{profit_pct:+.1f}%

建议：
- 已持有：继续持有，目标价${holding.get('target_price', 0):.2f}
- 未持有：观望，等待回调

止损价：${holding.get('stop_loss', 0):.2f}（-{holding.get('stop_loss', 0)/holding['cost']*100 - 100:.0f}%）"""
        
        await self.push_service.send(feishu_user_id, alert_message, priority='critical')
        self.increment_alert_count(user_id, symbol)
    
    async def send_warning_alert(self, user_id: str, symbol: str, change_pct: float, profit_pct: float):
        """发送预警（涨跌±3%，合并推送）"""
        key = f"{user_id}:{symbol}"
        
        # 添加到待推送队列
        self.pending_alerts[key].append({
            'symbol': symbol,
            'change_pct': change_pct,
            'profit_pct': profit_pct,
            'time': datetime.now()
        })
        
        # 检查是否需要合并推送
        if time.time() - self.last_merge_time[key] > 300:  # 5 分钟
            await self.send_merged_alerts(user_id, key)
    
    async def send_volume_alert(self, user_id: str, symbol: str, volume_ratio: float, volume: int, profit_pct: float, level: str):
        """发送成交量预警（Phase 2 新增）"""
        if not await self.check_rate_limit(user_id, symbol):
            return
        
        user_config = self.config['users'][user_id]
        feishu_user_id = user_config['feishu_user_id']
        holding = user_config['holdings'][symbol]
        
        emoji = "🔥" if volume_ratio > 1 else "❄️"
        level_emoji = "🚨" if level == 'critical' else "⚠️"
        
        alert_message = f"""{level_emoji} {symbol} 成交量异常 {emoji}

量比：{volume_ratio:.1f} 倍
成交量：{volume/10000:.0f} 万手
持仓盈亏：{profit_pct:+.1f}%

解读：
- 量比>2：成交量放大，可能有重大消息
- 量比>5：成交量异常，密切关注

建议：
- 已持有：继续持有，观察方向
- 未持有：等待方向明确

当前价：${holding.get('target_price', 0):.2f}"""
        
        await self.push_service.send(feishu_user_id, alert_message, priority='critical' if level == 'critical' else 'normal')
        self.increment_alert_count(user_id, symbol)
    
    async def send_merged_alerts(self, user_id: str, key: str):
        """发送合并推送"""
        if not self.pending_alerts[key]:
            return
        
        user_config = self.config['users'][user_id]
        feishu_user_id = user_config['feishu_user_id']
        
        # 汇总所有预警
        summary = []
        for alert in self.pending_alerts[key]:
            emoji = "🔥" if alert['change_pct'] > 0 else "❄️"
            summary.append(f"- {alert['symbol']}：{alert['change_pct']:+.1f}% {emoji}")
        
        alert_message = f"""📊 持仓股异动汇总

{chr(10).join(summary)}

综合：建议继续持有，关注趋势"""
        
        await self.push_service.send(feishu_user_id, alert_message, priority='normal')
        
        # 清空队列
        self.pending_alerts[key] = []
        self.last_merge_time[key] = time.time()
    
    async def check_rate_limit(self, user_id: str, symbol: str) -> bool:
        """检查限流"""
        key = f"{user_id}:{symbol}"
        
        # 检查每日推送上限
        if self.daily_alert_count.get(key, 0) >= 10:
            return False
        
        # 检查静默时段
        current_time = datetime.now().time()
        silent_start = datetime.strptime("23:00", "%H:%M").time()
        silent_end = datetime.strptime("07:00", "%H:%M").time()
        
        if silent_start <= current_time or current_time <= silent_end:
            # 静默时段只允许紧急预警
            return False
        
        return True
    
    def increment_alert_count(self, user_id: str, symbol: str):
        """增加推送计数"""
        key = f"{user_id}:{symbol}"
        self.daily_alert_count[key] = self.daily_alert_count.get(key, 0) + 1
