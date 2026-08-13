import { defineConfig } from 'vite'

// Local-first static app: builds to dist/ with no backend. The engine (publicodes)
// runs entirely in the browser, so no user data ever leaves the device.
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
