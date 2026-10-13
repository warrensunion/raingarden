/**
 * Web Worker entry for the storm sim.
 *
 * Why a worker: a 72-hour storm over a 128x128 yard is ~1 s of solid maths,
 * and the optimizer runs hundreds of coarse sims; on a phone that would
 * freeze scrolling and the three.js water. The worker owns the sim and
 * streams display-depth frames back as transferable Float32Arrays (zero
 * copy). `handle` is exported separately from the `self.onmessage` hookup so
 * Node tests can drive the exact protocol without a browser.
 *
 * Protocol:
 *   in  {type:'run', id, params}
 *   out {type:'frame', id, t, depth: Float32Array}  (depth.buffer transferred)
 *   out {type:'done', id, result: {ledger, drainH, drained, peakStoredL, closure}}
 *   out {type:'error', id, error}
 *   in  {type:'optimize', id, params}  (garden optimizer, src/garden/optimizer.js)
 *   out {type:'try', id, i, garden, outAfterL, drainH, accepted, best}  (<= 20/s, plain objects)
 *   out {type:'done', id, result}  (optimize's return value)
 */
import { createSim, runStorm } from './sim.js';
import { SOILS } from './infiltration.js';
import { hyetograph, fromHourly } from './storm.js';
import { optimize } from '../garden/optimizer.js';

/** Minimum gap between posted optimizer tries (ms): <= 20 per second. */
const TRY_GAP_MS = 50;

function resolveSoil(soil) {
  if (typeof soil === 'string') {
    if (!SOILS[soil]) throw new Error(`unknown soil ${soil}`);
    return SOILS[soil];
  }
  if (soil && soil.psiMm > 0 && soil.kMmH >= 0 && soil.thetaE > 0) return soil;
  throw new Error('soil must be a SOILS key or {psiMm, kMmH, thetaE}');
}

/**
 * Rain per step from params: mmSteps (explicit), storm.hourlyMm (forecast),
 * or storm {totalMm, shape, durationH} (design storm).
 */
function resolveRain(params, stepS) {
  if (params.mmSteps) return Float64Array.from(params.mmSteps);
  const s = params.storm;
  if (!s) throw new Error('params need mmSteps or storm');
  if (s.hourlyMm) return fromHourly(s.hourlyMm, stepS);
  return hyetograph(s.totalMm, s.shape || 'IA', s.durationH || 24, stepS);
}

function runJob(id, params, post) {
  if (!params || !params.terrain) throw new Error('params.terrain missing');
  const soil = resolveSoil(params.soil);
  const stepS = params.stepS || 300;
  const rain = resolveRain(params, stepS);
  const sim = createSim({
    terrain: params.terrain,
    soil,
    Se: params.Se,
    imperv: params.imperv,
    outlet: params.outlet,
    roof: params.roof,
    garden: params.garden || null,
    manningN: params.manningN,
  });
  const res = runStorm(sim, rain, stepS, {
    tailH: params.tailH,
    frameEveryS: params.frameEveryS,
    onFrame: (f) => post({ type: 'frame', id, t: f.t, depth: f.depth }, [f.depth.buffer]),
  });
  post({
    type: 'done',
    id,
    result: {
      ledger: res.ledger,
      drainH: res.drainH,
      drained: res.drained,
      peakStoredL: res.peakStoredL,
      closure: sim.closure(),
    },
  });
}

/**
 * Optimizer job. The UI animates the tries, but a fast desktop can make a
 * hundred a second, so posting is throttled to 20/s; every try carries only
 * small plain objects (no grids). The final answer always arrives in 'done'.
 */
function optimizeJob(id, params, post, now) {
  if (!params || !params.terrain) throw new Error('params.terrain missing');
  const stepS = params.stepS || 300;
  const mm = resolveRain(params, stepS);
  let lastPost = -Infinity;
  const result = optimize({
    terrain: params.terrain,
    forbidden: params.forbidden,
    site: params.site,
    simParams: {
      soil: resolveSoil(params.soil),
      Se: params.Se,
      imperv: params.imperv,
      outlet: params.outlet,
      roof: params.roof,
      manningN: params.manningN,
    },
    storm: { mm, stepS },
    limits: params.limits,
    prior: params.prior,
    prices: params.prices,
    iters: params.iters,
    seed: params.seed,
    onTry: (t) => {
      const tNow = now();
      if (tNow - lastPost < TRY_GAP_MS) return;
      lastPost = tNow;
      post({ type: 'try', id, ...t });
    },
  });
  post({ type: 'done', id, result });
}

/**
 * Handle one message. `post(message, transferList?)` sends a reply.
 * @param {{type:string, id:any, params:object}} msg
 * @param {(m:object, transfer?:ArrayBuffer[]) => void} post
 * @param {() => number} [now] clock in ms (tests pass a fake one)
 */
export function handle(msg, post, now = Date.now) {
  const id = msg && msg.id;
  try {
    if (msg.type === 'run') runJob(id, msg.params, post);
    else if (msg.type === 'optimize') optimizeJob(id, msg.params, post, now);
    else post({ type: 'error', id, error: `unknown message type ${msg.type}` });
  } catch (err) {
    post({ type: 'error', id, error: String((err && err.message) || err) });
  }
}

// Hook up only inside a worker global (no window/document here).
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => handle(e.data, (m, transfer) => self.postMessage(m, transfer || []));
}
