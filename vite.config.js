import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base matches the GitHub Pages project path (xuio.github.io/octatrack-exporter/)
export default defineConfig({
  plugins: [react()],
  base: '/octatrack-exporter/',
});
