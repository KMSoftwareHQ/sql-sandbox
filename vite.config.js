import { defineConfig } from 'vite';

const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // Relative asset paths so the build works under any subpath (e.g. /sql-sandbox/).
  base: './',
  build: { target: 'es2022' },
  // The MySQL engine uses SharedArrayBuffer, which browsers only allow on cross-origin isolated pages.
  server: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  preview: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  optimizeDeps: {
    // PGlite loads its own WASM/data files relative to its module URL.
    exclude: ['@electric-sql/pglite'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
