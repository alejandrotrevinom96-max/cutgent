// Lógica PURA de auto-conexión MCP, separada de main.cjs para poder testearla
// sin Electron (node la requiere directo). main.cjs la consume; aquí NO se toca
// `app` ni nada de Electron — solo fs/os/path estándar.
const os = require("os");
const path = require("path");
const fs = require("fs");

/**
 * Mergea la entrada `cutgent` en el JSON de config de un cliente, PRESERVANDO
 * todo lo demás. String-in / string-out, sin tocar disco.
 * @param {string} existingText  Contenido actual ("" o "{}" si vacío).
 * @param {object} entry         Entrada cutgent (command/args/env[/type]).
 * @param {string} rootKey       "mcpServers" (la mayoría) o "servers" (VS Code).
 * @returns {string} JSON pretty (2 espacios) listo para escribir.
 * @throws si existingText NO es JSON válido y NO está vacío (nunca pisar).
 */
function mergeMcpEntry(existingText, entry, rootKey) {
  const trimmed = (existingText || "").trim();
  let root;
  if (trimmed === "") {
    root = {};
  } else {
    root = JSON.parse(trimmed); // lanza si malformado → el caller NO escribe
    if (root === null || typeof root !== "object" || Array.isArray(root)) {
      throw new Error("config raíz no es un objeto JSON");
    }
  }
  if (root[rootKey] == null || typeof root[rootKey] !== "object" || Array.isArray(root[rootKey])) {
    root[rootKey] = {};
  }
  root[rootKey].cutgent = entry; // reemplaza SOLO cutgent; preserva el resto
  return JSON.stringify(root, null, 2);
}

/** Clientes MCP soportados con su ruta de config por plataforma. */
function mcpClientTargets() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const claudeDir = isWin
    ? path.join(appData, "Claude")
    : isMac
      ? path.join(home, "Library", "Application Support", "Claude")
      : path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Claude");

  return [
    { name: "Claude Desktop", file: path.join(claudeDir, "claude_desktop_config.json"), rootKey: "mcpServers", vscode: false, createIfMissing: true },
    { name: "Cursor", file: path.join(home, ".cursor", "mcp.json"), rootKey: "mcpServers", vscode: false, createIfMissing: false },
    { name: "Windsurf", file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), rootKey: "mcpServers", vscode: false, createIfMissing: false },
    { name: "Gemini CLI", file: path.join(home, ".gemini", "settings.json"), rootKey: "mcpServers", vscode: false, createIfMissing: false },
    { name: "Claude Code", file: path.join(home, ".claude.json"), rootKey: "mcpServers", vscode: false, createIfMissing: false },
    // VS Code: .vscode/mcp.json es relativo al proyecto del usuario → no auto.
  ];
}

/**
 * Lee + mergea + escribe (atómico, con .bak) la entrada cutgent en un target.
 * Nunca corrompe: si el JSON está malformado, NO escribe y reporta "error".
 * @param {object} target  {name, file, rootKey, createIfMissing}
 * @param {object} entry   la entrada cutgent a escribir
 * @returns {{status:"connected"|"skipped"|"error", file:string, error?:string}}
 */
function writeMergedConfig(target, entry) {
  const { file, rootKey, createIfMissing } = target;
  try {
    const exists = fs.existsSync(file);
    const dirExists = fs.existsSync(path.dirname(file));
    // Cliente no instalado: ni archivo ni (carpeta + permiso de crear) → saltar.
    if (!exists && !(createIfMissing && dirExists)) {
      return { status: "skipped", file };
    }
    const current = exists ? fs.readFileSync(file, "utf8") : "";
    const merged = mergeMcpEntry(current, entry, rootKey); // lanza si malformado
    if (exists) {
      try { fs.copyFileSync(file, file + ".bak"); } catch { /* best-effort */ }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".cutgent.tmp";
    fs.writeFileSync(tmp, merged);
    fs.renameSync(tmp, file); // atómico en el mismo volumen
    return { status: "connected", file };
  } catch (e) {
    return { status: "error", file, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { mergeMcpEntry, mcpClientTargets, writeMergedConfig };
