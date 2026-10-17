import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'

// In dev, meridian is proxied so the app is same-origin and needs no CORS setup.
export default defineConfig(({ mode }) => {
  // Vite only hands .env files to the app (VITE_*), so load them here for the proxy target too.
  // Shell variables win over the files.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [svelte()],
    server: {
      proxy: {
        '/api': { target: env.MERIDIAN_URL || 'http://localhost:4000', changeOrigin: true },
      },
    },
  }
})
