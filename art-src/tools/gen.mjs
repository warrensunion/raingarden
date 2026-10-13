/**
 * Generates the art in art-src/manifest.mjs through ChatGPT image generation
 * (the gpt-image-bridge wrapper: codex CLI, signed in with the ChatGPT Plus
 * subscription), a few at a time, into art-src/gen/<name>.png.
 *
 * Why a runner: ~80 images at 4-6 minutes each only fit in a night when
 * several run at once, and a crash or a rate limit must not lose the ones
 * already made - an image that exists is skipped, so re-running resumes.
 * Every prompt is appended to art-src/PROMPTS.md as it is sent, with the
 * STYLE block written out once at the top of that file (and prepended here).
 *
 * usage: node art-src/tools/gen.mjs [--only name,name] [--group comps] [--jobs 4] [--dry]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { STYLE, CUTOUT, ITEMS } from '../manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'art-src/gen');
const LOG = path.join(ROOT, 'art-src/PROMPTS.md');
const BRIDGE = path.join(os.homedir(), '.claude/skills/gpt-image-bridge/bin/gpt-image-2');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const only = arg('only', '') ? new Set(arg('only').split(',')) : null;
const group = arg('group', '');
const jobs = Number(arg('jobs', 4));
const dry = args.includes('--dry');

const todo = ITEMS.filter((it) => (!only || only.has(it.name)) && (!group || it.group === group))
  .filter((it) => !fs.existsSync(path.join(OUT, `${it.name}.png`)));

export const fullPrompt = (it) =>
  `${STYLE}\n\nSUBJECT: ${it.prompt}${it.cutout ? `\n\n${CUTOUT}` : ''}`;

console.log(`${todo.length} to generate, ${jobs} at a time`);
if (dry) { for (const it of todo) console.log(it.name, it.size || ''); process.exit(0); }

const failed = [];
function run(it) {
  return new Promise((resolve) => {
    const out = path.join(OUT, `${it.name}.png`);
    const a = [BRIDGE, fullPrompt(it), out];
    if (it.size) a.push('--size', it.size);
    fs.appendFileSync(LOG, `\n### ${it.name}${it.size ? ` (${it.size})` : ''}\n\n${it.prompt}${it.cutout ? '\n\n+ CUTOUT line' : ''}\n`);
    const t0 = Date.now();
    const p = spawn('bash', a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      const s = ((Date.now() - t0) / 1000) | 0;
      if (code === 0 && fs.existsSync(out)) console.log(`ok   ${it.name} ${s}s`);
      else { console.log(`FAIL ${it.name} ${s}s\n${err.slice(-600)}`); failed.push(it.name); }
      resolve();
    });
  });
}

const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) await run(queue.shift());
}));
console.log(failed.length ? `failed: ${failed.join(',')}` : 'all done');
