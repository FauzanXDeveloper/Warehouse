const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

const isDev = !app.isPackaged
const PORT = 3000

let mainWindow
let server

// ── find system node.exe without shell commands ────────────────────────────────
// We spawn the Next.js server with the SYSTEM node (not Electron's embedded one)
// so that better-sqlite3 – compiled against the system Node.js ABI – loads fine.

function findSystemNode() {
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  const candidates = process.platform === 'win32' ? ['node.exe', 'node'] : ['node']
  for (const dir of pathDirs) {
    for (const name of candidates) {
      const full = path.join(dir.trim(), name)
      if (fs.existsSync(full)) return full
    }
  }
  return null
}

// ── window ─────────────────────────────────────────────────────────────────────

const createWindow = () => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── wait for HTTP server ───────────────────────────────────────────────────────

const waitForServer = (retries = 40, delay = 1000) => {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const req = http.get(`http://127.0.0.1:${PORT}`, () => resolve())
      req.on('error', () => {
        if (remaining <= 0) return reject(new Error('Server did not start in time'))
        setTimeout(() => check(remaining - 1), delay)
      })
      req.setTimeout(800, () => req.destroy())
    }
    check(retries)
  })
}

// ── start Next.js server ───────────────────────────────────────────────────────

const startServer = () => {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // Dev: assume `npm run dev` is already running on port 3000
      resolve()
      return
    }

    const serverPath = path.join(process.resourcesPath, 'next-server', 'server.js')
    const serverCwd  = path.join(process.resourcesPath, 'next-server')

    // Prefer system node so that native modules (better-sqlite3) match the ABI
    // they were compiled against. Fall back to Electron's embedded node only if
    // system node is not found.
    const sysNode = findSystemNode()
    const nodeExe = sysNode || process.execPath

    const env = {
      ...process.env,
      PORT:         String(PORT),
      HOSTNAME:     '127.0.0.1',
      NODE_ENV:     'production',
      APP_DATA_DIR: app.getPath('userData'),
    }
    // Only set this flag when we fall back to the Electron binary
    if (!sysNode) env.ELECTRON_RUN_AS_NODE = '1'

    console.log(`[Main] Spawning server with: ${nodeExe}`)

    const serverProcess = spawn(nodeExe, [serverPath], {
      env,
      cwd:      serverCwd,
      detached: false,
    })
    server = serverProcess

    serverProcess.stdout?.on('data', d => console.log(`[Server] ${d}`))
    serverProcess.stderr?.on('data', d => console.error(`[Server Error] ${d}`))
    serverProcess.on('error', err => { console.error('Failed to start server:', err); reject(err) })
    serverProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) reject(new Error(`Server exited early (code=${code}, signal=${signal})`))
    })

    waitForServer().then(resolve).catch(reject)
  })
}

// ── lifecycle ──────────────────────────────────────────────────────────────────

app.on('ready', async () => {
  try {
    await startServer()
    createWindow()
    createMenu()
  } catch (err) {
    console.error('Failed to start app:', err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (server) server.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => { if (mainWindow === null) createWindow() })
app.on('quit', () => { if (server) server.kill() })

// ── menu ───────────────────────────────────────────────────────────────────────

const createMenu = () => {
  const template = [
    {
      label: 'App',
      submenu: [
        { label: 'About RCR Query Editor', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo',  accelerator: 'CmdOrCtrl+Z',       role: 'undo'  },
        { label: 'Redo',  accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo'  },
        { type: 'separator' },
        { label: 'Cut',   accelerator: 'CmdOrCtrl+X', role: 'cut'   },
        { label: 'Copy',  accelerator: 'CmdOrCtrl+C', role: 'copy'  },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
