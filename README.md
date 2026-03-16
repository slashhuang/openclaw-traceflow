# Futu OpenD

富途 OpenD 独立启动工具，使用 PM2 守护进程。

## 特性

- **自治独立**：完全自包含，不依赖 claw-family
- **PM2 守护**：使用 PM2 管理 OpenD 进程，自动重启
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

    <!-- 模式：1=模拟，2=实盘 -->
    <is_mod>1</is_mod>

    <!-- 服务器 -->
    <server>nz-futu-1.futunn.com:9292</server>
</futu_opend>
```

### 4. 启动

```bash
# 启动 OpenD（使用 PM2 守护）
npm run futu

# 查看状态
npm run futu:status

# 查看日志
npm run futu:logs

# 重启
npm run futu:restart

# 停止
npm run futu:stop
```

## 故障排查

### 端口被占用

```bash
# 检查端口占用
netstat -tlnp | grep 11113

# kill 占用进程
kill -9 <PID>
```

### OpenD 反复重启

- 查看 PM2 日志：`npm run futu:logs`
- 检查配置文件 `FutuOpenD.xml` 格式是否正确

## 参考

- [富途 OpenD 官方文档](https://openapi.futumm.com/futu-api-doc/opend/opend-cmd.html)
