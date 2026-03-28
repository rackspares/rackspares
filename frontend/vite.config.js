import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// ── Version ───────────────────────────────────────────────────────────────────
// The app version is read from package.json at build time and injected as
// import.meta.env.VITE_APP_VERSION throughout the frontend bundle.
//
// TO BUMP THE VERSION: change "version" in package.json — that's the only
// place you need to edit for the frontend. Do not hardcode version strings
// anywhere else in the frontend source.
// ─────────────────────────────────────────────────────────────────────────────
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
});
