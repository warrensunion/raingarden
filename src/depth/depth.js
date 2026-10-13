/**
 * Depth Anything V2 Small in the browser: the main-thread face of
 * depth-worker.js (browser only).
 *
 * Why so thin: the model (27-50 MB) and ORT (~0.4 MB JS + 11-22 MB WASM) may
 * not load before the user reaches the photo step, and inference must not
 * block the main thread. So this module only creates a module Worker on the
 * first loadDepth() call and talks to it (protocol in depth-worker.js). All
 * files come from our own origin (public/models/, public/ort/, put there by
 * `npm run fetch-models`); the photo and its depth never leave the device.
 *
 * Backend and size: WebGPU (fp16 model, 518 x 518 input) when available, else
 * WASM (int8 model, 308 x 308). See models.js.
 *
 * API (unchanged from the plan):
 *   loadDepth({ onProgress }) -> Promise<{ estimate(source), backend, size, dispose() }>
 *     - Every call may pass its own onProgress; all listeners get the events
 *       of the single shared load ({ phase, loaded, total, fraction }).
 *     - Rejects with err.code 'model-missing' (file absent, HTML from an SPA
 *       fallback, wrong size) or 'backend' (no WebGPU/WASM session could be
 *       built). A failed load can be retried by calling loadDepth() again.
 *   estimate(source: ImageBitmap|HTMLCanvasElement|HTMLImageElement|OffscreenCanvas|Blob)
 *     -> Promise<{ w, h, data: Float32Array, aspect, mapping, ms }>
 *     - data is relative INVERSE depth (larger = nearer), row-major w x h
 *       (518 or 308 square); aspect is the PHOTO's width / height, which
 *       heightfield.js uses for back-projection; mapping is the stretch
 *       mapping (normalised (u, v) are identical on photo and depth map).
 *     - Calls are serialised: a second estimate waits for the first.
 *     - An ImageBitmap passed in is transferred to the worker (and so
 *       detached); pass a copy if you still need it. Other sources are copied
 *       into a new ImageBitmap first.
 *     - EXIF orientation is the caller's job: make the bitmap with
 *       createImageBitmap(blob, { imageOrientation: 'from-image' }).
 */

let worker = null;
let loading = null;
const listeners = new Set();
let queue = Promise.resolve();
let nextId = 1;
const pending = new Map();

function codeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function startWorker() {
  worker = new Worker(new URL('./depth-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'progress') {
      for (const fn of listeners) {
        try {
          fn({ phase: msg.phase, loaded: msg.loaded, total: msg.total, fraction: msg.fraction });
        } catch {
          /* a listener's bug must not break the load */
        }
      }
    } else if ((msg.type === 'result' || msg.type === 'error') && msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg);
      else p.reject(codeError(msg.code, msg.message));
    } else if (msg.type === 'ready' || (msg.type === 'error' && msg.id == null)) {
      const p = pending.get('load');
      pending.delete('load');
      if (!p) return;
      if (msg.type === 'ready') p.resolve(msg);
      else p.reject(codeError(msg.code, msg.message));
    }
  };
  worker.onerror = (e) => {
    const err = codeError('backend', `depth worker failed: ${e.message || 'unknown error'}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
}

function sourceSize(src) {
  const w = src.naturalWidth || src.videoWidth || src.width;
  const h = src.naturalHeight || src.videoHeight || src.height;
  return [w, h];
}

function makeEstimate(info) {
  return function estimate(source) {
    const run = async () => {
      let bitmap = source;
      if (typeof ImageBitmap === 'undefined' || !(source instanceof ImageBitmap)) bitmap = await createImageBitmap(source);
      const [sw, sh] = sourceSize(bitmap);
      if (!(sw > 0 && sh > 0)) throw codeError('backend', 'depth: source has no size');
      if (!worker) throw codeError('backend', 'depth: disposed');
      const id = nextId++;
      const msg = await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'estimate', id, bitmap }, [bitmap]);
      });
      const aspect = sw / sh;
      return {
        w: msg.w,
        h: msg.h,
        data: msg.data,
        aspect,
        ms: msg.ms,
        mapping: { mode: 'stretch', aspect, inputSize: info.size, toModel: (uv) => [uv[0], uv[1]], toSource: (uv) => [uv[0], uv[1]] },
      };
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };
}

/** Stop sending load progress to fn (a step that closes mid-load). */
export function removeProgressListener(fn) {
  listeners.delete(fn);
}

/**
 * @param {{ onProgress?: (p: { phase: 'download'|'init', loaded: number, total: number, fraction: number }) => void,
 *           backend?: 'webgpu'|'wasm' }} [opts] backend forces one (testing only; only the first load's choice counts)
 */
export function loadDepth({ onProgress, backend } = {}) {
  if (typeof onProgress === 'function') listeners.add(onProgress);
  if (!loading) {
    if (!worker) startWorker();
    loading = new Promise((resolve, reject) => {
      pending.set('load', { resolve, reject });
      worker.postMessage({ type: 'load', backend });
    })
      .then((info) => ({
        backend: info.backend,
        size: info.size,
        estimate: makeEstimate(info),
        dispose: () => {
          worker?.terminate();
          worker = null;
          loading = null;
          listeners.clear();
          // nothing may hang on a disposed model: in-flight estimates reject
          const err = codeError('backend', 'depth: disposed');
          for (const p of pending.values()) p.reject(err);
          pending.clear();
        },
      }))
      .catch((err) => {
        loading = null; // allow a retry
        throw err;
      });
  }
  return loading;
}
