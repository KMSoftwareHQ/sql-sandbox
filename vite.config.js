import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022' },
  optimizeDeps: {
    // PGlite loads its own WASM/data files relative to its module URL.
    exclude: ['@electric-sql/pglite'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
