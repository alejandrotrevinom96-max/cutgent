// Proceso principal de Electron para Cutgent.
// Arranca el server de Next en producción dentro de la app y abre una ventana
// que lo carga. Redirige TODA la escritura (data/proyectos, assets, renders,
// modelos) a la carpeta del usuario, porque los recursos instalados son de
// solo lectura.
const { app, BrowserWindow, shell, Menu, clipboard, dialog, session, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { mcpClientTargets, writeMergedConfig } = require("./mcp-merge.cjs");

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
  if (app.isPackaged) {
    // Empaquetado: corre el MCP bundleado con el PROPIO Cutgent.exe como Node
    // (sin instalar Node/tsx). Puerto+token se autodescubren vía endpoint.json.
    const serverPath = path.join(process.resourcesPath, "mcp", "cutgent-mcp.cjs");
    return {
      mcpServers: {
        cutgent: { command: process.execPath, args: [serverPath], env: { ELECTRON_RUN_AS_NODE: "1" } },
      },
    };
  }
  // Dev: misma receta que el .mcp.json del repo (npx tsx sobre el index.ts).
  const serverPath = path.join(__dirname, "..", "mcp-server", "index.ts");
  return {
    mcpServers: {
      cutgent: { command: "npx", args: ["tsx", serverPath], env: { CUTGENT_URL: "http://localhost:3000" } },
    },
  };
}

/** Variante de config para VS Code (Copilot agent mode): clave raíz `servers`
 *  + type:"stdio". VS Code NO usa `mcpServers` (es el error #1 al copiar de
 *  Cursor/Claude). El command/args/env son los mismos que para el resto. */
function buildVsCodeConfig() {
  const c = buildMcpConfig().mcpServers.cutgent;
  return { servers: { cutgent: { type: "stdio", command: c.command, args: c.args, env: c.env } } };
}

/**
 * Auto-conexión: detecta los clientes MCP instalados y ESCRIBE (mergea, sin
 * pisar lo demás) la entrada "cutgent" en su config. El cliente solo tiene que
 * reiniciar. Devuelve [{client, status:"connected"|"skipped"|"error", file, error?}].
 * Nunca lanza. La lógica de merge/escritura vive en mcp-merge.cjs (testeable).
 */
function connectClients() {
  const mcpEntry = buildMcpConfig().mcpServers.cutgent;
  const vscodeEntry = buildVsCodeConfig().servers.cutgent;
  return mcpClientTargets().map((t) => {
    const r = writeMergedConfig(t, t.vscode ? vscodeEntry : mcpEntry);
    if (r.status === "connected") log("[connect]", t.name, "OK ->", r.file);
    else if (r.status === "error") log("[connect]", t.name, "ERROR:", r.error);
    return { client: t.name, ...r };
  });
}

// Dónde pegar la config genérica (formato mcpServers) según el cliente.
const MCP_PASTE_HELP =
  "Pega esta config en tu cliente de IA (1 sola vez) y reinícialo:\n\n" +
  "• Claude Desktop → Settings ⚙ → Developer → Edit Config (claude_desktop_config.json).\n" +
  "• Cursor → Settings → Tools & Integrations → MCP, o ~/.cursor/mcp.json.\n" +
  "• Windsurf → ~/.codeium/windsurf/mcp_config.json (ojo: .codeium, NO .windsurf).\n" +
  "• Gemini CLI → ~/.gemini/settings.json.\n" +
  "• JetBrains AI Assistant → Settings → Tools → AI Assistant → MCP → Add → As JSON.\n" +
  "• Claude Code → .mcp.json (raíz del proyecto) o ~/.claude.json.\n\n" +
  'Si el archivo ya tiene "mcpServers", añade DENTRO la entrada "cutgent".\n' +
  "¿Usas VS Code / Copilot? Usa la otra opción del menú (su formato es distinto).\n\n" +
  "Deja Cutgent ABIERTO: tu IA controla esta ventana. Pídele «conéctate a Cutgent y lista mis pistas».";

