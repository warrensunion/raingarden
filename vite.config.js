/**
 * Vite config. Why it is this small: one HTML entry, no framework. The one
 * rule that matters is that three.js and onnxruntime-web never land in the
 * entry chunk (the intro must paint without them); they are only reached
 * through dynamic import(), so Rollup puts them in their own chunks. The
 * manualChunks guard keeps that true even if a shared module starts
 * importing them statically.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/onnxruntime-web')) return 'ort';
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
});
