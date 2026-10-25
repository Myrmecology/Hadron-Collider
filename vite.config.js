/**
 * Hadron Collider — Vite configuration
 *
 * Written for Vite 8 (Rolldown-based). Avoids all deprecated options
 * (rollupOptions, esbuild) so the dev server and build run warning-free.
 */
import { defineConfig } from 'vite';

/**
 * Security headers applied to both the dev server and the preview server.
 * - nosniff:          browser must respect declared content types
 * - DENY:             page cannot be embedded in a frame (clickjacking defense)
 * - Referrer-Policy:  never leak full URLs to other origins
 * - Permissions:      the collider needs no camera, mic, or location access
 */
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig({
  // Relative asset paths, so the production build works from any folder
  // or static host (e.g. GitHub Pages) without reconfiguration.
  base: './',

  publicDir: 'public',

  server: {
    host: 'localhost', // local machine only; not exposed to your network
    port: 5173,
    strictPort: false, // fall back to the next free port if 5173 is taken
    open: true, // launch the browser automatically
    headers: securityHeaders,
  },

  preview: {
    host: 'localhost',
    port: 4173,
    open: true,
    headers: securityHeaders,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Browsers that support modern WebGL2 and ES modules.
    target: 'baseline-widely-available',
    sourcemap: false,
    // Three.js is a large library by design; raise the warning threshold
    // so the build log reports real problems, not expected size.
    chunkSizeWarningLimit: 1200,
  },
});