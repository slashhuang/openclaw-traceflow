#!/usr/bin/env python3
"""
Self-Improvement: 分析会话质量，生成改进建议
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

def get_state_dir():
    """获取 OpenClaw state 目录"""
    return os.environ.get('OPENCLAW_STATE_DIR', 
                          Path.home() / '.openclaw' / 'state')

def get_reflections_file():
    """获取反思记录文件路径"""
    state_dir = get_state_dir()
    return Path(state_dir) / 'reflections.jsonl'

def analyze_session(session_data):
    """分析单个会话，生成改进建议"""
    suggestions = []
    
    # 分析 1: Token 使用效率
    if 'tokenUsage' in session_data:
        usage = session_data['tokenUsage']
        if usage.get('contextUtilization', 0) > 90:
            suggestions.append({
                'category': 'config',
                'priority': 'high',
                'finding': f"context tokens 使用率 {usage['contextUtilization']}%，经常超限",
                'suggestion': '将 contextLimit 提升 50%',
                'impact': '减少 retry，提升成功率'
            })
    
    # 分析 2: Retry 次数
    if session_data.get('retryCount', 0) > 3:
        suggestions.append({
            'category': 'prompt',
            'priority': 'high',
            'finding': f"会话 retry {session_data['retryCount']} 次",
            'suggestion': '优化 prompt，增加错误处理示例',
            'impact': '降低 retry 次数，提升响应速度'
        })
    
    # 分析 3: 技能调用失败
    if 'toolCalls' in session_data:
        failed_tools = [t for t in session_data['toolCalls'] if t.get('status') == 'failed']
        if len(failed_tools) > 2:
            tool_names = set(t.get('skill', 'unknown') for t in failed_tools)
            suggestions.append({
                'category': 'skill',
                'priority': 'medium',
                'finding': f"技能调用失败 {len(failed_tools)} 次：{', '.join(tool_names)}",
                'suggestion': '检查技能配置或实现',
                'impact': '提升技能调用成功率'
            })
    
    # 分析 4: 会话时长异常
    if session_data.get('duration', 0) > 300000:  # 5 分钟
        suggestions.append({
            'category': 'performance',
            'priority': 'low',
            'finding': f"会话时长 {session_data['duration']/1000:.0f} 秒，超过 5 分钟",
            'suggestion': '考虑优化会话流程或拆分任务',
            'impact': '提升用户体验'
        })
    
    return suggestions

def save_reflection(suggestion, session_id):
    """保存反思记录"""
    reflection = {
        'timestamp': datetime.now().astimezone().isoformat(),
        'sessionId': session_id,
        **suggestion,
        'prReady': suggestion['priority'] in ['high', 'medium']
    }
    
    reflections_file = get_reflections_file()
    reflections_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(reflections_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(reflection, ensure_ascii=False) + '\n')
    
    print(f"[self-improvement] ✅ 保存反思：{suggestion['category']} - {suggestion['priority']}")

def main():
    """主函数：分析最近的会话"""
    print("[self-improvement] 开始分析会话质量...")
    
    # 从 state 目录加载最近的会话
    state_dir = get_state_dir()
    sessions_dir = Path(state_dir) / 'sessions'
    
    if not sessions_dir.exists():
        print(f"[self-improvement] ⚠️  会话目录不存在：{sessions_dir}")
        return
    
    total_suggestions = 0
    
    # 分析每个 agent 的最近会话
    for agent_dir in sessions_dir.iterdir():
        if not agent_dir.is_dir():
            continue
        
        sessions_file = agent_dir / 'sessions.json'
        if not sessions_file.exists():
            continue
        
        try:
            with open(sessions_file, 'r', encoding='utf-8') as f:
                sessions = json.load(f)
            
            # 分析最近的 5 个会话
            for session in sessions.get('recent', [])[:5]:
                suggestions = analyze_session(session)
                for suggestion in suggestions:
                    save_reflection(suggestion, f"{agent_dir.name}/{session.get('sessionId', 'unknown')}")
                    total_suggestions += 1
        except Exception as e:
            print(f"[self-improvement] ⚠️  分析失败 {agent_dir.name}: {e}")
    
    print(f"[self-improvement] ✅ 分析完成，生成 {total_suggestions} 条建议")

if __name__ == '__main__':
    main()
