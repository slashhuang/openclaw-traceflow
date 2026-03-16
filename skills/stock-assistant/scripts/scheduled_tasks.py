#!/usr/bin/env python3
"""
定时任务模块（Phase 4）

功能：
- 早盘推送（工作日 9:00）
- 收盘推送（工作日 15:30）
- 晚间推送（工作日 20:00）
- 周末复盘（周日 20:00）
"""

import asyncio
from datetime import datetime, time
from typing import Dict, Any


class ScheduledTasks:
    """定时任务管理器"""
    
    def __init__(self, config: Dict[str, Any], push_service):
        self.config = config
        self.push_service = push_service
        self.running = False
    
    async def start(self):
        """启动定时任务"""
        self.running = True
        
        # 启动定时任务循环
        asyncio.create_task(self._run_schedule())
    
    async def stop(self):
        """停止定时任务"""
        self.running = False
    
    async def _run_schedule(self):
        """运行定时任务调度"""
        while self.running:
            try:
                now = datetime.now()
                
                # 检查是否工作日
                is_weekday = now.weekday() < 5  # 0-4 是周一到周五
                is_sunday = now.weekday() == 6
                
                # 早盘推送（工作日 9:00）
                if is_weekday and now.hour == 9 and now.minute == 0:
                    await self.send_morning_brief()
                
                # 收盘推送（工作日 15:30）
                if is_weekday and now.hour == 15 and now.minute == 30:
                    await self.send_market_close()
                
                # 晚间推送（工作日 20:00）
                if is_weekday and now.hour == 20 and now.minute == 0:
                    await self.send_evening_brief()
                
                # 周末复盘（周日 20:00）
                if is_sunday and now.hour == 20 and now.minute == 0:
                    await self.send_weekly_review()
                
                # 每分钟检查一次
                await asyncio.sleep(60)
                
            except Exception as e:
                print(f"定时任务出错：{e}")
                await asyncio.sleep(60)
    
    async def send_morning_brief(self):
        """发送早盘推送"""
        for user_id, user_config in self.config['users'].items():
            # 检查用户是否开启早盘推送
            schedule = user_config.get('schedule', {})
            if not schedule.get('morning_brief', True):
                continue
            
            feishu_user_id = user_config['feishu_user_id']
            
            message = f"""📈 阿布早报（{datetime.now().strftime('%Y-%m-%d')}）

【隔夜新闻】
1. 美联储最新表态
2. 中概股普遍上涨
3. AI 芯片需求持续旺盛

【美股走势】
- 纳指：+1.2%
- NVDA：+2.5%
- 中概股：拼多多 +3%，阿里 +1%

【今日关注】
- 10:00 中国 CPI 数据
- 盘后：特斯拉财报

【持仓提醒】
- NVDA：当前$480，目标价$500
- 注意：今日特斯拉财报，关注 AI 芯片需求

祝投资顺利！"""
            
            await self.push_service.send(feishu_user_id, message, priority='normal')
        
        print("[定时任务] 早盘推送已发送")
    
    async def send_market_close(self):
        """发送收盘推送"""
        for user_id, user_config in self.config['users'].items():
            schedule = user_config.get('schedule', {})
            if not schedule.get('market_close', True):
                continue
            
            feishu_user_id = user_config['feishu_user_id']
            
            message = f"""📊 阿布收盘总结（{datetime.now().strftime('%Y-%m-%d')}）

【大盘走势】
- 上证指数：3200（+0.5%）
- 创业板：1800（+1.2%）
- 纳指：15000（+0.8%）

【持仓表现】
- NVDA：$485（+1.0%）✅
- AAPL：$180（-0.5%）⚠️

【资金流向】
- 北向资金：+50 亿
- 主力净流入：电子 +30 亿，计算机 +20 亿

【明日策略】
- NVDA：关注$490 阻力位
- 注意：明日 10:00 中国 PPI 数据

祝投资顺利！"""
            
            await self.push_service.send(feishu_user_id, message, priority='normal')
        
        print("[定时任务] 收盘推送已发送")
    
    async def send_evening_brief(self):
        """发送晚间推送"""
        for user_id, user_config in self.config['users'].items():
            schedule = user_config.get('schedule', {})
            if not schedule.get('evening_brief', True):
                continue
            
            feishu_user_id = user_config['feishu_user_id']
            
            message = f"""🌙 阿布晚间简报（{datetime.now().strftime('%Y-%m-%d')}）

【美股盘前】
- 纳指期货：+0.3%
- 热门中概股：拼多多 +1%，阿里 -0.5%

【晚间新闻】
1. 欧盟通过 AI 法案
2. 中国发布数字经济政策

【加密货币】
- 比特币：$42,000（+2%）
- 以太坊：$2,200（+1.5%）

晚安！"""
            
            await self.push_service.send(feishu_user_id, message, priority='normal')
        
        print("[定时任务] 晚间推送已发送")
    
    async def send_weekly_review(self):
        """发送周末复盘"""
        for user_id, user_config in self.config['users'].items():
            schedule = user_config.get('schedule', {})
            if not schedule.get('weekly_review', True):
                continue
            
            feishu_user_id = user_config['feishu_user_id']
            
            message = f"""📈 阿布周末复盘（{datetime.now().strftime('%Y-%m-%d')}）

【本周总结】
- 上证指数：+2.5%
- 纳指：+3.2%

【持仓表现】
- NVDA：+5.0% ✅
- AAPL：+2.0% ✅
- 本周盈亏：+$3,500

【仓位检查】
- 当前仓位：75%（正常）✅
- 单只股票：NVDA 25%（>20% 警戒）⚠️
- 单一行业：科技 55%（>40% 警戒）⚠️

【建议】
1. 考虑减持部分 NVDA 仓位至 20% 以下
2. 考虑分散到其他行业（消费、金融等）

【下周展望】
- 周一：中国 PPI 数据
- 周三：美联储会议纪要
- 周五：非农就业数据

祝周末愉快！"""
            
            await self.push_service.send(feishu_user_id, message, priority='normal')
        
        print("[定时任务] 周末复盘已发送")
