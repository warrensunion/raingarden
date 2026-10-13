import test from 'node:test';
import assert from 'node:assert/strict';
import { preprocess, IMAGENET_MEAN, IMAGENET_STD, MODEL_SIZE } from '../src/depth/preprocess.js';

function rgba(w, h, f) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * w + x) * 4;
      a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255;
    }
  }
  return a;
}

const norm = (v, c) => (v / 255 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];

test('model size is 518 (37 x 14 patches)', () => {
  assert.equal(MODEL_SIZE, 518);
  assert.equal(MODEL_SIZE % 14, 0);
});

test('same-size input: NCHW planes with ImageNet mean/std', () => {
  const src = rgba(2, 2, (x, y) => [x * 255, y * 255, 128]);
  const { tensor, dims } = preprocess(src, 2, 2, 2);
  assert.deepEqual(dims, [1, 3, 2, 2]);
  assert.ok(tensor instanceof Float32Array);
  assert.equal(tensor.length, 12);
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} vs ${b}`);
  // R plane, row-major
  close(tensor[0], norm(0, 0)); close(tensor[1], norm(255, 0));
  close(tensor[2], norm(0, 0)); close(tensor[3], norm(255, 0));
  // G plane
  close(tensor[4], norm(0, 1)); close(tensor[5], norm(0, 1));
  close(tensor[6], norm(255, 1)); close(tensor[7], norm(255, 1));
  // B plane
  for (let i = 8; i < 12; i++) close(tensor[i], norm(128, 2));
});

test('stretch: a wide image fills the square, left half stays left half (no letterbox)', () => {
  const src = rgba(8, 2, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]));
  const { tensor, mapping } = preprocess(src, 8, 2, 4);
  assert.equal(mapping.mode, 'stretch');
  // R plane: columns 0..1 red, 2..3 blue, in every row
  for (let y = 0; y < 4; y++) {
    assert.ok(Math.abs(tensor[y * 4 + 0] - norm(255, 0)) < 1e-5);
    assert.ok(Math.abs(tensor[y * 4 + 3] - norm(0, 0)) < 1e-5);
  }
  // normalised image coords are identical on both sides of a stretch
  assert.deepEqual(mapping.toModel([0.25, 0.75]), [0.25, 0.75]);
  assert.deepEqual(mapping.toSource([0.25, 0.75]), [0.25, 0.75]);
  assert.equal(mapping.aspect, 4);
});

test('bilinear downscale averages a checker to grey', () => {
  const src = rgba(4, 4, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
  const { tensor } = preprocess(src, 4, 4, 2);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(tensor[i] - norm(127.5, 0)) < 1e-3, `${tensor[i]}`);
});
