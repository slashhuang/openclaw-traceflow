const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// 禁用硬件加速以避免某些 macOS 系统的崩溃问题
app.disableHardwareAcceleration();

const CONTROL_UI_URL = 'http://127.0.0.1:18789/';
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_GATEWAY_TOKEN = 'jojo';
const DEFAULT_CONTROL_UI_URL = 'http://127.0.0.1:18789/';

// 防止重复打开窗口
let isSwitchingWindow = false;

function getConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function setConfig(obj) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj, null, 2));
}

function checkControlUI(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('连接超时'));
    });
  });
}

// ------------ 主逻辑 ------------

let mainWindow = null;
let connectionWindow = null;

// 主窗口创建逻辑
function createMainWindow(controlUrl = null) {
  if (typeof isSwitchingWindow === 'undefined') global.isSwitchingWindow = false;
  if (isSwitchingWindow) return null;
  isSwitchingWindow = true;

  // 关闭连接窗口
  if (connectionWindow && !connectionWindow.isDestroyed()) {
    connectionWindow.close();
    connectionWindow = null;
  }

  // 如果已有主窗口，直接聚焦
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    isSwitchingWindow = false;
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '阿布控制台',
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 某些自定义调试需要取消 webSecurity
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
    isSwitchingWindow = false;
  });

  const loadUrl = controlUrl || getConfig().controlUrl || DEFAULT_CONTROL_UI_URL;

  // 监听加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page load failed:', errorDescription);
  });

  // 注入 gateway token
  mainWindow.webContents.on('did-finish-load', () => {
    isSwitchingWindow = false;
    const config = getConfig();
    const token = config.gatewayToken || DEFAULT_GATEWAY_TOKEN;
    mainWindow.webContents.executeJavaScript(`
      (function() {
        if (document.getElementById('gateway-token-hint')) return;
        const tokenBanner = document.createElement('div');
        tokenBanner.id = 'gateway-token-hint';
        tokenBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(76,175,80,0.9);color:#fff;padding:8px 16px;font-size:12px;z-index:999999;display:flex;align-items:center;justify-content:space-between;';
        tokenBanner.innerHTML = '<span>Gateway Token: <strong style="font-family:monospace;">${token}</strong></span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;">×</button>';
        document.body.insertBefore(tokenBanner, document.body.firstChild);
        document.body.style.marginTop = '36px';
      })();
    `);
  });

  mainWindow.loadURL(loadUrl, {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    isSwitchingWindow = false;
  });

  return mainWindow;
}

function showConnectionWindow(existingUrl = null) {
  if (isSwitchingWindow) return null;
  isSwitchingWindow = true;

  // 关闭主窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }

  // 如果已有连接窗口，直接聚焦
  if (connectionWindow && !connectionWindow.isDestroyed()) {
    connectionWindow.focus();
    isSwitchingWindow = false;
    return connectionWindow;
  }

  connectionWindow = new BrowserWindow({
    width: 550,
    height: 750,
    minWidth: 480,
    minHeight: 650,
    title: '连接 ControlUI',
    show: false,
    resizable: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  connectionWindow.loadFile(path.join(__dirname, 'connection.html'), {
    query: { existingUrl: existingUrl || '' }
  });

  connectionWindow.once('ready-to-show', () => {
    connectionWindow.show();
    isSwitchingWindow = false;
  });

  connectionWindow.on('closed', () => {
    connectionWindow = null;
    isSwitchingWindow = false;
  });

  return connectionWindow;
}

// IPC Handlers
ipcMain.handle('get-config', () => getConfig());

ipcMain.handle('set-config', (_, cfg) => {
  setConfig(cfg);
  return true;
});

ipcMain.handle('check-control-ui', async (_, url) => {
  try {
    await checkControlUI(url || DEFAULT_CONTROL_UI_URL, 5000);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-main-window', (_, url) => {
  createMainWindow(url);
});

ipcMain.handle('get-gateway-token', () => {
  const config = getConfig();
  return config.gatewayToken || DEFAULT_GATEWAY_TOKEN;
});

ipcMain.handle('set-gateway-token', (_, token) => {
  const config = getConfig();
  config.gatewayToken = token;
  setConfig(config);
  return true;
});

ipcMain.handle('start-openclaw', async () => {
  const repoPath = '/Users/huangxiaogang/claw-sources/claw-family';
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'local'], {
      cwd: repoPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === null) resolve(output);
      else reject(new Error(output || `npm run local 退出码 ${code}`));
    });
  });
});

function createMenu() {
  const template = [
    {
      label: '阿布',
      submenu: [
        {
          label: '重新连接',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => showConnectionWindow()
        },
        {
          label: '刷新页面',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (mainWindow) mainWindow.reload(); }
        },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App Lifecycle
app.whenReady().then(async () => {
  createMenu();
  // 启动时直接打开连接窗口
  showConnectionWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!connectionWindow || connectionWindow.isDestroyed()) {
      showConnectionWindow();
    } else {
      connectionWindow.focus();
    }
  } else {
    mainWindow.show();
  }
});

// 处理 URL scheme（如果需要）
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('Received URL:', url);
});
