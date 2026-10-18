// ureten: codex — relative assets support GitHub Pages project subpaths.
import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022', sourcemap: false }, server: { strictPort: true }, preview: { strictPort: true } });
