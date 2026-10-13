/**
 * Vite config. Why it is this small: one HTML entry, no framework. The one
 * rule that matters is that three.js and onnxruntime-web never load with the
 * intro (it must paint without them); they are only reached through dynamic
 * import(). manualChunks just names their chunks ("three", "ort"); it cannot
 * stop a static import from loading them at startup, so the check is the
 * build output: the entry chunk must not contain 'THREE' or 'onnxruntime'
 * (docs/reports/story-report.md).
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
