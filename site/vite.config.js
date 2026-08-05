import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Сборка кладётся в ../docs — оттуда её отдаёт GitHub Pages
// (Settings → Pages → master / docs). Всё, что должно попасть в выдачу
// как есть (скриншоты, .nojekyll), лежит в site/public.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/jobfitcopilot/',
  resolve: {
    alias: { '@': path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'src') },
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
