// Servidor Next en producción embebido en Electron. Además sirve /assets y
// /renders desde la carpeta de datos ESCRIBIBLE del usuario (CUTGENT_DATA_DIR),
// con soporte de Range para que el <video> del preview pueda hacer seek.
const { createServer } = require("http");
const { parse } = require("url");
const path = require("path");
const fs = require("fs");
const next = require("next");

const MIME = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml",
};

function serveStatic(req, res, baseDir) {
  const urlPath = decodeURIComponent((parse(req.url).pathname || "").replace(/\/+/g, "/"));
  const filePath = path.normalize(path.join(baseDir, urlPath));
  if (!filePath.startsWith(baseDir)) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
    fs.createReadStream(filePath).pipe(res);
  });
}

/** Autoriza una petición por cookie (UI) o Authorization: Bearer (MCP). */
function authorized(req, token) {
  if (req.headers.authorization === `Bearer ${token}`) return true;
  const m = /(?:^|;\s*)cutgent_token=([^;]+)/.exec(req.headers.cookie || "");
  return !!m && m[1] === token;
}

async function startServer({ appDir, dataDir, token }) {
  const app = next({ dev: false, dir: appDir });
  await app.prepare();
  const handle = app.getRequestHandler();
  const publicData = path.join(dataDir, "public");

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const p = parse(req.url).pathname || "";
      // Protege la superficie de control (/api/*). Estáticos y la UI no.
      if (token && p.startsWith("/api/") && !authorized(req, token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end('{"error":"unauthorized"}');
      }
      if (p.startsWith("/assets/") || p.startsWith("/renders/")) {
        return serveStatic(req, res, publicData);
      }
      return handle(req, res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { startServer };
