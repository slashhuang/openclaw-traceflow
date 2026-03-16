# OpenClaw 核心源码笔记

> 本文档记录 OpenClaw 核心机制，修改前请先查阅对应源码。

---

## 一、源码位置

| 环境 | 路径 |
|------|------|
| macOS 源码 | `/Users/huangxiaogang/claw-sources/openclaw` |
| macOS 全局 | `/Users/huangxiaogang/Library/pnpm/global/5/node_modules/openclaw` |
| Linux 全局 | `pnpm root -g` 或 `which openclaw` 查看 |

**Linux 查看全局安装路径**:
```bash
# 方法 1: 查看 pnpm 全局根目录
pnpm root -g

# 方法 2: 查看 openclaw 可执行文件位置
which openclaw

# 方法 3: 直接查找
find ~ -name "openclaw" -type d 2>/dev/null | head -5
```

---

## 二、核心模块

### 2.1 工具系统 (`src/agents/tools/`)

| 文件 | 功能 | 关键点 |
|------|------|--------|
| `web-search.ts` | 内置网页搜索 | 支持 Brave/Gemini/Grok/Kimi/Perplexity |
| `web-fetch.ts` | HTTP 抓取 | Readability + Firecrawl  fallback |
| `browser/` | 浏览器自动化 | Puppeteer/Playwright |
| `fs/` | 文件系统 | read/write/edit/apply_patch |
| `exec/` | 命令执行 | sandbox/gateway/node 三种模式 |

### 2.2 内置 web_search 详解

**源码**: `src/agents/tools/web-search.ts`

**支持的提供商**:
```typescript
const SEARCH_PROVIDERS = ["brave", "gemini", "grok", "kimi", "perplexity"] as const;
```

**自动检测顺序**（字母序）:
1. Brave → `BRAVE_API_KEY`
2. Gemini → `GEMINI_API_KEY`
3. Grok → `XAI_API_KEY`
4. Kimi → `KIMI_API_KEY` / `MOONSHOT_API_KEY`
5. Perplexity → `PERPLEXITY_API_KEY` / `OPENROUTER_API_KEY`

**配置路径**: `tools.web.search`

**禁用方式**:
```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": false
      }
    }
  }
}
```

**文档**: `docs/tools/web.md`

### 2.3 配置系统 (`src/config/`)

| 文件 | 用途 |
|------|------|
| `types.tools.ts` | 工具配置类型定义（ToolsConfig） |
| `schema.help.ts` | 配置字段说明 |
| `config.ts` | 配置加载与验证 |

**关键配置**:
- `commands.nativeSkills` — 原生技能命令注册（`"auto"` / `true` / `false`）
- `skills.load.extraDirs` — 外部 Skill 目录注入
- `tools.web.search` — 内置搜索配置
- `tools.elevated` — 提权执行配置

### 2.4 Gateway (`src/gateway/`)

| 子模块 | 职责 |
|--------|------|
| `server.ts` | HTTP 服务器 |
| `reload.ts` | 热重载机制 |
| `security/` | 安全审计 |

### 2.5 Agent 核心 (`src/agents/`)

| 文件 | 用途 |
|------|------|
| `openclaw-tools.ts` | 工具注册与调度 |
| `tool-catalog.ts` | 工具目录 |
| `system-prompt.ts` | System Prompt 生成 |

### 2.6 Secrets (`src/secrets/`)

| 文件 | 用途 |
|------|------|
| `runtime.ts` | Secret 运行时解析 |
| `runtime-web-tools.ts` | Web 工具密钥管理 |
| `target-registry.ts` | 密钥目标注册 |

---

## 三、常用命令

```bash
# 查看 OpenClaw 版本
openclaw --version

# 配置向导
openclaw configure

# 配置检查
openclaw doctor

# 查看配置（脱敏）
openclaw config show
```

---

## 四、修改流程

1. **定位模块** — 根据功能找到对应源码文件
2. **阅读源码** — 理解实现逻辑
3. **查阅测试** — 看 `*.test.ts` 了解预期行为
4. **修改验证** — 修改后运行相关测试

---

## 五、相关文档

- [OpenClaw 官方文档](https://github.com/openclaw/openclaw/tree/main/docs)
- [Web 工具](/Users/huangxiaogang/claw-sources/openclaw/docs/tools/web.md)
- [配置参考](/Users/huangxiaogang/claw-sources/openclaw/docs/gateway/configuration-reference.md)
- [工具目录](/Users/huangxiaogang/claw-sources/openclaw/docs/tools/index.md)

---

*最后更新：2026-03-15*
