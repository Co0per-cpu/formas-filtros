// Prueba en Windows: escribe un cuadro y lo vuelve a leer desde la memoria compartida.
const path = require("path");
const vcam = require(process.argv[2] ? path.resolve(process.argv[2]) : "./vcam.js");
(async () => {
  const r = await vcam.start(64, 48, 30);
  if (!r.ok) throw new Error(r.error);
  const L = vcam.layout(64, 48);
  if (L.offsets[0] !== 96) throw new Error("offset inesperado " + L.offsets[0]);
  const frame = Buffer.alloc(L.frame); for (let i = 0; i < frame.length; i++) frame[i] = i & 255;
  if (!vcam.write(frame)) throw new Error("write devolvió false");
  const w = vcam.api();
  const h = w.OpenFileMappingW(4, 0, vcam.NAME);
  if (!h) throw new Error("no se pudo abrir la memoria para leer");
  const v = w.MapViewOfFile(h, 4, 0, 0, 0);
  const base = BigInt(w.koffi.address(v));
  const head = Buffer.alloc(80); w.read(head, base, 80);
  const got = { write: head.readUInt32LE(0), read: head.readUInt32LE(4), state: head.readUInt32LE(8),
    off: [12, 16, 20].map((o) => head.readUInt32LE(o)), cx: head.readUInt32LE(28), cy: head.readUInt32LE(32),
    interval: head.readBigUInt64LE(40).toString() };
  console.log(got);
  const back = Buffer.alloc(L.frame); w.read(back, base + BigInt(L.offsets[1] + 32), L.frame);
  if (got.write !== 1 || got.read !== 1 || got.state !== 2 || got.cx !== 64 || got.cy !== 48 || got.interval !== "333333") throw new Error("cabecera incorrecta");
  if (got.off.join() !== L.offsets.join()) throw new Error("offsets incorrectos");
  if (!back.equals(frame)) throw new Error("el cuadro leído no coincide");
  w.UnmapViewOfFile(v); w.CloseHandle(h); vcam.stop();
  console.log("cámara virtual OK");
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
