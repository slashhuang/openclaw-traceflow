# OpenClaw 源码查阅指南

本文档说明如何在修改 OpenClaw 相关配置时查阅源码，避免靠猜测修改。

## 何时需要查阅源码

在进行以下修改时，**必须**先查阅 OpenClaw 源码：

- [ ] 修改 `config/openclaw.partial.json` 配置
- [ ] 添加或修改 skills 配置
- [ ] 修改 gateway、agent、hooks 相关配置
- [ ] 修改 channel（飞书）集成配置
- [ ] 修改 browser、tools 配置
- [ ] 遇到报错需要定位 OpenClaw 核心逻辑
- [ ] 不确定某个配置项是否支持

## 源码位置

### 本地开发环境
```
/Users/huangxiaogang/claw-sources/external-refs/openclaw/src/
```

### 云端服务器
```
/data/claw-family/openclaw/src/
# 或
/opt/homebrew/lib/node_modules/openclaw/src/
```

## 核心模块路径

### 1. 工具系统
**路径**: `src/agents/tools/`

| 文件 | 用途 |
|------|------|
| `tool-registry.ts` | 工具注册与管理 |
| `web-search.ts` | 网络搜索工具 |
| `browser/` | 浏览器自动化工具 |
| `fs/` | 文件系统工具 |
| `exec/` | 命令执行工具 |

### 2. 配置系统
**路径**: `src/config/`

| 文件 | 用途 |
|------|------|
| `config-loader.ts` | 配置加载与合并逻辑 |
| `types.tools.ts` | 工具配置类型定义 |
| `schema.help.ts` | 配置项帮助说明 |
| `schema.skills.ts` | Skills 配置 Schema |
| `schema.channels.ts` | Channel 配置 Schema |

### 3. Gateway 服务
**路径**: `src/gateway/`

| 文件 | 用途 |
|------|------|
| `index.ts` | Gateway 主入口 |
| `rpc-handler.ts` | RPC 通信处理 |
| `types.ts` | Gateway 类型定义 |

### 4. Agent 核心
**路径**: `src/agents/`

| 文件 | 用途 |
|------|------|
| `index.ts` | Agent 创建与管理 |
| `session.ts` | 会话管理 |
| `bootstrap.ts` | Agent 启动流程 |

### 5. Skills 系统
**路径**: `src/skills/`

| 文件 | 用途 |
|------|------|
| `loader.ts` | Skill 加载器 |
| `executor.ts` | Skill 执行器 |
| `types.ts` | Skill 类型定义 |

### 6. Channel 集成
**路径**: `src/channels/`

| 子目录 | 用途 |
|--------|------|
| `feishu/` | 飞书集成 |
| `telegram/` | Telegram 集成 |
| `discord/` | Discord 集成 |
| `slack/` | Slack 集成 |

## 查阅流程

### 步骤 1: 搜索相关代码

使用 `Grep` 或 `Glob` 搜索关键词：

```bash
# 搜索配置项
grep -r "gateway.mode" /path/to/openclaw/src/

# 搜索特定功能
grep -r "feishu" /path/to/openclaw/src/channels/
```

### 步骤 2: 阅读核心逻辑

找到相关文件后，仔细阅读：
- 配置项的定义和验证逻辑
- 默认值设置
- 合并逻辑（partial.json 如何与 generated.json 合并）

### 步骤 3: 确认修改方案

基于源码理解：
- 配置项的正确格式
- 是否支持动态修改
- 是否需要重启生效

### 步骤 4: 实施修改

在 `claw-family` 中进行修改：
- 只修改 `config/openclaw.partial.json`
- 不要修改 `openClawRuntime/`（自动生成）

## 常见配置查阅指引

### 修改 Model 配置
**查阅**: `src/config/types.tools.ts` + `src/models/`

### 修改 Skills 配置
**查阅**: `src/skills/loader.ts` + `src/config/schema.skills.ts`

### 修改 Gateway 配置
**查阅**: `src/gateway/index.ts` + `src/config/types.tools.ts`

### 修改 Channel 配置
**查阅**: `src/channels/feishu/` + `src/config/schema.channels.ts`

### 修改 Tools 配置
**查阅**: `src/agents/tools/tool-registry.ts` + `src/config/types.tools.ts`

## 调试技巧

### 查看配置合并结果
```bash
# 查看生成的配置
cat openClawRuntime/openclaw.generated.json
```

### 查看启动日志
```bash
# PM2 日志
pm2 logs claw-gateway --lines 100

# 或直接查看日志文件
tail -f ~/Library/Logs/openclaw/*.log
```

### 配置验证
```bash
# 使用 openclaw doctor 检查配置
openclaw doctor
```

## 示例：添加新 Skill

1. **查阅源码**: `src/skills/loader.ts` 了解加载机制
2. **创建 Skill**: 在 `skills/my-skill/SKILL.md` 定义
3. **配置加载**: 在 `config/openclaw.partial.json` 添加配置
4. **验证**: 运行 `openclaw doctor` 或重启服务查看

## 示例：修改飞书配置

1. **查阅源码**: `src/channels/feishu/index.ts`
2. **了解 Schema**: `src/config/schema.channels.ts`
3. **修改配置**: 编辑 `config/openclaw.partial.json`
4. **验证**: 重启服务测试

## 注意事项

- ❌ **不要靠记忆修改**: 每次修改前都查阅源码确认
- ❌ **不要猜测配置**: 不确定的配置项先查 Schema
- ✅ **先 PRD 后实现**: 结构性变更先写 PRD
- ✅ **以代码为准**: PRD 与代码不一致时以代码为准

## 参考文档

- [CLAUDE.md](../CLAUDE.md) - 项目总说明
- [architecture.mdc](../.cursor/rules/architecture.mdc) - 架构约束
- [config/README.md](../config/README.md) - 配置说明
- [troubleshooting.md](./troubleshooting.md) - 故障排查
