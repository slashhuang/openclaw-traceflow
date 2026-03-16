# PRD: Futu OpenD 独立仓库

**创建日期**: 2026-03-13  
**作者**: 阿布 👧  
**状态**: 待确认

---

## 1. 背景与目标

### 1.1 现状

当前 Futu OpenD 由 `claw-family` 仓库管理：
- 启动脚本：`scripts/start-futu-opend.sh`
- PM2 配置：`ecosystem.config.cjs` 中的 `futu-opend` 应用
- 文档：`macAppAndCentOsFutu/README.md`

**问题**：
- OpenD 是富途官方独立服务，与 claw-family 耦合过紧
- 首次登录可能需要验证码，PM2 后台守护导致验证码循环
- 跨环境（服务器/Mac）管理方式不一致

### 1.2 目标

创建独立的 `futu-openD` 仓库，实现：
- **自治独立**：完全自包含，不依赖 claw-family
- **前台启动**：支持验证码输入，`npm run futu` 一键启动
- **跨环境一致**：服务器/Mac 用同一套管理方式
- **清晰边界**：OpenD 只管提供 API 服务，claw-family 只管调用

---

## 2. 核心设计原则：自治独立

### 2.1 代码独立 ✅

| 要求 | 实现 |
|------|------|
| 不引用 claw-family 任何文件 | 独立目录结构 |
| 自己的启动脚本 | `scripts/start.js` 或 `scripts/start.sh` |
| 自己的配置逻辑 | `config/index.js` |

### 2.2 配置独立 ✅

使用 `config.json` 或 `.env` 管理：

```json
{
  "futu": {
    "accno": "你的富途账号",
    "password": "密码（或 authcode 免密登录）",
    "listenPort": 11113,
    "websocketPort": 33333,
    "isMod": 1,
    "server": "nz-futu-1.futunn.com:9292"
  }
}
```

- 提供 `config.example.json` 模板
- 支持环境变量覆盖

### 2.3 运行独立 ✅

```bash
# 前台启动（支持验证码）
npm run futu

# 后台模式（已配置免密时）
npm run futu:bg
```

- 不依赖 `bootstrap.sh`
- 可选 PM2/systemd 集成（用户自行选择）

### 2.4 维护独立 ✅

| 项目 | 说明 |
|------|------|
| 独立版本号 | `package.json` 中的 `version` |
| 独立依赖 | 富途 SDK、dotenv 等 |
| 独立更新 | 不影响 claw-family |

### 2.5 协作方式

```
┌─────────────────┐
│  futu-openD     │  独立运行
│  (独立仓库)     │
└────────┬────────┘
         │ 监听 127.0.0.1:11113
         ↓
┌─────────────────┐
│  claw-family    │  作为客户端连接
│  stock-assistant│
└─────────────────┘
```

**边界清晰**：
- futu-openD：只管提供 API 服务，不管谁在用
- claw-family：只管调用 API，不管 OpenD 怎么启动

---

## 3. 仓库结构

```
futu-openD/
├── package.json           # 独立版本 + 依赖
├── README.md              # 使用说明
├── config.example.json    # 配置模板
├── .env.example           # 环境变量模板
├── scripts/
│   ├── start.js           # 主启动脚本（Node.js）
│   └── verify-ports.sh    # 端口检查工具
├── src/
│   ├── config.js          # 配置加载
│   ├── opend.js           # OpenD 启动逻辑
│   └── validator.js       # 配置验证
└── docs/
    ├── install.md         # 安装指南
    └── troubleshooting.md # 故障排查
```

---

## 4. 启动流程

### 4.1 首次启动（需要验证码）

```bash
# 1. 克隆仓库
git clone https://github.com/slashhuang/futu-openD.git
cd futu-openD

# 2. 安装依赖
npm install

# 3. 配置
cp config.example.json config.json
# 编辑 config.json，填入富途账号密码

# 4. 前台启动（会提示验证码）
npm run futu
```

### 4.2 免密登录后

```bash
# 后台模式
npm run futu:bg

# 或 PM2 守护
pm2 start ecosystem.config.cjs
```

---

## 5. 与 claw-family 的兼容

### 5.1 端口约定（保持不变）

| 用途 | 端口 |
|------|------|
| API 协议 | 11113 |
| WebSocket | 33333 |

`claw-family` 的 `assistant_config.json` **无需修改**。

### 5.2 claw-family 文档更新

在 `macAppAndCentOsFutu/README.md` 添加：

```markdown
## 独立仓库（推荐）

Futu OpenD 已迁移至独立仓库：https://github.com/slashhuang/futu-openD

新仓库提供：
- 自治独立，不依赖 claw-family
- 前台启动支持验证码
- 跨环境一致的管理方式

旧版 PM2 管理方式仍可使用，但推荐迁移至新仓库。
```

---

## 6. 实施计划

### Phase 1: 创建仓库（本次 PRD 确认后）

- [ ] 创建 `futu-openD` 仓库
- [ ] 实现核心启动逻辑
- [ ] 编写 README 和文档
- [ ] 测试服务器/Mac 跨环境

### Phase 2: claw-family 文档更新（单独 PR）

- [ ] 更新 `macAppAndCentOsFutu/README.md`
- [ ] 可选：移除 `scripts/start-futu-opend.sh`（需评估兼容性）

---

## 7. 验收标准

- [ ] `npm run futu` 可在服务器/Mac 正常启动
- [ ] 验证码流程可用（首次登录）
- [ ] 免密登录后可后台运行
- [ ] claw-family/stock-assistant 可正常连接（端口 11113/33333）
- [ ] 文档清晰，用户可按步骤独立完成

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 旧用户迁移成本 | 保留旧版 PM2 方式，文档引导迁移 |
| 跨环境兼容问题 | 充分测试服务器 (Linux) 和 Mac |
| 验证码流程复杂 | README 提供详细截图和步骤 |

---

**请爸爸确认此 PRD，确认后阿布开始实施 Phase 1～** 👧
