/**
 * Image -> Depth Anything V2 input tensor (pure maths, Node-tested).
 *
 * Why separate from depth.js: depth.js needs a browser (canvas, ORT, WebGPU)
 * and cannot run under `node --test`; the part that is easy to get subtly
 * wrong (channel order, NCHW layout, normalisation, resampling) lives here.
 *
 * Stretch, not letterbox: the photo is resampled to MODEL_SIZE x MODEL_SIZE
 * ignoring aspect. Letterboxing would spend a quarter of the model's pixels
 * on padding for a 4:3 photo (44% for 16:9) and the padded border bleeds into
 * the depth at the edges. Depth Anything is trained on varied aspect ratios
 * and tolerates the squeeze; the depth it returns is a per-pixel quantity, so
 * stretching back is exact in normalised image coordinates: a point at (u, v)
 * in 0..1 on the photo is (u, v) on the depth map. The returned mapping says
 * so and carries the source aspect (w / h), which the back-projection in
 * heightfield.js must use instead of the square map's 1.
 *
 * Resampling is bilinear with pixel centres at (i + 0.5); downscaling by more
 * than 2x should be done by the browser first (depth.js draws onto a 518
 * canvas, which filters properly), so here it normally runs at scale 1.
 */

export const MODEL_SIZE = 518; // 37 x 14 ViT patches; the size the model was trained at
export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, RGBA row-major
 * @param {number} w source width
 * @param {number} h source height
 * @param {number} [size] square model input side
 * @returns {{ tensor:Float32Array, dims:[1,3,number,number], mapping:{ mode:'stretch', aspect:number,
 *            toModel:(uv:[number,number])=>[number,number], toSource:(uv:[number,number])=>[number,number] } }}
 */
export function preprocess(rgba, w, h, size = MODEL_SIZE) {
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  const sx = w / size;
  const sy = h / size;
  const scale = [0, 1, 2].map((c) => 1 / (255 * IMAGENET_STD[c]));
  const bias = [0, 1, 2].map((c) => -IMAGENET_MEAN[c] / IMAGENET_STD[c]);
  for (let y = 0; y < size; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, h - 1);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, w - 1);
      const tx = fx - x0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;
      const o = y * size + x;
      for (let c = 0; c < 3; c++) {
        const top = rgba[i00 + c] + (rgba[i10 + c] - rgba[i00 + c]) * tx;
        const bot = rgba[i01 + c] + (rgba[i11 + c] - rgba[i01 + c]) * tx;
        tensor[c * plane + o] = (top + (bot - top) * ty) * scale[c] + bias[c];
      }
    }
  }
  return {
    tensor,
    dims: [1, 3, size, size],
    mapping: {
      mode: 'stretch',
      aspect: w / h,
      toModel: (uv) => [uv[0], uv[1]],
      toSource: (uv) => [uv[0], uv[1]],
    },
  };
}
