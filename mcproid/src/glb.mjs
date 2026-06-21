// Minimal, dependency-free GLB (binary glTF) codec. A .vrm file IS a .glb:
// a 12-byte header + a JSON chunk + an optional BIN chunk. We only ever touch
// the JSON chunk (materials, VRM extensions, metadata) and pass the binary
// geometry through untouched — so forging never corrupts the mesh or the rig.

const MAGIC = 0x46546c67; // "glTF"
const JSON_TYPE = 0x4e4f534a; // "JSON"
const BIN_TYPE = 0x004e4942; // "BIN\0"

export function readGlb(buf) {
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error("not a GLB: bad magic");
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    const data = buf.subarray(start, start + len);
    if (type === JSON_TYPE) json = JSON.parse(data.toString("utf8"));
    else if (type === BIN_TYPE) bin = Buffer.from(data);
    off = start + len;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { version, json, bin };
}

function pad(buf, padByte) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, padByte)]);
}

function chunk(data, type) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
}

export function writeGlb({ json, bin = null, version = 2 }) {
  const jsonBuf = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const chunks = [chunk(jsonBuf, JSON_TYPE)];
  if (bin && bin.length) chunks.push(chunk(pad(Buffer.from(bin), 0x00), BIN_TYPE));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}
