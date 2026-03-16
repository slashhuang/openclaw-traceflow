# 安装指南

## 系统要求

- Node.js >= 14.0.0
- Linux (CentOS 7 或兼容系统)
- 或 Mac（需使用富途官方 Mac OpenD 应用）

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

**本仓库已包含 Futu_OpenD_Centos7 目录**，内含 CentOS 7 版本的 OpenD 二进制文件：

```bash
# 确认目录存在
ls -la Futu_OpenD_Centos7/
```

目录应包含：
- `FutuOpenD` (可执行文件)
- `FutuOpenD.xml` (配置文件)
- `AppData.dat` (数据文件，首次登录后生成)
- 以及其他 .so 库文件

> **注意**: FutuOpenD 仅支持 Linux (CentOS 7)。Mac 用户请下载富途官方 Mac OpenD 应用。

#### 如需自行下载（可选）

如果需要重新下载或更新：

```bash
# 进入仓库目录
cd /path/to/futu-openD

# 下载富途 OpenD（CentOS7 版本）
wget https://futummcloud.bj.bcebos.com/futu-opend/linux/FutuOpenD_Linux_v2.1.2008.tar.gz

# 解压到 Futu_OpenD_Centos7/
mkdir -p Futu_OpenD_Centos7
tar -xzf FutuOpenD_Linux_v2.1.2008.tar.gz -C Futu_OpenD_Centos7 --strip-components=1
```

### 4. 配置

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

**方式 2: config.json（可选）**

```bash
cp config.example.json config.json
```

编辑 `config.json`，填入你的富途账号和认证信息。

**方式 3: .env（可选）**

```bash
cp .env.example .env
```

编辑 `.env` 文件。

### 5. 验证安装

```bash
# 检查 OpenD 目录是否正确
ls -la Futu_OpenD_Centos7/

# 应该包含以下文件：
# - FutuOpenD (可执行文件)
# - FutuOpenD.xml (配置文件)
# - *.so (库文件)
```

### 6. 测试启动

```bash
# 前台启动（会提示验证码）
npm run futu
```

如果看到验证码提示，按照提示输入验证码。

### 7. PM2 部署（可选）

#### 安装 PM2

```bash
npm install -g pm2
```

#### 启动

```bash
# 生产环境
npm run futu:pm2

# 开发环境
npm run futu:pm2:dev

# 本地环境
npm run futu:pm2:local
```

#### 设置开机自启

```bash
pm2 startup
pm2 save
```

#### 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs futu-opend

# 重启
pm2 restart futu-opend

# 停止
pm2 stop futu-opend

# 删除
pm2 delete futu-opend
```

## 下一步

- 查看 [README.md](../README.md) 了解更多使用方式
- 查看 [troubleshooting.md](./troubleshooting.md) 了解故障排查
