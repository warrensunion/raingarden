/**
 * The one place that names the depth model files, their pinned sizes and
 * hashes, and the input size per backend. Shared by scripts/fetch-models.mjs
 * (which downloads and verifies them) and the browser worker (which refuses
 * anything that is not exactly these bytes).
 *
 * Why the browser checks the size: static/SPA hosts answer a missing
 * /models/x.onnx with index.html and a 200, which ORT then reports as an
 * opaque protobuf parse error. A content-type of text/html or a byte count
 * that is not the pinned one is turned into a clear 'model-missing' error.
 *
 * Input size per backend (ruling): 518 on WebGPU (the size the model was
 * trained at), 308 on WASM (22 x 14 patches, ~2.8x fewer pixels, so roughly
 * 3x faster on a single-threaded phone CPU). Both exports have dynamic H/W.
 * Both must be multiples of 14 (the ViT patch size).
 *
 * Pure module: no DOM.
 */

export const MODEL_BASE = '/models/depth-anything-v2-small/';

export const MODEL_FILES = {
  wasm: {
    file: 'model_quantized.onnx',
    bytes: 27258801,
    sha256: 'fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d',
  },
  webgpu: {
    file: 'model_fp16.onnx',
    bytes: 49642442,
    sha256: '2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04',
  },
};

export const SIZE = { webgpu: 518, wasm: 308 };

/** An Error with a machine-readable code: 'model-missing' | 'backend'. */
export function depthError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Throws a 'model-missing' error unless the response looks like the pinned
 * model. Call with the response status/content-type before reading the body
 * (byteLength omitted) and again with the final byte count.
 * @param {{ ok?: boolean, status?: number, contentType?: string|null, byteLength?: number }} res
 * @param {'webgpu'|'wasm'} backend
 */
export function checkModelResponse({ ok = true, status = 200, contentType = null, byteLength }, backend) {
  const spec = MODEL_FILES[backend];
  if (!spec) throw depthError('backend', `unknown backend ${backend}`);
  const where = MODEL_BASE + spec.file;
  if (!ok) throw depthError('model-missing', `${where}: HTTP ${status} (run npm run fetch-models)`);
  if (contentType && /text\/html/i.test(contentType)) {
    throw depthError('model-missing', `${where}: the server answered with an HTML page, not the model (run npm run fetch-models)`);
  }
  if (byteLength !== undefined && byteLength !== spec.bytes) {
    throw depthError('model-missing', `${where}: ${byteLength} bytes, expected ${spec.bytes} (missing or a different file; run npm run fetch-models)`);
  }
}
