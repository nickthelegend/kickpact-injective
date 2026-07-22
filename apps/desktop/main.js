/**
 * Kickpact for desktop — Electron shell around the real app.
 *
 * `apps/mobile` is a React Native app that also targets web, so `expo export
 * --platform web` gives us the actual client — the same wallet, the same
 * TxLINE data layer, the same on-chain pool code the phone runs. This shell
 * loads that build from disk (no server, no remote URL) and gives it a
 * phone-shaped window.
 *
 * What's here vs. the phone:
 *   • burner wallet (keys in localStorage under the app's own userData dir)
 *   • live TxLINE fixtures / scores / StablePrice odds
 *   • mint kUSD, open + join pools, claim, proof receipts, on-chain verify
 *   • online duels by code
 * Not here: Mobile Wallet Adapter and Bluetooth duels — both are Android-only
 * native modules. The app already guards them; on desktop the Duels screen
 * offers the code flow and points at the APK for Bluetooth.
 */
const { app, BrowserWindow, shell, Menu } = require("electron")
const path = require("node:path")
const http = require("node:http")
const fs = require("node:fs")

const WEB = path.join(__dirname, "web")

/**
 * The Expo web build references its bundle absolutely (`/_expo/static/...`),
 * which under `file://` resolves to the filesystem root and renders a blank
 * window. So serve the build over loopback instead and point the window at it.
 * Bound to 127.0.0.1 on an ephemeral port — nothing is exposed off-machine.
 */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0])
      let file = path.join(WEB, url === "/" ? "index.html" : url)
      // never let a crafted path escape the build directory
      if (!file.startsWith(WEB)) file = path.join(WEB, "index.html")
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, "index.html")
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))
  })
}

let origin = null

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 940,
    minWidth: 380,
    minHeight: 640,
    backgroundColor: "#10162e",
    title: "Kickpact",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.loadURL(origin)

  // external links (Solana explorer, the repo) open in the real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  return win
}

app.whenReady().then(async () => {
  origin = await serve()
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
      },
      {
        label: "Kickpact",
        submenu: [
          { label: "Dashboard (web)", click: () => shell.openExternal("https://dashboard-alpha-peach-11.vercel.app") },
          { label: "Get the Android app", click: () => shell.openExternal("https://landing-one-beta-58.vercel.app/download") },
          { label: "Source", click: () => shell.openExternal("https://github.com/nickthelegend/kickpact/tree/solana") },
        ],
      },
    ]),
  )
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
