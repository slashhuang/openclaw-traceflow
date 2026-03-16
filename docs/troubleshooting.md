# 故障排查指南

## 常见问题

### 1. "未找到 OpenD 安装目录"

**原因**: OpenD 可执行文件或配置文件不存在于预期目录。

**解决方案**:

1. 确认目录存在:
   ```bash
   ls -la Futu_OpenD_Centos7/
   ```

2. 检查是否包含以下文件:
   - `FutuOpenD` (可执行文件)
   - `FutuOpenD.xml` (配置文件)

### 2. 端口被占用

**症状**: OpenD 启动失败，提示端口已被占用。

**解决方案**:

```bash
# 检查端口占用
netstat -tlnp | grep 11113

# kill 占用进程
kill -9 <PID>
```

### 3. OpenD 反复重启

**症状**: PM2 不断重启 OpenD 进程。

**解决方案**:

1. 检查日志:
   ```bash
   npm run futu:logs
   ```

2. 检查配置文件 `FutuOpenD.xml` 格式是否正确

## Mac 用户特别说明

Mac 不支持本工具的 Linux OpenD，请使用富途官方 Mac OpenD 应用:

1. 下载 Mac OpenD: https://www.futumm.com/download/opend
2. 打开 OpenD 应用
3. 设置 -> OpenD 设置 -> 端口设置:
   - API 端口：11113
   - WebSocket 端口：33333

## 获取帮助

如果以上方法都无法解决问题，请查看富途官方文档：https://openapi.futumm.com/futu-api-doc/opend/
