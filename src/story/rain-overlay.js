/**
 * Full-screen falling rain over the story, in raw WebGL2.
 *
 * Why WebGL and not CSS: a thousand streaks as DOM nodes would cost more per
 * frame than the whole story. Why raw WebGL2 and not three.js: three must
 * stay out of the intro bundle (constraints.md), and one instanced quad needs
 * no scene graph. Streaks lean 12°, density follows the scene's `rain`
 * intensity, and speed rises a little with scroll velocity so a fast scroll
 * feels like a gust. No WebGL2: logged, and no overlay (the plates are
 * painted wet already).
 */
import { env, logFallback } from '../core/env.js';
import { follow } from '../core/ease.js';
import { onFrame } from '../core/raf.js';

const ANGLE = (12 * Math.PI) / 180;

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 seed;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRes;
uniform float uDpr;
out float vT;
out float vA;
void main() {
  float spd = mix(0.95, 1.7, seed.z) * uSpeed;
  float lenPx = mix(0.035, 0.11, seed.w) * uRes.y;
  float fall = fract(seed.y + uTime * spd * 0.55);
  float yPx = (fall * 1.25 - 0.12) * uRes.y;
  vec2 dir = vec2(-sin(${ANGLE.toFixed(5)}), cos(${ANGLE.toFixed(5)}));
  float spanX = uRes.x + uRes.y * 0.35;
  vec2 head = vec2(seed.x * spanX + yPx * dir.x / dir.y, yPx);
  vec2 perp = vec2(dir.y, -dir.x);
  vec2 pos = head - dir * lenPx * corner.y + perp * corner.x * mix(0.8, 1.6, seed.w) * uDpr;
  vT = corner.y;
  vA = mix(0.35, 1.0, fract(seed.x * 37.0 + seed.y * 11.0));
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
uniform float uAlpha;
uniform vec3 uColor;
in float vT;
in float vA;
out vec4 o;
void main() {
  float a = uAlpha * vA * (1.0 - vT) * smoothstep(0.0, 0.15, vT + 0.02);
  o = vec4(uColor * a, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/** Reads a colour token from tokens.css as 0..1 RGB (colours live only in tokens). */
function tokenRgb(name) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16) || 0xece6da;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Starts the overlay in `canvas`; returns null (logged) when WebGL2 is unavailable. */
export function startRain(canvas) {
  if (!env.webgl2) {
    logFallback('rain overlay', env.webgl2Reason);
    return null;
  }
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) {
    logFallback('rain overlay', 'getContext("webgl2") returned null');
    return null;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    logFallback('rain overlay', 'shader failed: ' + err.message);
    return null;
  }

  const MAX = env.phone ? 380 : 900;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const seeds = new Float32Array(MAX * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  const u = (n) => gl.getUniformLocation(prog, n);
  const uTime = u('uTime'), uSpeed = u('uSpeed'), uRes = u('uRes'), uDpr = u('uDpr'), uAlpha = u('uAlpha'), uColor = u('uColor');
  gl.useProgram(prog);
  gl.uniform3fv(uColor, tokenRgb('--paper'));
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  let intensity = 0, shown = 0, velocity = 0, speed = 1, time = 0, lost = false;
  let cleared = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    canvas.style.opacity = '0';
    logFallback('rain overlay', 'WebGL context lost');
  });

  const off = onFrame((dt) => {
    if (lost) return;
    const want = env.reducedMotion ? 0 : intensity;
    shown += (want - shown) * follow(dt, 0.25);
    speed += (1 + Math.min(Math.abs(velocity) / 4000, 0.5) - speed) * follow(dt, 0.3);
    time += dt * speed;
    const n = Math.round(MAX * shown);
    // Nothing to draw: clear once, then leave the GPU alone.
    if (n <= 0) {
      if (!cleared) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); canvas.style.opacity = '0'; cleared = true; }
      return;
    }
    if (cleared) { canvas.style.opacity = '1'; cleared = false; }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, time);
    gl.uniform1f(uSpeed, 1);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uAlpha, 0.2 + 0.1 * shown);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  });

  return {
    setIntensity(v) { intensity = v; },
    setVelocity(v) { velocity = v; },
    destroy() {
      off();
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
