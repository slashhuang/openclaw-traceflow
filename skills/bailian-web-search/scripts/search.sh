#!/bin/bash

# Bailian WebSearch - Simple Wrapper
# Usage: ./search.sh <query> [count]
# Example: ./search.sh "上海天气" 5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if DASHSCOPE_API_KEY is set
if [ -z "$DASHSCOPE_API_KEY" ]; then
  echo "Error: DASHSCOPE_API_KEY environment variable is not set"
  exit 1
fi

QUERY="${1:-上海天气}"
COUNT="${2:-5}"

# Validate count is a number
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "Error: count must be a number"
  echo "Usage: $0 <query> [count]"
  exit 1
fi

# MCP endpoint
MCP_URL="https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp"

# Send MCP request and extract search results
send_request() {
  local req_json="$1"
  curl -s --connect-timeout 60 -X POST "$MCP_URL" \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$req_json"
}

# Initialize
INIT_REQ='{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "search-client", "version": "1.0.0"}
  }
}'

send_request "$INIT_REQ" > /dev/null

# Send initialized notification
curl -s -o /dev/null -X POST "$MCP_URL" \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized"}'

# Call web search
TOOL_REQ=$(jq -n \
  --arg query "$QUERY" \
  --argjson count "$COUNT" \
  '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "bailian_web_search",
      "arguments": {
        "query": $query,
        "count": $count
      }
    }
  }')

RESPONSE=$(send_request "$TOOL_REQ")

# Extract and format search results
echo "$RESPONSE" | jq -r '
  .result.content[0].text |
  fromjson |
  .pages[] |
  "### " + .title + "\n\n" + .snippet + "\n\n🔗 " + .url + "\n"
' 2>/dev/null

if [ $? -ne 0 ]; then
  echo "搜索失败，请检查 API Key 或网络连接"
  exit 1
fi
