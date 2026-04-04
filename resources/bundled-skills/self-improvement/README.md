# self-improvement Skill

实时反思与持续改进技能，帮助 AI 从错误、纠正和洞察中学习。

## 功能特性

- **自动反思**：检测用户纠正、命令失败、修复请求等场景
- **反思记录**：将学习到的经验写入 `reflections.jsonl` 文件
- **持续改进**：支持反思的提升、应用和追踪

## 环境要求

- `git` — 版本控制
- `python3` — 运行反思脚本

## 安装步骤

### 方式一：从 TraceFlow 配套 Skills 页面复制

1. 访问 TraceFlow 的「TraceFlow 配套 Skills」页面（路径：`/traceflow-skills`）
2. 找到 `self-improvement` skill
3. 点击「复制全部文件」或逐个复制文件
4. 将文件粘贴到你的 OpenClaw skills 目录

### 方式二：从 claw-brains 仓库获取完整实现

本 skill 的完整实现（包括 Python 脚本）位于 [claw-brains](https://github.com/slashhuang/claw-brains) 仓库：

```bash
# 克隆 claw-brains 仓库
git clone https://github.com/slashhuang/claw-brains.git

# 复制 self-improvement skill 到 OpenClaw skills 目录
cp -r claw-brains/skills/self-improvement /path/to/your/openclaw/skills/
```

### 完成安装

1. 确保本机已安装 `git` 和 `python3`
2. 重启 OpenClaw Gateway

## 输出目录

默认输出到：
- `.openclawSelfImprovements/reflections.jsonl`

可通过环境变量覆盖：
- `OPENCLAW_AUDIT_DIR` — 自定义输出目录

## 触发场景

| 场景 | 示例关键词 |
|------|-----------|
| 用户纠正 | "不对"、"错了"、"反思下" |
| 修复请求 | "fix"、"修复" |
| 命令失败 | 命令执行失败时自动触发 |
| 更好的方法 | 发现优化方案时 |

## 反思记录格式

每条反思记录包含：
- `id` — 唯一标识（如 `LRN-20260402-001`）
- `type` — 类型（correction/insight/knowledge_gap/best_practice）
- `dimension` — 维度（ai/user/interaction）
- `finding` — 发现的问题
- `suggestion` — 改进建议
- `impact` — 影响说明
- `priority` — 优先级（critical/high/medium/low）
- `status` — 状态（pending/in_progress/resolved/promoted）

## 与 TraceFlow 集成

TraceFlow 的「反思列表」页面会从 `.openclawSelfImprovements/reflections.jsonl` 读取数据，展示所有反思记录。

访问路径：`/reflections`

## 相关技能

- [agent-audit](../agent-audit/README.md) — 贡献审计技能

## 开源说明

本 skill 的文档和定义打包在 TraceFlow 仓库中，完整实现（Python 脚本）位于 claw-brains 仓库。
两者都是开源项目，遵循相同的开源许可证。
