import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to import .py files as raw strings
function pythonPlugin(): Plugin {
  return {
    name: 'python-files',
    transform(code, id) {
      if (id.endsWith('.py')) {
        return `export default ${JSON.stringify(code)}`;
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), pythonPlugin()],
  server: {
    port: 3001,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@niivue/dcm2niix'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})