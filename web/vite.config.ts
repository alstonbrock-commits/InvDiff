import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The legal text is shared with the mobile app (src/fixtures/legal.ts) so the
// hosted Terms / Privacy pages can never drift from what the app shows.
const fixtures = fileURLToPath(new URL('../src/fixtures', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@fixtures': fixtures },
  },
  server: {
    fs: { allow: ['.', fixtures] },
  },
});
