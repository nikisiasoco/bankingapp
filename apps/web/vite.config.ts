import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser only ever talks to :5173, so /api is same-origin and the
    // httpOnly session cookie is sent without any CORS or credentials config.
    // 127.0.0.1, not localhost: server.ts binds 127.0.0.1 and Node resolves
    // localhost to ::1 first, which would refuse the connection.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
