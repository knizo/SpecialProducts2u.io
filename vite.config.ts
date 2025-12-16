import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Prevents "process is not defined" error in browser
      'process.env': {},
      // Safe replacement: defaults to empty string if undefined
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
    },
    build: {
      // Increases the warning limit to 1000kb (1MB)
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Manual chunks helps split the code into smaller files for better caching
          manualChunks: {
            vendor: ['react', 'react-dom', 'lucide-react'],
            utils: ['@google/genai', 'qrcode', 'otpauth']
          }
        }
      }
    }
  };
});