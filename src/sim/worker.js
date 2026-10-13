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
 *   in  {type:'optimize', id, params}  -> stub until Task 6 (garden optimizer)
 */
import { createSim, runStorm } from './sim.js';
import { SOILS } from './infiltration.js';
import { hyetograph, fromHourly } from './storm.js';

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
 * Handle one message. `post(message, transferList?)` sends a reply.
 * @param {{type:string, id:any, params:object}} msg
 * @param {(m:object, transfer?:ArrayBuffer[]) => void} post
 */
export function handle(msg, post) {
  const id = msg && msg.id;
  try {
    if (msg.type === 'run') runJob(id, msg.params, post);
    else if (msg.type === 'optimize') {
      post({ type: 'error', id, error: 'optimize not implemented yet (Task 6)' });
    } else post({ type: 'error', id, error: `unknown message type ${msg.type}` });
  } catch (err) {
    post({ type: 'error', id, error: String((err && err.message) || err) });
  }
}

// Hook up only inside a worker global (no window/document here).
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => handle(e.data, (m, transfer) => self.postMessage(m, transfer || []));
}
