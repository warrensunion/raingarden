/**
 * Depth Anything V2 inference in a dedicated module Worker.
 *
 * Why a worker: building the ORT session and one inference take from ~1 s
 * (WebGPU) to tens of seconds (single-threaded WASM on a phone). On the main
 * thread that freezes scrolling and the progress UI; here it does not.
 *
 * Protocol (all messages are plain objects):
 *   main -> worker  { type: 'load', backend?: 'webgpu'|'wasm' }  (backend forces one; for testing)
 *   worker -> main  { type: 'progress', phase: 'download'|'init', loaded, total, fraction }
 *                   { type: 'ready', backend: 'webgpu'|'wasm', size }
 *                   { type: 'error', id?, code: 'model-missing'|'backend', message }
 *   main -> worker  { type: 'estimate', id, bitmap: ImageBitmap }  (bitmap transferred)
 *   worker -> main  { type: 'result', id, w, h, data: Float32Array, ms }  (data's buffer transferred)
 *
 * Backend: WebGPU when navigator.gpu gives an adapter (fp16 model, 518 input),
 * else the WASM execution provider (int8 model, 308 input); both through the
 * onnxruntime-web/webgpu build (see load()). A WebGPU failure falls back to WASM once. A missing model is never
 * retried on the other backend's file silently: 'model-missing' is reported.
 * Model bytes are checked against the pinned size (models.js) so an SPA host's
 * index.html is a clear error, not a protobuf parse failure.
 *
 * Input is stretched to size x size (see preprocess.js); OffscreenCanvas does
 * the resize, preprocess() does the NCHW/ImageNet maths.
 */

import { preprocess } from './preprocess.js';
import { MODEL_BASE, MODEL_FILES, SIZE, checkModelResponse, depthError } from './models.js';

let state = null; // { ort, session, backend, size }
let loading = null;

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function hasWebGpu() {
  try {
    if (!self.navigator?.gpu) return false;
    return !!(await self.navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function fetchModel(backend) {
  const url = MODEL_BASE + MODEL_FILES[backend].file;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw depthError('model-missing', `${url}: ${err.message || err}`);
  }
  checkModelResponse({ ok: res.ok, status: res.status, contentType: res.headers.get('content-type') }, backend);
  const total = Number(res.headers.get('content-length')) || MODEL_FILES[backend].bytes;
  let bytes;
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      post({ type: 'progress', phase: 'download', loaded, total, fraction: Math.min(1, loaded / total) });
    }
    bytes = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) {
      bytes.set(c, o);
      o += c.length;
    }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  checkModelResponse({ byteLength: bytes.length }, backend);
  return bytes;
}

async function load(force) {
  const order = force === 'wasm' || force === 'webgpu' ? [force] : (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  const tried = [];
  for (const backend of order) {
    let bytes;
    try {
      bytes = await fetchModel(backend);
    } catch (err) {
      lastErr = err;
      if (err.code === 'model-missing' && backend === 'wasm') throw err;
      continue;
    }
    try {
      // One ORT build for both backends: onnxruntime-web/webgpu's bundle inlines
      // its Emscripten glue, while the /wasm bundle imports
      // ort-wasm-simd-threaded.mjs next to itself at runtime, which broke under
      // Vite's dep pre-bundling in the browser check. The WASM EP runs fine on
      // the JSEP binary; the cost is fetching the 22 MB JSEP .wasm instead of
      // the 11 MB plain one on non-WebGPU devices.
      const ort = await import('onnxruntime-web/webgpu');
      // Only the .wasm binary is pointed at /ort/. The default ("bundle") builds
      // of onnxruntime-web/webgpu and /wasm inline their Emscripten .mjs glue;
      // giving wasmPaths a directory would make ORT import /ort/*.mjs, which the
      // Vite dev server refuses for files in public/ (found in the browser check).
      ort.env.wasm.wasmPaths = { wasm: `${import.meta.env.BASE_URL}ort/ort-wasm-simd-threaded.jsep.wasm` };
      const isolated = self.crossOriginIsolated === true;
      ort.env.wasm.numThreads = isolated ? Math.min(4, self.navigator?.hardwareConcurrency || 1) : 1;
      // ORT prints its node-placement warnings through console.error; only real errors should reach the console
      ort.env.logLevel = 'error';
      post({ type: 'progress', phase: 'init', loaded: 0, total: 1, fraction: 1 });
      const session = await ort.InferenceSession.create(bytes, { executionProviders: [backend], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
      return { ort, session, backend, size: SIZE[backend] };
    } catch (err) {
      tried.push(`${backend}: ${err.message || err}`);
      lastErr = depthError('backend', tried.join(' | '));
    }
  }
  throw lastErr || depthError('backend', 'no backend available');
}

async function estimate(bitmap) {
  const { ort, session, size } = state;
  const t0 = performance.now();
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close?.();
  const { data: rgba } = ctx.getImageData(0, 0, size, size);
  const { tensor, dims } = preprocess(rgba, size, size, size);
  let out;
  try {
    out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', tensor, dims) });
  } catch (err) {
    throw depthError('backend', `inference failed: ${err.message || err}`);
  }
  const t = out[session.outputNames[0]];
  const h = t.dims[t.dims.length - 2];
  const w = t.dims[t.dims.length - 1];
  const data = t.data instanceof Float32Array ? t.data.slice() : Float32Array.from(t.data);
  t.dispose?.();
  return { w, h, data, ms: performance.now() - t0 };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'load') {
    try {
      loading = loading || load(msg.backend);
      state = await loading;
      post({ type: 'ready', backend: state.backend, size: state.size });
    } catch (err) {
      loading = null;
      post({ type: 'error', code: err.code || 'backend', message: err.message || String(err) });
    }
  } else if (msg.type === 'estimate') {
    try {
      if (!state) throw depthError('backend', 'estimate before load');
      const r = await estimate(msg.bitmap);
      post({ type: 'result', id: msg.id, ...r }, [r.data.buffer]);
    } catch (err) {
      post({ type: 'error', id: msg.id, code: err.code || 'backend', message: err.message || String(err) });
    }
  }
};
