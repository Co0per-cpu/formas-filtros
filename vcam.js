// Envía los cuadros de la app a la "OBS Virtual Camera" de Windows.
// Usa la misma memoria compartida que OBS (plugins/win-dshow/shared-memory-queue.c),
// así que basta con tener OBS instalado: no hace falta abrirlo.
const { execFile } = require("child_process");

const NAME = "OBSVirtualCamVideo";
const OBS_CLSID = "{A3FCE0F5-3493-419F-958A-ABA1250EC20B}";
const HEADER = 80;            // sizeof(struct queue_header)
const FRAME_HEADER = 32;
const STATE = { STARTING: 1, READY: 2, STOPPING: 3 };
const align = (n) => (n + 31) & ~31;

let k = null;
function api() {
  if (k) return k;
  const koffi = require("koffi");
  const lib = koffi.load("kernel32.dll");
  k = {
    koffi,
    OpenFileMappingW: lib.func("__stdcall", "OpenFileMappingW", "void *", ["uint32_t", "int", "str16"]),
    CreateFileMappingW: lib.func("__stdcall", "CreateFileMappingW", "void *", ["intptr_t", "void *", "uint32_t", "uint32_t", "uint32_t", "str16"]),
    MapViewOfFile: lib.func("__stdcall", "MapViewOfFile", "void *", ["void *", "uint32_t", "uint32_t", "uint32_t", "uintptr_t"]),
    UnmapViewOfFile: lib.func("__stdcall", "UnmapViewOfFile", "int", ["void *"]),
    CloseHandle: lib.func("__stdcall", "CloseHandle", "int", ["void *"]),
    write: lib.func("__stdcall", "RtlMoveMemory", "void", ["uintptr_t", "void *", "uintptr_t"]),
    read: lib.func("__stdcall", "RtlMoveMemory", "void", ["void *", "uintptr_t", "uintptr_t"]),
  };
  return k;
}

/** Calcula el diseño de la memoria igual que video_queue_create de OBS. */
function layout(cx, cy) {
  const frame = (cx * cy * 3) / 2;
  let size = align(HEADER);
  const offsets = [];
  for (let i = 0; i < 3; i++) { offsets.push(size); size = align(size + frame + FRAME_HEADER); }
  return { frame, offsets, size };
}

function obsInstalled() {
  return new Promise((ok) => {
    if (process.platform !== "win32") return ok(false);
    execFile("reg", ["query", `HKLM\\SOFTWARE\\Classes\\CLSID\\${OBS_CLSID}`], { windowsHide: true }, (err) => ok(!err));
  });
}

let q = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start(cx, cy, fps = 30) {
  stop();
  if (process.platform !== "win32") return { ok: false, error: "La cámara virtual solo funciona en Windows." };
  cx = cx & ~1; cy = cy & ~1;
  if (cx < 16 || cy < 16 || cx > 3840 || cy > 2160) return { ok: false, error: "Tamaño de video no válido." };
  const w = api();
  // Si otra app (normalmente OBS) ya la usa, esperamos un poco: un lector puede tardar en soltarla.
  for (let i = 0; ; i++) {
    const h = w.OpenFileMappingW(4 /* FILE_MAP_READ */, 0, NAME);
    if (!h) break;
    w.CloseHandle(h);
    if (i >= 30) return { ok: false, error: "La cámara virtual ya está en uso. Si OBS la tiene encendida, pulsa “Detener cámara virtual” en OBS." };
    await sleep(50);
  }
  const L = layout(cx, cy);
  const handle = w.CreateFileMappingW(-1, null, 4 /* PAGE_READWRITE */, 0, L.size, NAME);
  if (!handle) return { ok: false, error: "Windows no permitió crear la cámara virtual." };
  const view = w.MapViewOfFile(handle, 0xf001f /* FILE_MAP_ALL_ACCESS */, 0, 0, 0);
  if (!view) { w.CloseHandle(handle); return { ok: false, error: "Windows no permitió preparar la cámara virtual." }; }
  const base = BigInt(w.koffi.address(view));
  const head = Buffer.alloc(HEADER);
  head.writeUInt32LE(STATE.STARTING, 8);
  L.offsets.forEach((o, i) => head.writeUInt32LE(o, 12 + i * 4));
  head.writeUInt32LE(0, 24);               // tipo: video
  head.writeUInt32LE(cx, 28);
  head.writeUInt32LE(cy, 32);
  head.writeBigUInt64LE(BigInt(Math.round(1e7 / fps)), 40);   // intervalo en unidades de 100 ns
  w.write(base, head, HEADER);
  q = { handle, view, base, cx, cy, L, inc: 0 };
  const obs = await obsInstalled();
  return { ok: true, cx, cy, warn: obs ? "" : "No encontré OBS instalado. Instálalo una vez (no hace falta abrirlo) para que aparezca “OBS Virtual Camera”." };
}

function write(frame) {
  if (!q || !frame || frame.length !== q.L.frame) return false;
  const w = api();
  const inc = (q.inc + 1) >>> 0;
  q.inc = inc;
  const u32 = Buffer.alloc(4);
  u32.writeUInt32LE(inc);
  w.write(q.base, u32, 4);                 // write_idx
  const off = BigInt(q.L.offsets[inc % 3]);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64LE(process.hrtime.bigint() / 100n);
  w.write(q.base + off, ts, 8);
  w.write(q.base + off + BigInt(FRAME_HEADER), frame, frame.length);
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(inc, 0);              // read_idx
  tail.writeUInt32LE(STATE.READY, 4);      // state
  w.write(q.base + 4n, tail, 8);
  return true;
}

function stop() {
  if (!q) return;
  const w = api();
  const s = Buffer.alloc(4);
  s.writeUInt32LE(STATE.STOPPING);
  w.write(q.base + 8n, s, 4);
  w.UnmapViewOfFile(q.view);
  w.CloseHandle(q.handle);
  q = null;
}

module.exports = { start, write, stop, layout, NAME, api };
