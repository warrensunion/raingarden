import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FILES, SIZE, checkModelResponse } from '../src/depth/models.js';
import { MODELS } from '../scripts/fetch-models.mjs';

const code = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return 'ok';
};

test('per-backend input sizes are multiples of 14 (ruling: 518 / 308)', () => {
  assert.deepEqual(SIZE, { webgpu: 518, wasm: 308 });
  for (const s of Object.values(SIZE)) assert.equal(s % 14, 0);
});

test('an SPA index.html answer is model-missing, not a protobuf error', () => {
  assert.equal(code(() => checkModelResponse({ contentType: 'text/html; charset=utf-8' }, 'wasm')), 'model-missing');
  assert.equal(code(() => checkModelResponse({ ok: false, status: 404 }, 'webgpu')), 'model-missing');
});

test('a wrong byte count is model-missing; the pinned count passes', () => {
  assert.equal(code(() => checkModelResponse({ contentType: 'application/octet-stream', byteLength: 1234 }, 'wasm')), 'model-missing');
  assert.equal(code(() => checkModelResponse({ contentType: 'application/octet-stream', byteLength: MODEL_FILES.wasm.bytes }, 'wasm')), 'ok');
  assert.equal(code(() => checkModelResponse({ contentType: null }, 'webgpu')), 'ok');
});

test('unknown backend is a backend error', () => {
  assert.equal(code(() => checkModelResponse({}, 'webgl')), 'backend');
});

test('fetch-models pins the same files, sizes and hashes as the browser checks', () => {
  const byFile = Object.fromEntries(MODELS.map((m) => [m.file, m]));
  for (const spec of Object.values(MODEL_FILES)) {
    assert.equal(byFile[spec.file].bytes, spec.bytes);
    assert.equal(byFile[spec.file].sha256, spec.sha256);
  }
});
