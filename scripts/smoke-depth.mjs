/**
 * Node smoke test of the fetched depth model: loads both ONNX files with
 * onnxruntime-web's WASM backend, prints their input/output names, types and
 * shapes, and runs the int8 model once on a synthetic image through the same
 * preprocess() the browser uses. Not part of `npm test` (a single-threaded run
 * takes ~1 min on a loaded laptop); run it after fetch-models.mjs when the
 * model or ORT version changes:  node scripts/smoke-depth.mjs
 *
 * What it established (2026-10-13, ORT 1.22.0): both files take
 * pixel_values float32 [B, 3, H, W] and return predicted_depth float32
 * [B, H, W] (518 x 518 for a 518 input); the fp16 export keeps float32 I/O.
 * Larger output = nearer (relative inverse depth).
 */
import * as ort from 'onnxruntime-web';
import { readFileSync } from 'node:fs';
import { preprocess } from '../src/depth/preprocess.js';
ort.env.wasm.numThreads = 1;
for (const f of ['model_quantized.onnx', 'model_fp16.onnx']) {
  const t0 = Date.now();
  const s = await ort.InferenceSession.create(readFileSync('public/models/depth-anything-v2-small/' + f), { executionProviders: ['wasm'] });
  console.log(f, 'in', s.inputNames, 'out', s.outputNames, s.inputMetadata?.map?.((m) => [m.name, m.type, m.shape]), s.outputMetadata?.map?.((m) => [m.name, m.type, m.shape]), 'load ms', Date.now() - t0);
  if (f !== 'model_quantized.onnx') continue;
  // synthetic "ground" image: bright at bottom, darker going up, with texture
  const w = 640, h = 480, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4; const c = 60 + 150 * y / h + 30 * (((x >> 4) + (y >> 4)) & 1); px[i]=c*0.6; px[i+1]=c; px[i+2]=c*0.5; px[i+3]=255; }
  const { tensor, dims } = preprocess(px, w, h);
  const t1 = Date.now();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', tensor, dims) });
  const o = out[s.outputNames[0]];
  let mn = Infinity, mx = -Infinity; for (const v of o.data) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const W = o.dims.at(-1), Hh = o.dims.at(-2);
  console.log('out dims', o.dims, o.type, 'min', mn, 'max', mx, 'top-centre', o.data[10 * W + (W >> 1)], 'bottom-centre', o.data[(Hh - 10) * W + (W >> 1)], 'run ms', Date.now() - t1);
}
