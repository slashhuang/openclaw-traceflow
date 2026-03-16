# Monorepo 开发指南（简化版）

## 项目结构

```
claw-sources/ (唯一开发仓库)
├── claw-family/       ← 独立可运行项目（OpenClaw + 飞书）
├── futu-openD/        ← 独立可运行项目（富途 OpenD）
└── external-refs/     ← 参考代码
```

## 核心原则

### 1. 单一开发入口

**只在 `claw-sources/` 开发**，不需要复杂的 git 操作。

```bash
# ✅ 正确：在 claw-sources 中开发
cd /Users/huangxiaogang/claw-sources/claw-family
vim config/openclaw.partial.json
git commit -am "feat: 新功能"
```

### 2. 子包天然独立

每个子目录都是完整项目，随时可以拆分：

- `claw-family/` 有独立的 `package.json`、`bootstrap.sh`
- `futu-openD/` 有独立的 `package.json`、配置文件
- 可以直接复制出来独立运行

### 3. 上游仓库是可选的

上游仓库（`github.com:slashhuang/claw-family`）只是：
- 备份镜像
- 方便独立使用者克隆

**不是开发必需**。

---

## 开发流程

### 日常开发

```bash
# 1. 在子包目录开发
cd /Users/huangxiaogang/claw-sources/claw-family
vim skills/my-skill/index.js

# 2. 提交到 monorepo
cd ..
git add claw-family/
git commit -m "feat: 添加新技能"

# 3. 推送到 claw-sources
git push origin main
```

### 服务管理

```bash
# 在 claw-family 目录
cd claw-family

# 启动开发服务
npm run dev

# 查看日志
npm run logs

# 检查配置
npm run doctor
```

### 同步到上游（可选）

只有当需要备份或分享时：

```bash
# 使用同步脚本
cd /Users/huangxiaogang/claw-sources
./scripts/subtree-sync.sh sync claw-family push

# 或手动命令
git subtree push --prefix claw-family claw-family-upstream main
```

---

## 快速参考

### 常用命令（在 claw-family 目录）

```bash
# 服务管理
npm run dev         # 启动开发
npm run prod        # 生产部署
npm run logs        # 查看日志
npm run restart     # 重启服务

# 工具
npm run gh:token-check  # 检查 GitHub Token
npm run docs:openclaw   # 查看 OpenClaw 源码指南
```

### 常用命令（在 monorepo 根目录）

```bash
# Git 操作
git add claw-family/
git commit -m "feat: 新功能"
git push origin main

# 同步到上游（可选）
./scripts/subtree-sync.sh sync claw-family push
```

---

## 子包独立性检查

每个子包应该能独立运行：

### claw-family

```bash
# 可以独立克隆运行
git clone git@github.com:slashhuang/claw-family.git
cd claw-family
npm install
npm run dev
```

### futu-openD

```bash
# 可以独立克隆运行
git clone git@github.com:slashhuang/futu-openD.git
cd futu-openD
npm install
npm run dev
```

---

## FAQ

### Q: 需要同步上游仓库吗？

A: **不需要**，除非：
- 你需要备份到独立仓库
- 有其他人需要独立克隆使用
- 你准备开源/分享这个项目

### Q: 将来要拆分成独立仓库吗？

A: 每个子包已经独立，随时可以：
```bash
# 拆分 claw-family
cd claw-family
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:slashhuang/claw-family.git
git push -u origin main
```

### Q: 如何处理依赖？

A: 每个子包独立管理依赖：
```bash
cd claw-family
npm install lodash  # 安装在 claw-family/node_modules/
```

---

## 总结

**Keep It Simple**:
1. 在 `claw-sources/` 开发
2. 提交到 monorepo
3. 子包天然独立，随时可拆分
4. 上游仓库按需同步
