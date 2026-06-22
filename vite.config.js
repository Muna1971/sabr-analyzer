import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index-mobile.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  plugins: [
    {
      name: 'rename-index',
      closeBundle() {
        // Rename index-mobile.html to index.html in dist
        const fs = require('fs');
        const path = require('path');
        const src = path.resolve(__dirname, 'dist/index-mobile.html');
        const dest = path.resolve(__dirname, 'dist/index.html');
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
        }
      }
    }
  ],
  resolve: {
    alias: {
      'src': '/src'
    }
  }
});
