import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths + hash routing (#/room/...) = works on GitHub Pages under any repo name, no 404 tricks.
  base: './',
  resolve: {
    alias: {
      // The poker rules live in one place and are shared with the Supabase Edge Function.
      '@engine': fileURLToPath(new URL('./supabase/functions/_shared/engine/index.ts', import.meta.url)),
    },
  },
});
