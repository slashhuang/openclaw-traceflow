# Futu OpenD

富途 OpenD 独立启动工具，支持前台/后台/PM2 模式，跨环境（Linux 服务器/Mac）一致管理。

## 特性

- **自治独立**：完全自包含，不依赖 claw-family
- **多种启动方式**：前台（支持验证码）/后台/PM2 守护
- **跨环境一致**：服务器/Mac 用同一套管理方式
- **清晰边界**：OpenD 只管提供 API 服务，不管谁在用

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. OpenD 二进制文件

本仓库已包含 `Futu_OpenD_Centos7/` 目录，内含 CentOS 7 版本的 OpenD 二进制文件：

- `FutuOpenD` - 主程序
- `FutuOpenD.xml` - 配置文件（需编辑）
- `AppData.dat` - 登录数据（首次登录后生成）
- 依赖库文件

> 注意：FutuOpenD 仅支持 Linux (CentOS 7)。Mac 用户请使用富途官方 Mac OpenD 应用。

### 3. 配置

**方式 1: 编辑 FutuOpenD.xml（推荐）**

编辑 `Futu_OpenD_Centos7/FutuOpenD.xml`：

```xml
<futu_opend>
    <!-- 监听地址和端口 -->
    <ip>127.0.0.1</ip>
    <api_port>11113</api_port>
    <websocket_port>33333</websocket_port>

    <!-- 登录账号 -->
    <login_account>你的富途账号</login_account>
    <login_pwd>你的密码</login_pwd>
    <!-- 或使用 MD5 加密 -->
    <!-- <login_pwd_md5>你的密码 MD5</login_pwd_md5> -->

    <!-- 模式：1=模拟，2=实盘 -->
    <is_mod>1</is_mod>

    <!-- 服务器 -->
    <server>nz-futu-1.futunn.com:9292</server>
</futu_opend>
```

**方式 2: 使用 config.json（可选）**

```json
{
  "futu": {
    "accno": "你的富途账号",
    "password": "密码（或使用 authcode 免密登录）",
    "listenPort": 11113,
    "websocketPort": 33333,
    "isMod": 1,
    "server": "nz-futu-1.futunn.com:9292"
  }
}
```

或者使用 `.env` 文件：

```bash
cp .env.example .env
# 编辑 .env 文件
```

### 4. 启动

**方式 1: 使用启动脚本（推荐）**

```bash
# 前台启动（支持验证码，首次登录推荐）
npm run futu

# 后台启动（已配置免密时）
npm run futu:bg
```

**方式 2: 直接使用 shell 脚本**

```bash
# 前台启动
./scripts/start.sh

# 后台启动（用于 PM2）
./scripts/start.sh --background
```

**方式 3: PM2 守护（推荐生产环境）**

```bash
# 生产环境
npm run futu:pm2

# 开发环境
npm run futu:pm2:dev

# 本地环境
npm run futu:pm2:local

# 查看状态
pm2 status

# 查看日志
pm2 logs futu-opend
```

**方式 4: 直接启动 OpenD**

```bash
cd Futu_OpenD_Centos7
./FutuOpenD -cfg_file=FutuOpenD.xml -console=1
```

## 配置说明

### 配置方式（优先级：环境变量 > config.json > 默认值）

| 配置项 | 环境变量 | 说明 | 默认值 |
|--------|----------|------|--------|
| `futu.accno` | `FUTU_ACCNO` | 富途账号 | 必填 |
| `futu.password` | `FUTU_PASSWORD` | 登录密码 | 选填（与 authcode 二选一） |
| `futu.authcode` | `FUTU_AUTHCODE` | 免密登录 authcode | 选填（与 password 二选一） |
| `futu.listenPort` | `FUTU_LISTEN_PORT` | API 监听端口 | 11113 |
| `futu.websocketPort` | `FUTU_WEBSOCKET_PORT` | WebSocket 端口 | 33333 |
| `futu.isMod` | `FUTU_IS_MOD` | 模式：1=模拟，2=实盘 | 1 |
| `futu.server` | `FUTU_SERVER` | 富途服务器 | nz-futu-1.futunn.com:9292 |

### 免密登录（推荐）

1. 在本地富途牛牛生成 authcode
2. 在配置中填入 `authcode`，无需填写 `password`

## 验证码流程

首次登录时，OpenD 会要求输入验证码：

1. 运行 `npm run futu` 前台启动
2. 查看控制台输出，获取验证码提示
3. 根据提示输入验证码
4. 登录成功后，可生成 authcode 用于后续免密登录

## 与 claw-family 集成

futu-openD 启动后，claw-family 的 stock-assistant 可通过以下地址连接：

- API: `127.0.0.1:11113`
- WebSocket: `127.0.0.1:33333`

### 同时运行 futu-openD 和 claw-family

```bash
# 终端 1: 启动 futu-openD
cd /path/to/futu-openD
npm run futu

# 终端 2: 启动 claw-family
cd /path/to/claw-family
./bootstrap.sh
```

## 故障排查

### 端口被占用

```bash
# 检查端口占用
netstat -tlnp | grep 11113

# kill 占用进程
kill -9 <PID>
```

### 认证失败

- 检查密码 MD5 是否正确
- 或使用 authcode 免密登录

### 无法连接服务器

- 检查防火墙设置
- 确保可访问 `nz-futu-1.futunn.com:9292`

### OpenD 反复重启

- 查看日志：`tail -f Futu_OpenD/*.log`（如有）
- 检查配置文件 `FutuOpenD.xml` 格式是否正确

## 跨环境说明

### Linux 服务器

- 使用本工具启动 OpenD
- 支持 PM2 等进程管理工具

### Mac 本地

- Mac 不支持本工具（OpenD 仅支持 Linux）
- 使用富途官方 Mac OpenD 应用
- 设置端口：API 11113，WebSocket 33333

## 参考

- [富途 OpenD 官方文档](https://openapi.futumm.com/futu-api-doc/opend/opend-cmd.html)
- [免密码登录](https://openapi.futumm.com/futu-api-doc/opend/opend-auth.html)
