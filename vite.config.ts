import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// In dev, meridian is proxied so the app is same-origin and needs no CORS setup.
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': { target: process.env.MERIDIAN_URL ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
})
