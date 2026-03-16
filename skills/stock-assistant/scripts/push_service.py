#!/usr/bin/env python3
"""
推送服务模块

功能：
- 飞书消息推送
- 优先级队列管理
- 防限流控制
"""

import asyncio
import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any
from datetime import datetime


class PushService:
    """推送服务"""
    
    def __init__(self, config=None):
        self.config = config or {}
        
        # 优先级队列
        self.urgent_queue = asyncio.PriorityQueue()
        self.warning_queue = asyncio.PriorityQueue()
        self.normal_queue = asyncio.PriorityQueue()
        
        # 防刷屏：记录每个预警的最后发送时间
        # key: (user_id, alert_type, symbol), value: last_send_timestamp
        self.last_alert_time = {}
        
        # 防刷屏间隔（秒）
        self.alert_cooldown = self.config.get('global_settings', {}).get('rate_limit', {}).get('merge_interval_seconds', 300)
        
        # 启动推送处理器（Python 3.6 兼容）
        self.running = True
        loop = asyncio.get_event_loop()
        self.process_task = loop.create_task(self.process_alerts())
    
    async def stop(self):
        """停止推送服务"""
        self.running = False
        if self.process_task:
            self.process_task.cancel()
            try:
                await self.process_task
            except asyncio.CancelledError:
                pass
    
    def _get_alert_key(self, user_id: str, message: str) -> str:
        """生成预警唯一标识（用于防刷屏）"""
        # 从消息中提取预警类型和股票代码
        # 格式如："🚨 紧急预警 - NVDA\n\n触及止损线！..."
        lines = message.split('\n')
        alert_type = lines[0] if lines else 'unknown'
        
        # 提取股票代码
        symbol = 'unknown'
        for line in lines:
            if ' - ' in line:
                symbol = line.split(' - ')[-1].strip()
                break
        
        return f"{user_id}:{alert_type}:{symbol}"
    
    def _should_send(self, user_id: str, message: str) -> bool:
        """检查是否应该发送（防刷屏）"""
        key = self._get_alert_key(user_id, message)
        now = datetime.now().timestamp()
        
        if key in self.last_alert_time:
            elapsed = now - self.last_alert_time[key]
            if elapsed < self.alert_cooldown:
                # 还在冷却期内，不发送
                remaining = int(self.alert_cooldown - elapsed)
                print(f"[防刷屏] 预警 {key} 冷却中，剩余 {remaining} 秒")
                return False
        
        # 更新最后发送时间
        self.last_alert_time[key] = now
        return True
    
    async def send(self, user_id: str, message: str, priority: str = 'normal', skip_cooldown: bool = False):
        """发送消息
        
        Args:
            user_id: 用户 ID
            message: 消息内容
            priority: 优先级 (urgent/critical/normal)
            skip_cooldown: 是否跳过防刷屏检查（用于重要通知）
        """
        # 防刷屏检查
        if not skip_cooldown and not self._should_send(user_id, message):
            return
        
        timestamp = datetime.now().timestamp()
        
        if priority == 'urgent' or priority == 'critical':
            await self.urgent_queue.put((timestamp, user_id, message))
        else:
            await self.normal_queue.put((timestamp, user_id, message))
    
    async def process_alerts(self):
        """处理推送队列"""
        while self.running:
            # 优先处理紧急预警
            try:
                timestamp, user_id, message = self.urgent_queue.get_nowait()
                await self.send_immediate(user_id, message)
                continue
            except asyncio.QueueEmpty:
                pass
            
            # 处理普通预警
            try:
                timestamp, user_id, message = self.warning_queue.get_nowait()
                await self.send_delayed(user_id, message, delay=5)
                continue
            except asyncio.QueueEmpty:
                pass
            
            # 处理普通推送
            try:
                timestamp, user_id, message = self.normal_queue.get_nowait()
                await self.send_delayed(user_id, message, delay=30)
                continue
            except asyncio.QueueEmpty:
                pass
            
            await asyncio.sleep(1)
    
    async def send_immediate(self, user_id: str, message: str):
        """立即推送（紧急预警）"""
        await self._send_feishu(user_id, message)
    
    async def send_delayed(self, user_id: str, message: str, delay: int):
        """延迟推送"""
        await asyncio.sleep(delay)
        await self._send_feishu(user_id, message)
    
    async def _send_feishu(self, user_id: str, message: str):
        """发送飞书消息"""
        # 注意：这里需要使用飞书 API
        # 实际实现需要调用飞书开放平台 API
        # 由于需要 access_token，这里先打印日志
        
        print(f"[飞书推送] 用户：{user_id}")
        print(f"[飞书推送] 消息：{message[:100]}...")
        
        # TODO: 实现飞书 API 调用
        # 参考：https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
        
        try:
            # 这里需要实现实际的飞书 API 调用
            # 需要 access_token 和接收者 ID
            pass
        except Exception as e:
            print(f"[飞书推送] 发送失败：{e}")
