#!/usr/bin/env python3
"""
新闻公告监控模块（Phase 3）

功能：
- 监控交易所公告
- 监控财经新闻 RSS
- 关键词过滤
- 重大消息立即推送
"""

import asyncio
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, Any, List, Optional


class NewsMonitor:
    """新闻公告监控器"""
    
    def __init__(self, config: Dict[str, Any], push_service):
        self.config = config
        self.push_service = push_service
        self.session = None
        self.seen_news = set()  # 已推送新闻去重
        
        # 监控关键词
        keywords = config.get('global_settings', {}).get('news_monitor', {}).get(
            'keywords',
            ["AI", "芯片", "美联储", "通胀", "利率", "财报"]
        )
        self.keywords = [kw.lower() for kw in keywords]
    
    async def start(self):
        """启动新闻监控"""
        import aiohttp
        self.session = aiohttp.ClientSession()
        
        # 启动监控任务
        await asyncio.gather(
            self.monitor_announcements(),  # 交易所公告
            self.monitor_financial_news(),  # 财经新闻
            return_exceptions=True
        )
    
    async def stop(self):
        """停止监控"""
        if self.session:
            await self.session.close()
    
    async def monitor_announcements(self):
        """监控交易所公告（每 60 秒）"""
        check_interval = self.config.get('global_settings', {}).get('news_monitor', {}).get(
            'check_interval_seconds', 60
        )
        
        while True:
            try:
                # 监控持仓股的公告
                for user_id, user_config in self.config['users'].items():
                    for symbol in user_config.get('watchlist', []):
                        await self.check_announcements(user_id, symbol)
                
                await asyncio.sleep(check_interval)
                
            except Exception as e:
                print(f"公告监控出错：{e}")
                await asyncio.sleep(60)
    
    async def monitor_financial_news(self):
        """监控财经新闻（每 60 秒）"""
        check_interval = self.config.get('global_settings', {}).get('news_monitor', {}).get(
            'check_interval_seconds', 60
        )
        
        # 财经新闻 RSS 源
        rss_urls = [
            "https://feeds.reuters.com/reuters/businessNews",
            "https://feeds.bloomberg.com/markets/news.rss",
            "http://www.cctv.com/program/xwlb/rss.xml",  # 央视新闻
        ]
        
        while True:
            try:
                for rss_url in rss_urls:
                    await self.fetch_rss_news(rss_url)
                
                await asyncio.sleep(check_interval)
                
            except Exception as e:
                print(f"新闻监控出错：{e}")
                await asyncio.sleep(60)
    
    async def check_announcements(self, user_id: str, symbol: str):
        """检查个股公告"""
        try:
            # 东方财富公告 API
            if symbol.endswith('.SS') or symbol.endswith('.SZ'):
                # A 股
                secid = self._get_secid(symbol)
                url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f0"
            else:
                # 美股/港股暂不监控公告
                return
            
            async with self.session.get(url, timeout=10) as response:
                # TODO: 实际应该调用公告 API
                # 这里简化处理
                pass
                
        except Exception as e:
            print(f"检查 {symbol} 公告失败：{e}")
    
    async def fetch_rss_news(self, rss_url: str):
        """获取 RSS 新闻"""
        try:
            async with self.session.get(rss_url, timeout=10) as response:
                xml_content = await response.text()
            
            # 解析 RSS
            root = ET.fromstring(xml_content)
            items = root.findall('.//item')
            
            for item in items[:10]:  # 只检查最新 10 条
                title_elem = item.find('title')
                link_elem = item.find('link')
                desc_elem = item.find('description')
                
                if title_elem is not None and link_elem is not None:
                    title = title_elem.text or ""
                    link = link_elem.text or ""
                    desc = desc_elem.text if desc_elem is not None else ""
                    
                    # 关键词过滤
                    if self._match_keywords(title + " " + desc):
                        # 去重
                        news_id = f"{link}"
                        if news_id not in self.seen_news:
                            self.seen_news.add(news_id)
                            await self.push_news(title, link, desc)
            
        except Exception as e:
            print(f"获取 RSS {rss_url} 失败：{e}")
    
    def _match_keywords(self, text: str) -> bool:
        """关键词匹配"""
        text_lower = text.lower()
        return any(kw in text_lower for kw in self.keywords)
    
    def _get_secid(self, symbol: str) -> str:
        """获取证券市场代码"""
        if symbol.endswith('.SS'):
            code = symbol.replace('.SS', '')
            return f"1.{code}"
        elif symbol.endswith('.SZ'):
            code = symbol.replace('.SZ', '')
            return f"0.{code}"
        else:
            return f"1.{symbol}"
    
    async def push_news(self, title: str, link: str, desc: str):
        """推送新闻"""
        # 获取所有用户
        for user_id, user_config in self.config['users'].items():
            # 检查用户是否开启新闻推送
            schedule = user_config.get('schedule', {})
            if not schedule.get('news_alert', True):
                continue
            
            feishu_user_id = user_config['feishu_user_id']
            
            message = f"""📰 重大新闻提醒

{title}

摘要：{desc[:100]}...

链接：{link}

建议：关注相关持仓股影响"""
            
            await self.push_service.send(feishu_user_id, message, priority='critical')
