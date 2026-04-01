#!/usr/bin/env python3
"""
Self-Improvement: Wakeup 报告 - 汇总反思建议，告知用户
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
import os

def get_state_dir():
    """获取 OpenClaw state 目录"""
    return os.environ.get('OPENCLAW_STATE_DIR', 
                          Path.home() / '.openclaw' / 'state')

def get_reflections_file():
    """获取反思记录文件路径"""
    state_dir = get_state_dir()
    return Path(state_dir) / 'reflections.jsonl'

def load_recent_reflections(days=7):
    """加载最近 N 天的反思记录"""
    reflections_file = get_reflections_file()
    if not reflections_file.exists():
        return []
    
    cutoff = datetime.now().astimezone() - timedelta(days=days)
    reflections = []
    
    with open(reflections_file, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                reflection = json.loads(line.strip())
                timestamp = datetime.fromisoformat(reflection['timestamp'])
                if timestamp >= cutoff:
                    reflections.append(reflection)
            except:
                continue
    
    return reflections

def group_by_priority(reflections):
    """按优先级分组"""
    grouped = {'critical': [], 'high': [], 'medium': [], 'low': []}
    for r in reflections:
        priority = r.get('priority', 'low')
        if priority in grouped:
            grouped[priority].append(r)
    return grouped

def group_by_type(reflections):
    """按类型分组"""
    grouped = {'correction': [], 'insight': [], 'knowledge_gap': [], 'best_practice': []}
    for r in reflections:
        r_type = r.get('type', 'insight')
        if r_type in grouped:
            grouped[r_type].append(r)
    return grouped

def generate_report():
    """生成 Wakeup 报告"""
    reflections = load_recent_reflections()
    
    # 过滤掉已处理的
    pending = [r for r in reflections if r.get('status') == 'pending']
    
    if not pending:
        return "✨ 过去 7 天没有需要优化的地方，AI 运行良好！"
    
    by_priority = group_by_priority(pending)
    by_type = group_by_type(pending)
    
    report = ["👧 阿布起床啦～昨晚发生了：\n"]
    report.append("【反思汇总】")
    report.append(f"发现了 {len(pending)} 个改进机会：\n")
    
    # 按类型分组显示
    if by_type['correction']:
        report.append(f"🔧 用户纠正（{len(by_type['correction'])} 条）：")
        for i, r in enumerate(by_type['correction'][:3], 1):
            report.append(f"{i}. [{r.get('priority', 'medium')}] {r['finding']}")
        if len(by_type['correction']) > 3:
            report.append(f"   ... 还有 {len(by_type['correction']) - 3} 条")
        report.append("")
    
    if by_type['insight']:
        report.append(f"💡 新发现（{len(by_type['insight'])} 条）：")
        for i, r in enumerate(by_type['insight'][:3], 1):
            report.append(f"{i}. [{r.get('priority', 'medium')}] {r['finding']}")
        if len(by_type['insight']) > 3:
            report.append(f"   ... 还有 {len(by_type['insight']) - 3} 条")
        report.append("")
    
    if by_type['knowledge_gap']:
        report.append(f"📚 知识盲区（{len(by_type['knowledge_gap'])} 条）：")
        for i, r in enumerate(by_type['knowledge_gap'][:3], 1):
            report.append(f"{i}. [{r.get('priority', 'medium')}] {r['finding']}")
        if len(by_type['knowledge_gap']) > 3:
            report.append(f"   ... 还有 {len(by_type['knowledge_gap']) - 3} 条")
        report.append("")
    
    if by_type['best_practice']:
        report.append(f"⭐ 最佳实践（{len(by_type['best_practice'])} 条）：")
        for i, r in enumerate(by_type['best_practice'][:3], 1):
            report.append(f"{i}. [{r.get('priority', 'medium')}] {r['finding']}")
        if len(by_type['best_practice']) > 3:
            report.append(f"   ... 还有 {len(by_type['best_practice']) - 3} 条")
        report.append("")
    
    # 按优先级汇总
    critical_high = len(by_priority['critical']) + len(by_priority['high'])
    if critical_high > 0:
        report.append("---")
        report.append(f"⚠️  有 {critical_high} 条高优先级建议需要处理！")
        report.append("爸爸说「查看反思」可以查看详情，或者说「生成 PR」自动处理～")
    
    return "\n".join(report)

def main():
    """主函数"""
    report = generate_report()
    print(report)

if __name__ == '__main__':
    main()