const VSCODE_PASTE_HELP =
  "Pega esta config en VS Code (Copilot agent mode):\n\n" +
  "• Proyecto: crea el archivo .vscode/mcp.json en la raíz del proyecto.\n" +
  "• Usuario: ejecuta el comando «MCP: Open User Configuration» y pégala ahí.\n\n" +
  'VS Code usa la clave raíz "servers" + "type": "stdio" (NO "mcpServers").\n' +
  "Al guardarla, VS Code (re)inicia el servidor para descubrir las herramientas.\n\n" +
  "Deja Cutgent ABIERTO.";

function setupMenu() {
  const template = [
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "IA / MCP",
      submenu: [
        {
          label: "Conectar automáticamente (detecta tu cliente)",
          click: () => {
            const results = connectClients();
            const connected = results.filter((r) => r.status === "connected");
            const errored = results.filter((r) => r.status === "error");
            const lines = results.map((r) =>
              r.status === "connected"
                ? `✓ ${r.client}`
                : r.status === "skipped"
                  ? `– ${r.client} (no instalado)`
                  : `✗ ${r.client}: ${r.error}`,
            );
            dialog.showMessageBox({
              type: connected.length ? "info" : "warning",
              title: "Conectar tu IA a Cutgent",
              message: connected.length
                ? `Conecté Cutgent a: ${connected.map((r) => r.client).join(", ")}.`
                : "No detecté ningún cliente de IA para conectar.",
              detail:
                lines.join("\n") +
                (connected.length
                  ? "\n\nREINICIA esos clientes para terminar (Quit + Reopen; en VS Code: Reload Window). Deja Cutgent ABIERTO."
                  : "\n\nUsa «Copiar config MCP» y pégala a mano.") +
                (errored.length ? "\n\nSi un cliente dio error, ciérralo y reintenta." : ""),
            });
          },
        },
        { type: "separator" },
        {
          label: "Copiar config MCP (Claude · Cursor · Windsurf · Gemini · JetBrains…)",
          click: () => {
            clipboard.writeText(JSON.stringify(buildMcpConfig(), null, 2));
            dialog.showMessageBox({
              type: "info",
              title: "Conectar tu IA a Cutgent",
              message: "Configuración MCP copiada al portapapeles.",
              detail: MCP_PASTE_HELP,
            });
          },
        },
        {
          label: "Copiar config MCP (VS Code / Copilot)",
          click: () => {
            clipboard.writeText(JSON.stringify(buildVsCodeConfig(), null, 2));
            dialog.showMessageBox({
              type: "info",
              title: "Conectar VS Code a Cutgent",
              message: "Config MCP (VS Code) copiada al portapapeles.",
              detail: VSCODE_PASTE_HELP,
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

// process.cwd() debe apuntar al código (Remotion bundler lo usa en render).
// Se hace DESPUÉS de definir log() para REGISTRAR un fallo en vez de tragarlo.
try {
  process.chdir(appDir);
} catch (e) {
  log("[chdir] no se pudo cambiar a appDir:", e?.message || e);
}

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
/** URL base de la app (dev: localhost; prod: 127.0.0.1:<port>). La fija createWindow. */
let appBaseUrl = "http://localhost:3000";
/** Ventana de preview desprendible (una sola). */
let previewWin = null;

/** Abre (o enfoca) la ventana de preview en el 2º monitor a pantalla completa. */
function openPreviewWindow() {
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.focus();
    return;
  }
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const ext = displays.find((d) => d.id !== primary.id) || primary;
  previewWin = new BrowserWindow({
    x: ext.bounds.x + 40,
    y: ext.bounds.y + 40,
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    title: "Cutgent — Preview",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      // La ventana nunca recibe gesto de usuario propio; permite reproducir.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  previewWin.removeMenu?.();
  // En prod, no abrir antes de que el servidor esté listo (evita ventana fantasma).
  if (app.isPackaged && !serverInfo) {
    log("[preview] servidor aún no listo");
    previewWin.destroy();
    previewWin = null;
    return;
  }
  if (ext.id !== primary.id) previewWin.setFullScreen(true);
  previewWin.loadURL(`${appBaseUrl}/preview`).catch(() => {});
  previewWin.on("closed", () => { previewWin = null; });
}

ipcMain.handle("cutgent:open-preview", () => {
  try { openPreviewWindow(); } catch (e) { log("[preview] error", e && e.message); }
  return true;
});

ipcMain.handle("cutgent:connect-clients", () => {
  try {
    return connectClients();
  } catch (e) {
    log("[connect] fatal", e && e.message);
    return [{ client: "?", status: "error", error: e && e.message ? e.message : String(e) }];
  }
});

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
      log("[updater] desactivado: configura build.publish.owner (package.json) con tu repo real.");
      return;
    }
    const { autoUpdater } = require("electron-updater");
    autoUpdater.logger = { info: (m) => log("[updater]", m), warn: (m) => log("[updater]", m), error: (m) => log("[updater]", m), debug: () => {} };
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", () => log("[updater] actualización descargada; se instalará al cerrar."));
    autoUpdater.on("error", (e) => log("[updater]", e?.message || e));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    // Re-chequea cada 4 horas para sesiones largas.
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch (e) {
    log("[updater] no disponible:", e?.message || e);
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

  // Mostrar la ventana en cuanto haya algo que pintar. IMPORTANTE: registramos
  // estos handlers ANTES de `await win.loadURL(...)`. Si se registraran después,
  // `ready-to-show` (que se dispara durante la carga) podría perderse y la
  // ventana quedaría oculta para siempre: proceso vivo en el Task Manager pero
  // sin ventana visible. Usamos un guard para mostrarla una sola vez y un
  // salvavidas por timeout por si ningún evento llegara a dispararse.
  let shown = false;
  const reveal = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
    log("[window] visible");
  };
  win.once("ready-to-show", reveal);
  win.webContents.once("did-finish-load", reveal);
  const revealTimer = setTimeout(reveal, 15000);
  win.once("closed", () => clearTimeout(revealTimer));

  // Cualquier fallo se muestra como página de error VISIBLE (nunca ventana fantasma).
  const showError = (detail) => {
    log("[error]", detail);
    win.loadURL(errorPage(detail)).catch(() => {});
    reveal();
  };

  // Abre enlaces externos en el navegador del sistema; los del MISMO origin
  // (p.ej. /preview como fallback) se permiten como ventana interna.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.startsWith(appBaseUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (code === -3) return; // abortos benignos (navegación cancelada)
    log("did-fail-load:", code, desc, url);
    if (!String(url).startsWith("data:")) showError(`No se pudo cargar la app (${code} ${desc}).`);
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    log("render-process-gone:", d && d.reason);
    showError(`El proceso de la interfaz terminó inesperadamente (${d && d.reason}).`);
  });

  if (isDev) {
    appBaseUrl = "http://localhost:3000";
    await win.loadURL("http://localhost:3000");
  } else {
    try {
      ensureModels();
      const { startServer } = require("./server.cjs");
      // Timeout: si prepare()/listen se cuelga, surge como error visible y NO
      // deja la ventana invisible para siempre.
      serverInfo = await Promise.race([
        startServer({ appDir, dataDir: userData, token: AUTH_TOKEN }),
        new Promise((_r, rej) => setTimeout(() => rej(new Error("El servidor tardó demasiado en iniciar (timeout 30s).")), 30000)),
      ]);
      const baseUrl = `http://127.0.0.1:${serverInfo.port}`;
      appBaseUrl = baseUrl;
      log("[server] escuchando en", baseUrl, "pid", process.pid);
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
      log("[window] cargando", baseUrl);
      await win.loadURL(baseUrl);
    } catch (e) {
      showError(e?.stack || e?.message || String(e));
    }
  }
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
