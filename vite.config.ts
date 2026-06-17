import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Served at https://<user>.github.io/ar-optics/ on Pages; root '/' in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ar-optics/' : '/',
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5174,
  },
}));
