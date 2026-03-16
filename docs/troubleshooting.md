# 故障排查指南

## 常见问题

### 1. "未找到 OpenD 安装目录"

**原因**: OpenD 可执行文件或配置文件不存在于预期目录。

**解决方案**:

1. 确认已下载 OpenD:
   ```bash
   ls -la Futu_OpenD_Centos7/
   ```

2. 检查是否包含以下文件:
   - `FutuOpenD` (可执行文件)
   - `FutuOpenD.xml` (配置文件)

3. 如果没有，请重新下载:
   ```bash
   wget https://futummcloud.bj.bcebos.com/futu-opend/linux/FutuOpenD_Linux_v2.1.2008.tar.gz
   mkdir -p Futu_OpenD_Centos7
   tar -xzf FutuOpenD_Linux_v2.1.2008.tar.gz -C Futu_OpenD_Centos7 --strip-components=1
   ```

### 2. "配置验证失败"

**原因**: 配置文件中缺少必填项。

**解决方案**:

检查 `config.json` 或 `.env` 文件，确保包含:
- `futu.accno` (富途账号)
- `futu.password` 或 `futu.authcode` (至少一个)

### 3. 端口被占用

**症状**: OpenD 启动失败，提示端口已被占用。

**解决方案**:

```bash
# 检查端口占用
netstat -tlnp | grep 11113

# 找到占用进程后，kill 它
kill -9 <PID>

# 或者修改配置中的端口
```

### 4. 认证失败/登录失败

**可能原因**:
- 密码错误
- MD5 加密不正确
- 账号被锁定

**解决方案**:

1. 检查账号密码是否正确
2. 尝试使用 authcode 免密登录:
   - 在本地富途牛牛生成 authcode
   - 在配置中填入 `authcode`，不填 `password`

### 5. 验证码循环

**症状**: 每次启动都要求输入验证码。

**原因**: PM2 后台守护导致无法输入验证码。

**解决方案**:

1. 使用前台启动:
   ```bash
   npm run futu
   ```

2. 输入验证码完成登录

3. 生成 authcode 用于后续免密登录

4. 之后可使用后台模式:
   ```bash
   npm run futu:bg
   ```

### 6. 无法连接富途服务器

**症状**: OpenD 启动后无法连接 `nz-futu-1.futunn.com:9292`

**解决方案**:

1. 检查网络连接:
   ```bash
   ping nz-futu-1.futunn.com
   ```

2. 检查防火墙设置:
   ```bash
   # 确保可以访问 9292 端口
   telnet nz-futu-1.futunn.com 9292
   ```

3. 检查服务器配置是否正确:
   ```json
   {
     "futu": {
       "server": "nz-futu-1.futunn.com:9292"
     }
   }
   ```

### 7. OpenD 反复重启

**症状**: PM2 不断重启 OpenD 进程。

**可能原因**:
- 配置文件格式错误
- 账号认证问题
- 端口冲突

**解决方案**:

1. 检查日志:
   ```bash
   # 如果使用 PM2
   pm2 logs futu-opend

   # 或直接查看 OpenD 输出
   npm run futu
   ```

2. 检查配置文件 `FutuOpenD.xml` 格式是否正确

3. 前台启动查看详细错误信息

### 8. PM2 相关故障

#### PM2 启动失败

```bash
# 检查 PM2 状态
pm2 status

# 查看详细日志
pm2 logs futu-opend --lines 100

# 重启 PM2 守护进程
pm2 resurrect
```

#### PM2 环境变量不生效

确保使用正确的 `--env` 参数：

```bash
# 生产环境
pm2 start ecosystem.config.cjs --env production

# 开发环境
pm2 start ecosystem.config.cjs --env dev

# 本地环境
pm2 start ecosystem.config.cjs --env local
```

#### PM2 日志文件过大

```bash
# 清空日志
pm2 flush

# 或使用日志轮转（需要 pm2-logrotate 模块）
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Mac 用户特别说明

Mac 不支持本工具的 Linux OpenD，请使用富途官方 Mac OpenD 应用:

1. 下载 Mac OpenD: https://www.futunn.com/download/opend
2. 打开 OpenD 应用
3. 设置 -> OpenD 设置 -> 端口设置:
   - API 端口：11113
   - WebSocket 端口：33333
4. 启动 OpenD

## 获取帮助

如果以上方法都无法解决问题，请:

1. 检查富途官方文档：https://openapi.futumm.com/futu-api-doc/opend/
2. 查看仓库 Issues
3. 联系富途客服
