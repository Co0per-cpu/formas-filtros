// Arma la carpeta web/ con la app y todo lo que necesita para funcionar sin internet.
const fs = require("fs");
const path = require("path");
const web = path.join(__dirname, "web"), vendor = path.join(web, "vendor");
fs.rmSync(web, { recursive: true, force: true });
fs.mkdirSync(path.join(vendor, "models"), { recursive: true });
for (const f of ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"]) fs.copyFileSync(path.join(__dirname, f), path.join(web, f));
const nm = (...p) => path.join(__dirname, "node_modules", ...p);
fs.mkdirSync(path.join(vendor, "tasks-vision"), { recursive: true });
fs.copyFileSync(nm("@mediapipe", "tasks-vision", "vision_bundle.mjs"), path.join(vendor, "tasks-vision", "vision_bundle.mjs"));
fs.cpSync(nm("@mediapipe", "tasks-vision", "wasm"), path.join(vendor, "tasks-vision", "wasm"), { recursive: true });
fs.copyFileSync(nm("peerjs", "dist", "peerjs.min.js"), path.join(vendor, "peerjs.min.js"));
fs.copyFileSync(nm("qrcode-generator", "qrcode.js"), path.join(vendor, "qrcode.js"));
const G = "https://storage.googleapis.com/mediapipe-models/";
const models = {
  "hand_landmarker.task": G + "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "blaze_face_short_range.tflite": G + "face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  "selfie_segmenter.tflite": G + "image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
};
(async () => {
  for (const [name, url] of Object.entries(models)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo descargar ${name}: HTTP ${r.status}`);
    fs.writeFileSync(path.join(vendor, "models", name), Buffer.from(await r.arrayBuffer()));
    console.log("modelo listo:", name);
  }
})().catch((e) => { console.error(e); process.exit(1); });
