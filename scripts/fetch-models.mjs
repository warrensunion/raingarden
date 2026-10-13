/**
 * Puts the depth model and the onnxruntime-web runtime on this server, pinned.
 *
 *   node scripts/fetch-models.mjs                 download/copy what is missing, verify everything
 *   node scripts/fetch-models.mjs --check         verify what is on disk, download nothing
 *   node scripts/fetch-models.mjs --print-hashes  print the SHA-256 of each file (to re-pin)
 *
 * Why a script: the app promises the photo never leaves the phone, and that
 * the depth model is never fetched from a CDN at runtime. So the model
 * (Depth Anything V2 Small, onnx-community export) and ORT's WASM/JSEP
 * binaries are served from our own origin under public/models/ and public/ort/.
 * Those are ~110 MB of someone else's binaries, so they are gitignored and
 * rebuilt from this file; every file is SHA-256 pinned so "main" on Hugging
 * Face or a different onnxruntime-web install cannot drift underneath us.
 *
 * Which files: model_quantized.onnx (int8, 27 MB) for the WASM backend and
 * model_fp16.onnx (50 MB) for WebGPU; both exist in the repo's onnx/ folder
 * (checked 2026-10-13 via the HF tree API, whose LFS oids are these SHA-256s).
 * The runtime is ort-wasm-simd-threaded.{wasm,mjs} (plain WASM EP) and the
 * .jsep.{wasm,mjs} pair (the WebGPU build, used by onnxruntime-web/webgpu),
 * copied from node_modules/onnxruntime-web/dist of the pinned 1.22.0.
 *
 * Modelled on BTTRURSLF-v2/scripts/fetch-mediapipe.mjs.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODEL_FILES } from '../src/depth/models.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = join(ROOT, 'public', 'models', 'depth-anything-v2-small');
const ORT_DIR = join(ROOT, 'public', 'ort');
const ORT_DIST = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');

const HF = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main';
// Files, sizes and hashes live in src/depth/models.js so the browser checks the same pins.
export const MODELS = Object.values(MODEL_FILES).map((m) => ({ ...m, url: `${HF}/onnx/${m.file}` }));

export const ORT_VERSION = '1.22.0';
export const ORT_FILES = {
  'ort-wasm-simd-threaded.wasm': '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4',
  'ort-wasm-simd-threaded.mjs': '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8',
  'ort-wasm-simd-threaded.jsep.wasm': 'b45970d0632383a057c27ca5b660b216f8e00c17cf8db9f6207b5e4abc839368',
  'ort-wasm-simd-threaded.jsep.mjs': '1cbcba8f2c769c1eecbab66a1b1e55ef11704515bf4306373e3db3c37cf6dcd8',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const hashFile = (path) => (existsSync(path) ? sha256(readFileSync(path)) : null);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has('--check');
  const printHashes = args.has('--print-hashes');
  const problems = [];

  if (!check && !printHashes) {
    mkdirSync(MODEL_DIR, { recursive: true });
    mkdirSync(ORT_DIR, { recursive: true });
    for (const m of MODELS) {
      const path = join(MODEL_DIR, m.file);
      if (hashFile(path) === m.sha256) {
        console.log(`have ${m.file}`);
        continue;
      }
      console.log(`fetching ${m.file} (${(m.bytes / 1e6).toFixed(1)} MB)`);
      const buf = await download(m.url);
      const got = sha256(buf);
      if (got !== m.sha256) throw new Error(`${m.file}: sha256 ${got} is not the pinned ${m.sha256}; not written`);
      writeFileSync(path, buf);
    }
    const pkgPath = join(ROOT, 'node_modules', 'onnxruntime-web', 'package.json');
    if (!existsSync(pkgPath)) throw new Error('node_modules/onnxruntime-web is missing: run npm install first');
    const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    if (version !== ORT_VERSION) problems.push(`onnxruntime-web is ${version}, pinned ${ORT_VERSION}`);
    for (const [name, pin] of Object.entries(ORT_FILES)) {
      const from = join(ORT_DIST, name);
      // verify the source before it reaches public/: a wrong file is never served
      const h = hashFile(from);
      if (!h) problems.push(`node_modules/onnxruntime-web/dist has no ${name}`);
      else if (h !== pin) problems.push(`node_modules/onnxruntime-web/dist/${name}: sha256 ${h} is not the pinned ${pin}; not copied`);
      else copyFileSync(from, join(ORT_DIR, name));
    }
  }

  const hashes = { models: {}, ort: {} };
  for (const m of MODELS) {
    const rel = `public/models/depth-anything-v2-small/${m.file}`;
    const h = hashFile(join(MODEL_DIR, m.file));
    hashes.models[m.file] = h;
    if (printHashes) console.log(`  ${rel}: ${h ?? 'missing'}`);
    else if (!h) problems.push(`missing ${rel}`);
    else if (h !== m.sha256) problems.push(`${rel}: sha256 ${h} is not the pinned ${m.sha256}`);
  }
  for (const [name, pin] of Object.entries(ORT_FILES)) {
    const rel = `public/ort/${name}`;
    const h = hashFile(join(ORT_DIR, name));
    hashes.ort[name] = h;
    if (printHashes) console.log(`  ${rel}: ${h ?? 'missing'}`);
    else if (!h) problems.push(`missing ${rel}`);
    else if (h !== pin) problems.push(`${rel}: sha256 ${h} is not the pinned ${pin}`);
  }

  if (problems.length) {
    for (const p of problems) console.error(`  x ${p}`);
    if (!check) console.error('(a model mismatch means Hugging Face "main" moved; an ORT mismatch means a different onnxruntime-web install)');
    process.exit(1);
  }
  if (!printHashes) {
    if (!check) {
      writeFileSync(
        join(MODEL_DIR, 'VERSION.json'),
        JSON.stringify({ model: 'onnx-community/depth-anything-v2-small', ort: ORT_VERSION, ...hashes, fetchedAt: new Date().toISOString() }, null, 2),
      );
    }
    console.log(`ok: ${MODELS.length} model files and ${Object.keys(ORT_FILES).length} ORT ${ORT_VERSION} runtime files verified`);
  }
}

// Run only when invoked as a script (tests import the pins).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
