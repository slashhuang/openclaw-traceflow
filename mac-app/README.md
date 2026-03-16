# 阿布控制台（Mac 桌面应用）

给家人用的 Mac 程序：**双击打开** → 自动连接 ControlUI → 访问 OpenClaw 控制台。

## 给家人（非技术人员）用

### 首次使用：设置 ControlUI 地址

1. 双击打开「阿布控制台」。
2. 如果 ControlUI 未运行，会显示连接设置界面。
3. 输入 ControlUI 地址（默认 `http://127.0.0.1:18789/`）。
4. 点击「连接并打开」即可访问控制台。
5. 配置会自动保存，下次启动时自动尝试连接。

### 日常使用

- **双击「阿布控制台」** → 自动尝试连接 ControlUI → 出现控制台界面。
- 如果连接失败，可以手动输入地址重新连接。
- 快捷键：
  - `Cmd+Shift+L`: 重新连接
  - `Cmd+R`: 刷新页面
  - `Cmd+Q`: 退出应用

## 给开发者：如何打包

在 **mac-app** 目录执行：

```bash
npm install
npm run start   # 开发时直接运行
npm run dist    # 打包成 .app / .dmg，输出在 dist/
```

打包完成后，把 `dist/阿布控制台.app` 拖到「应用程序」即可。

### 修改配置

配置保存在：
`~/Library/Application Support/claw-family-desktop/config.json`

- `controlUrl`: ControlUI 地址
- `repoPath`: claw-family 项目目录（可选）

## 技术说明

- 使用 Electron 33.x，主窗口 1400x900，支持最大化。
- 启动时自动检测本地 ControlUI 是否可用（3 秒超时）。
- 连接失败时显示美观的连接设置界面，支持手动输入地址。
- 使用 abu.jpg 生成应用图标，执行 `npm run icon` 即可更新。
