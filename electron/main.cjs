// Proceso principal de Electron para Cutgent.
// Arranca el server de Next en producción dentro de la app y abre una ventana
// que lo carga. Redirige TODA la escritura (data/proyectos, assets, renders,
// modelos) a la carpeta del usuario, porque los recursos instalados son de
// solo lectura.
const { app, BrowserWindow, shell, Menu, clipboard, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Token de sesión: protege el server local (127.0.0.1) para que no lo controle
// cualquier proceso de la máquina. La UI lo lleva por cookie (automática); el
// servidor MCP por Authorization: Bearer (vía endpoint.json).
const AUTH_TOKEN = crypto.randomBytes(24).toString("hex");

/**
 * Configuración MCP lista para pegar en el cliente de IA del dueño (Claude
 * Desktop / Claude Code / cualquier cliente MCP). Apunta al PROPIO Cutgent.exe
 * corriendo como Node (ELECTRON_RUN_AS_NODE) sobre el servidor MCP empaquetado
 * → NO requiere instalar Node ni tsx. El servidor descubre el puerto solo
 * (endpoint.json), así que no hay nada que configurar a mano.
 */
function buildMcpConfig() {
  const isPkg = app.isPackaged;
  const serverPath = isPkg
    ? path.join(process.resourcesPath, "mcp", "cutgent-mcp.cjs")
    : path.join(__dirname, "..", "mcp-server", "index.ts");
  return {
    mcpServers: {
      cutgent: {
        command: process.execPath,
        args: isPkg ? [serverPath] : ["--import", "tsx", serverPath],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      },
    },
  };
}

function setupMenu() {
  const template = [
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "IA / MCP",
      submenu: [
        {
          label: "Copiar configuración para conectar mi IA",
          click: () => {
            const cfg = JSON.stringify(buildMcpConfig(), null, 2);
            clipboard.writeText(cfg);
            dialog.showMessageBox({
              type: "info",
              title: "Conectar tu IA a Cutgent",
              message: "Configuración MCP copiada al portapapeles.",
              detail:
                "Pégala en la config de tu cliente de IA (p. ej. Claude Desktop → Developer → Edit Config, o claude_desktop_config.json) y reinícialo.\n\nCutgent debe estar ABIERTO para que tu IA lo controle.",
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const isDev = !app.isPackaged;
// En empaquetado, el código vive en resources/app (asar:false). En dev, la raíz
// del repo es el padre de electron/.
const appDir = path.join(__dirname, "..");
const userData = app.getPath("userData");

// Carpeta de datos escribible (la leen las rutas vía CUTGENT_DATA_DIR).
process.env.CUTGENT_DATA_DIR = userData;
// process.cwd() debe apuntar al código (src/remotion lo usa el bundler de
// Remotion en tiempo de render).
try {
  process.chdir(appDir);
} catch {
  /* ignore */
}

// Log a archivo (para soporte): userData/logs/main.log.
const LOG_FILE = path.join(userData, "logs", "main.log");
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
  console.error(...args);
}
process.on("uncaughtException", (e) => log("uncaughtException:", e));
process.on("unhandledRejection", (e) => log("unhandledRejection:", e));

/** Página de error legible (en vez de ventana en blanco). */
function errorPage(detail) {
  const safe = String(detail).replace(/</g, "&lt;");
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<html><body style="font-family:system-ui;background:#0c0d13;color:#e8eaf2;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div style="max-width:560px;padding:32px"><h2>Cutgent no pudo arrancar</h2><p style="color:#8b8fa3">Reinicia la app. Si persiste, revisa el log:</p><pre style="white-space:pre-wrap;background:#161823;padding:12px;border-radius:8px;text-align:left;font-size:12px">${path.join(userData, "logs", "main.log")}\n\n${safe}</pre></div></body></html>`,
  )}`;
}

/** Copia los modelos incluidos (resources/models) a userData/models la 1ª vez. */
function ensureModels() {
  const dest = path.join(userData, "models");
  if (fs.existsSync(dest)) return;
  const bundled = isDev
    ? path.join(appDir, "models")
    : path.join(process.resourcesPath, "models");
  if (fs.existsSync(bundled)) {
    fs.cpSync(bundled, dest, { recursive: true });
  }
}

let serverInfo = null;

/**
 * Auto-actualización: al arrancar (solo empaquetado) comprueba si hay una nueva
 * versión publicada (GitHub Releases, según `build.publish` en package.json), la
 * descarga en segundo plano y la instala al cerrar. Así las mejoras llegan a
 * TODOS los clientes sin reinstalar. Falla en silencio si no hay red/feed.
 * NOTA: en macOS la auto-actualización REQUIERE firma (Apple); en Windows
 * (NSIS) funciona sin firmar (con aviso de SmartScreen).
 */
function setupAutoUpdate() {
  if (isDev) return;
  try {
    // No intentes actualizar contra un repo placeholder (404 silencioso). Hay
    // que configurar build.publish.owner con el repo real antes de distribuir.
    let owner = "";
    try {
      owner = require(path.join(appDir, "package.json"))?.build?.publish?.[0]?.owner || "";
    } catch {
      /* ignore */
    }
    if (!owner || owner.includes("CAMBIAME")) {
      console.warn("[updater] desactivado: configura build.publish.owner (package.json) con tu repo real.");
      return;
    }
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", () => {
      // Se instala al cerrar; opcionalmente se puede forzar quitAndInstall().
      console.log("[updater] actualización descargada; se instalará al cerrar.");
    });
    autoUpdater.on("error", (e) => console.error("[updater]", e?.message || e));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    // Re-chequea cada 4 horas para sesiones largas.
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch (e) {
    console.error("[updater] no disponible:", e?.message || e);
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0c0d13",
    show: false,
    title: "Cutgent",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });

  // Abre enlaces externos en el navegador del sistema, no en la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (code === -3) return; // abortos benignos
    log("did-fail-load:", code, desc, url);
  });

  if (isDev) {
    await win.loadURL("http://localhost:3000");
  } else {
    try {
      ensureModels();
      const { startServer } = require("./server.cjs");
      serverInfo = await startServer({ appDir, dataDir: userData, token: AUTH_TOKEN });
      const baseUrl = `http://127.0.0.1:${serverInfo.port}`;
      // La UI lleva el token por cookie (se envía sola en fetch/EventSource/<video>).
      try {
        await session.defaultSession.cookies.set({
          url: baseUrl,
          name: "cutgent_token",
          value: AUTH_TOKEN,
          sameSite: "lax",
        });
      } catch (e) {
        log("[auth] no se pudo fijar la cookie:", e?.message || e);
      }
      // Publica el endpoint + token para que el servidor MCP (cliente de IA) se
      // conecte sin configuración.
      try {
        fs.writeFileSync(
          path.join(userData, "endpoint.json"),
          JSON.stringify({ url: baseUrl, pid: process.pid, token: AUTH_TOKEN }),
        );
      } catch (e) {
        log("[endpoint] no se pudo escribir:", e?.message || e);
      }
      await win.loadURL(baseUrl);
    } catch (e) {
      log("Fallo al arrancar el servidor:", e);
      await win.loadURL(errorPage(e?.stack || e?.message || e));
    }
  }
  win.once("ready-to-show", () => win.show());
}

// Una sola instancia: dos Cutgent a la vez pisarían endpoint.json (rompiendo la
// conexión MCP) y levantarían dos servidores. La 2ª instancia enfoca la 1ª.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  app.whenReady().then(() => {
    setupMenu();
    createWindow();
    setupAutoUpdate();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  serverInfo?.server?.close();
});
