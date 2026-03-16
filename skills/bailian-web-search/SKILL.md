---
name: bailian-web-search
description: 使用阿里云百炼 API 进行网页搜索。用于查询实时信息、新闻、最新事件等需要联网搜索的问题。
homepage: https://bailian.console.aliyun.com/cn-beijing?tab=app#/mcp-market/detail/WebSearch
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
        "requires": { "bins": ["bash", "curl", "jq"], "env": ["DASHSCOPE_API_KEY"] },
        "primaryEnv": "DASHSCOPE_API_KEY",
      },
  }
---

# Bailian Web Search — 阿里百炼搜索

使用阿里云百炼 API 进行网页搜索。**当用户问题涉及实时信息、新闻、最新事件、或你不知道答案需要查资料时**，调用此技能。

## 何时使用

**必须调用搜索的情况**：
- 用户询问实时信息（天气、股价、新闻、赛事结果等）
- 用户询问最新事件（2024 年以后的事）
- 用户明确说"查一下"、"搜索"、"看看网上怎么说"
- 你不知道答案，需要联网查询

**不需要搜索的情况**：
- 常识性问题、历史知识
- 编程、数学等静态知识
- 用户只是闲聊

## 调用方法

```bash
{baseDir}/scripts/search.sh "搜索关键词" [结果数量]
```

**参数**：
- `搜索关键词`（必填）：用用户的核心问题，不要带语气词
- `结果数量`（可选）：返回几条结果，默认 5 条，最多 20 条

## 示例

**用户问**：上海今天天气怎么样？
**调用**：`{baseDir}/scripts/search.sh "上海天气 2026 年 3 月" 5`

**用户问**：最近 AI 有什么新进展？
**调用**：`{baseDir}/scripts/search.sh "AI 最新进展 2026" 10`

**用户问**：帮我查一下今天的美股收盘价
**调用**：`{baseDir}/scripts/search.sh "美股收盘价 2026 年 3 月 15 日" 5`

## 输出格式

搜索结果返回 Markdown 格式：

```markdown
### 标题 1

摘要内容...

🔗 https://example.com/page1

### 标题 2

摘要内容...

🔗 https://example.com/page2
```

## 注意事项

1. 搜索关键词要简洁，去掉"请问"、"帮我查"等语气词
2. 如果搜索失败，检查 `DASHSCOPE_API_KEY` 环境变量
3. 搜索结果可能有广告，优先选择权威来源
