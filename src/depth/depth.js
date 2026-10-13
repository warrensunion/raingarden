/**
 * Depth Anything V2 Small in the browser, via onnxruntime-web (browser only).
 *
 * Why this file is tiny and lazy: the model is 27-50 MB and ORT is ~0.4 MB of
 * JS plus 11-22 MB of WASM, so nothing here may load before the user reaches
 * the photo step (the intro must paint without it). Everything is fetched from
 * our own origin (public/models/, public/ort/, put there by
 * scripts/fetch-models.mjs); the photo and its depth never leave the device.
 *
 * Backend: WebGPU when navigator.gpu gives an adapter (onnxruntime-web/webgpu,
 * fp16 model, 50 MB), else WASM (onnxruntime-web/wasm, int8 model, 27 MB). If
 * the WebGPU session fails to build we fall back to WASM once. WASM threads
 * need cross-origin isolation (COOP/COEP headers), which a plain static host
 * does not send, so we use one thread unless crossOriginIsolated is true.
 *
 * Input: the photo is STRETCHED to 518 x 518 (see preprocess.js for why not
 * letterboxed), so normalised coords are shared: (u, v) on the photo is (u, v)
 * on the returned depth map. The photo's aspect (width / height) is returned
 * as `aspect` and must be used for back-projection (heightfield.js reads
 * depth.aspect). EXIF orientation is the caller's job: pass an ImageBitmap
 * made with createImageBitmap(blob, { imageOrientation: 'from-image' }).
 *
 * Output: { w: 518, h: 518, data: Float32Array, aspect, mapping } where data
 * is relative INVERSE depth (larger = nearer, affine-ambiguous), row-major.
 * Verified in Node by scripts/smoke-depth.mjs: input `pixel_values` float32
 * [1, 3, 518, 518], output `predicted_depth` float32 [1, 518, 518], for both
 * the int8 and the fp16 export.
 */

import { preprocess, MODEL_SIZE } from './preprocess.js';

const MODEL_BASE = '/models/depth-anything-v2-small/';
const MODELS = { webgpu: 'model_fp16.onnx', wasm: 'model_quantized.onnx' };

let loading = null;

/**
 * @param {{ onProgress?: (p: { phase: 'download'|'init', loaded: number, total: number, fraction: number }) => void }} [opts]
 * @returns {Promise<{ estimate: (source: ImageBitmap|HTMLCanvasElement|OffscreenCanvas|HTMLImageElement) => Promise<{ w:number, h:number, data:Float32Array, aspect:number, mapping:object }>, backend: 'webgpu'|'wasm', dispose: () => Promise<void> }>}
 */
export function loadDepth({ onProgress } = {}) {
  if (!loading) {
    loading = load(onProgress || (() => {})).catch((err) => {
      loading = null; // allow a retry after a failed load
      throw err;
    });
  }
  return loading;
}

async function hasWebGpu() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    return !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function load(onProgress) {
  const order = (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  for (const backend of order) {
    try {
      const ort = backend === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = '/ort/';
      const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
      const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 1;
      ort.env.wasm.numThreads = isolated ? Math.min(4, cores) : 1;
      const bytes = await fetchWithProgress(MODEL_BASE + MODELS[backend], onProgress);
      onProgress({ phase: 'init', loaded: 0, total: 1, fraction: 1 });
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
      });
      return { backend, estimate: makeEstimate(ort, session), dispose: () => session.release() };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`depth model unavailable: ${lastErr?.message || lastErr}`);
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress({ phase: 'download', loaded: buf.length, total: buf.length, fraction: 1 });
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ phase: 'download', loaded, total, fraction: total ? Math.min(1, loaded / total) : 0 });
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function sourceSize(src) {
  const w = src.naturalWidth || src.videoWidth || src.width;
  const h = src.naturalHeight || src.videoHeight || src.height;
  if (!(w > 0 && h > 0)) throw new Error('depth: source has no size');
  return [w, h];
}

function makeEstimate(ort, session) {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return async function estimate(source) {
    const [sw, sh] = sourceSize(source);
    const S = MODEL_SIZE;
    // The browser's own resampler does the big downscale (and filters it).
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, S, S);
    const { data: rgba } = ctx.getImageData(0, 0, S, S);
    const { tensor, dims, mapping } = preprocess(rgba, S, S, S);
    const feeds = { [inputName]: new ort.Tensor('float32', tensor, dims) };
    const out = await session.run(feeds);
    const t = out[outputName];
    const h = t.dims[t.dims.length - 2];
    const w = t.dims[t.dims.length - 1];
    const data = t.data instanceof Float32Array ? t.data.slice() : Float32Array.from(t.data);
    t.dispose?.();
    return { w, h, data, aspect: sw / sh, mapping: { ...mapping, aspect: sw / sh } };
  };
}
