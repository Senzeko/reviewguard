import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Logs ECONNREFUSED etc. when the API is not listening on port 3000 (common cause of 502 in dev). */
function logApiProxyErrors(proxy: { on: (ev: 'error', fn: (err: NodeJS.ErrnoException) => void) => void }) {
  proxy.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[vite proxy] /api → http://localhost:3000:', err.code ?? err.message)
  })
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: logApiProxyErrors,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/disputes': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      /** Trackable short links (PodSignal redirect + click log) */
      '/r': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: logApiProxyErrors,
      },
    },
  },
})
