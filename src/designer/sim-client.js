/**
 * The designer's handle on the storm-sim Web Worker (src/sim/worker.js).
 *
 * WHY a client: the worker speaks a small id-tagged protocol; the steps want
 * promises. One worker serves the before run, the optimizer and the after
 * run. The optimizer cannot be cancelled from inside (it is one synchronous
 * loop), so "Stop" terminates the worker and the next request starts a fresh
 * one; the sim worker is only created when the designer first needs it.
 */

export function createSimClient() {
  let worker = null;
  let nextId = 1;
  const jobs = new Map();

  function ensure() {
    if (worker) return worker;
    worker = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data || {};
      const job = jobs.get(m.id);
      if (!job) return;
      if (m.type === 'frame') job.onFrame && job.onFrame(m);
      else if (m.type === 'try') job.onTry && job.onTry(m);
      else if (m.type === 'done') { jobs.delete(m.id); job.resolve(m.result); }
      else if (m.type === 'error') { jobs.delete(m.id); job.reject(new Error(m.error)); }
    };
    worker.onerror = (e) => {
      const err = new Error(`sim worker failed: ${e.message || 'unknown error'}`);
      for (const j of jobs.values()) j.reject(err);
      jobs.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  }

  function request(type, params, hooks = {}) {
    const id = nextId++;
    const w = ensure();
    const promise = new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject, ...hooks });
    });
    w.postMessage({ type, id, params });
    return { id, promise };
  }

  return {
    /**
     * Run a storm; resolves { frames: [{t, depth, ledger}], result }. Frames may
     * stop before the tail ends (the sim exits early once every pond is empty).
     */
    async run(params, onProgress) {
      const frames = [];
      const { promise } = request('run', params, {
        onFrame: (m) => {
          frames.push({ t: m.t, depth: m.depth, ledger: m.ledger });
          if (onProgress) onProgress(frames.length, m.t);
        },
      });
      const result = await promise;
      return { frames, result };
    },
    /** Optimize; returns { promise, cancel }. cancel() terminates the worker. */
    optimize(params, onTry) {
      const job = request('optimize', params, { onTry });
      return {
        promise: job.promise,
        cancel: () => {
          const j = jobs.get(job.id);
          jobs.delete(job.id);
          worker?.terminate();
          worker = null;
          for (const other of jobs.values()) other.reject(new Error('cancelled'));
          jobs.clear();
          if (j) j.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
        },
      };
    },
    destroy() {
      worker?.terminate();
      worker = null;
      jobs.clear();
    },
  };
}
