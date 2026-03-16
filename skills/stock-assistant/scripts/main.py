#!/usr/bin/env python3
"""
实时智能炒股助手 - 主程序

功能：
- 实时价格监控（WebSocket）
- 预警推送（飞书）
- 防限流策略

用法：
    python3 main.py [config_file]
    
默认读取 skills/stock-assistant/config/assistant_config.json
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# 优先加载 .env（富途等敏感项可通过环境变量配置）
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# 导入监控模块
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from price_monitor import PriceMonitor
from push_service import PushService
from news_monitor import NewsMonitor
from scheduled_tasks import ScheduledTasks


def get_config_path():
    """获取配置文件路径"""
    if len(sys.argv) > 1:
        return os.path.abspath(os.path.expanduser(sys.argv[1]))
    
    # 默认路径：脚本所在目录的 config/assistant_config.json
    return str(script_dir.parent / "config" / "assistant_config.json")


def load_config():
    """加载配置文件"""
    config_path = get_config_path()
    
    if not os.path.exists(config_path):
        print(f"配置文件不存在：{config_path}")
        print("请复制 config/assistant_config.example.json 到 config/assistant_config.json 并修改")
        sys.exit(1)
    
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


async def main():
    """主函数"""
    print("=" * 60)
    print("实时智能炒股助手 - 启动中...")
    print("=" * 60)
    
    # 加载配置
    config = load_config()
    print(f"配置文件：{get_config_path()}")
    print(f"用户数：{len(config['users'])}")
    
    # 初始化服务
    push_service = PushService(config)
    price_monitor = PriceMonitor(config, push_service)
    news_monitor = NewsMonitor(config, push_service)
    scheduled_tasks = ScheduledTasks(config, push_service)
    
    # 启动监控
    print("\n启动实时监控...")
    print("- 价格监控：已启动")
    print("- 成交量监控：已启动")
    print("- 新闻监控：已启动")
    print("- 定时任务：已启动")
    print("  - 早盘推送：工作日 9:00")
    print("  - 收盘推送：工作日 15:30")
    print("  - 晚间推送：工作日 20:00")
    print("  - 周末复盘：周日 20:00")
    print("按 Ctrl+C 停止")
    print("-" * 60)
    
    try:
        # 并行启动所有监控
        await asyncio.gather(
            price_monitor.start(),
            news_monitor.start(),
            scheduled_tasks.start(),
            return_exceptions=True
        )
    except KeyboardInterrupt:
        print("\n\n停止监控...")
    finally:
        await price_monitor.stop()
        await news_monitor.stop()
        await scheduled_tasks.stop()
        print("已退出")


if __name__ == "__main__":
    # Python 3.6 兼容
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(main())
    finally:
        loop.close()
