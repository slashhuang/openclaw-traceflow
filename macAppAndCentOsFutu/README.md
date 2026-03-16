# 富途 OpenD 环境说明（服务器 vs Mac 本地）

本目录用于存放富途 OpenD 相关资源。**stock-assistant** 通过 `global_settings.futu`（host=127.0.0.1, port=11113, websocket_port=33333）连接本机 OpenD。为兼容服务器与 Mac 本地，约定端口统一，谁启动 OpenD 因环境而异。

## 端口约定（双环境共用配置）

| 用途       | 端口   |
|------------|--------|
| API 协议   | 11113  |
| WebSocket  | 33333  |

`skills/stock-assistant/config/assistant_config.json` 中 `global_settings.futu` 已按上述端口配置，**无需因环境切换而改配置**。

---

## 服务器（Linux/CentOS）

### 首次安装

```bash
# 1. 进入目录
cd /path/to/claw-family/macAppAndCentOsFutu

# 2. 下载富途 OpenD（CentOS7 版本）
wget https://futummcloud.bj.bcebos.com/futu-opend/linux/FutuOpenD_Linux_v2.1.2008.tar.gz

# 3. 解压到 Futu_OpenD_Centos7/
mkdir -p Futu_OpenD_Centos7
tar -xzf FutuOpenD_Linux_v2.1.2008.tar.gz -C Futu_OpenD_Centos7 --strip-components=1
```

### 配置

编辑 `Futu_OpenD_Centos7/FutuOpenD.xml`：

```xml
<config>
    <!-- 监听端口（必须与 stock-assistant 配置一致） -->
    <listen_port>11113</listen_port>
    <websocket_port>33333</websocket_port>

    <!-- 模式：1=模拟，2=实盘 -->
    <is_mod>1</is_mod>

    <!-- 富途服务器 -->
    <server>nz-futu-1.futunn.com:9292</server>

    <!-- 登录凭证（三选一） -->
    <!-- 方式 1: 密码登录 -->
    <auth>你的密码 MD5</auth>
    <imppwd>你的登录密码</imppwd>
    <phonecode>86</phonecode>
    <accno>你的富途账号</accno>

    <!-- 方式 2: 免密码登录（推荐） -->
    <!-- 在本地富途牛牛生成 authcode 后填入 -->
    <!-- <authcode>xxx</authcode> -->
</config>
```

### MD5 密码生成

```bash
# Linux
echo -n "你的密码" | md5sum

# 或在线生成：https://www.md5.cn/
```

### 测试启动

```bash
cd Futu_OpenD_Centos7

# 前台运行，检查是否正常
./FutuOpenD -cfg_file=FutuOpenD.xml -console=1

# 看到 "Server started" 表示成功
```

### 正式运行（PM2 守护）

```bash
cd /path/to/claw-family

# 删除旧的 futu-opend 进程
pm2 delete futu-opend 2>/dev/null || true

# 重新启动
pm2 start ecosystem.config.cjs --env local

# 查看状态
pm2 status

# 查看日志
pm2 logs futu-opend
```

### 验证连接

```bash
# 检查端口是否监听
netstat -tlnp | grep -E "11113|33333"

# 测试连接
telnet 127.0.0.1 11113
```

### 故障排查

| 问题 | 解决方案 |
|------|----------|
| 端口被占用 | `netstat -tlnp \| grep 11113` 找到并 kill 占用进程 |
| 认证失败 | 检查密码 MD5 是否正确，或改用免密码登录 |
| 无法连接服务器 | 检查防火墙，确保可访问 `nz-futu-1.futunn.com:9292` |
| 反复重启 | 查看 `pm2 logs futu-opend`，通常是配置错误 |

---

## Mac 本地

- **谁启动 OpenD**：你在本机**手动运行**富途官方 **Mac OpenD 应用**（App 或命令行版均可）。
- **必须设置**：在 OpenD 应用/配置里将 **API 端口设为 11113**、**WebSocket 端口设为 33333**，与 `global_settings.futu` 一致，这样 stock-assistant 才能连上且不用改配置。
- **说明**：Mac 上 bootstrap **不会**启动 OpenD（仅 Linux 会通过脚本启动），因此本地需自行打开富途 Mac OpenD 后再跑 claw-family / stock-assistant。

---

## 小结

| 环境     | 谁启动 OpenD              | 端口（需一致）   |
|----------|---------------------------|------------------|
| Linux 服务器 | PM2 守护本目录 Futu_OpenD_Centos7 | 11113 / 33333 |
| Mac 本地    | 手动运行富途 Mac OpenD 应用 | 11113 / 33333 |

只要两端 OpenD 都监听 **11113** 和 **33333**，同一份 `assistant_config.json` 即可在服务器和 Mac 本地共用。

---

## 参考

- 富途官方文档：https://openapi.futunn.com/futu-api-doc/opend/opend-cmd.html
- 免密码登录：https://openapi.futunn.com/futu-api-doc/opend/opend-auth.html
