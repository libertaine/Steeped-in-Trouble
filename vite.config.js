import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // GitHub Pages serves the game from https://libertaine.github.io/Storm-in-a-Teacup/
  // The dev and preview servers use the same path so links behave identically.
  base: '/Storm-in-a-Teacup/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
