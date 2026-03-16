# 安装指南

## 系统要求

- Node.js >= 14.0.0
- Linux (CentOS 7 或兼容系统)

## 步骤

### 1. 克隆仓库

```bash
git clone https://github.com/slashhuang/futu-openD.git
cd futu-openD
```

### 2. 安装依赖

```bash
npm install
```

### 3. OpenD 二进制文件

本仓库已包含 `Futu_OpenD_Centos7/` 目录，内含 CentOS 7 版本的 OpenD 二进制文件。

确认目录存在:
```bash
ls -la Futu_OpenD_Centos7/
```

目录应包含：
- `FutuOpenD` (可执行文件)
- `FutuOpenD.xml` (配置文件)
- `AppData.dat` (数据文件，首次登录后生成)
- 以及其他 .so 库文件

### 4. 配置

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

### 5. 启动

```bash
npm run futu
```

### 6. PM2 常用命令

```bash
# 查看状态
npm run futu:status

# 查看日志
npm run futu:logs

# 重启
npm run futu:restart

# 停止
npm run futu:stop
```
