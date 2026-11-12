import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const remoteApi = env.VITE_KEXOZ_API_BASE?.trim() || process.env.VITE_KEXOZ_API_BASE?.trim() || 'https://api.kexoz.dev'
  const rootDomain = env.VITE_KEXOZ_ROOT_DOMAIN?.trim() || process.env.VITE_KEXOZ_ROOT_DOMAIN?.trim() || 'kexoz.dev'
  // Dev UI loads from 127.0.0.1 — proxy the API so CORS never blocks Electron/Vite.
  const apiBase = mode === 'development' ? '/__kexoz_api' : remoteApi

  return {
    base: './',
    define: {
      'import.meta.env.VITE_KEXOZ_API_BASE': JSON.stringify(apiBase),
      'import.meta.env.VITE_KEXOZ_ROOT_DOMAIN': JSON.stringify(rootDomain),
    },
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: '127.0.0.1',
      proxy: {
        '/__kexoz_api': {
          target: remoteApi,
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/__kexoz_api/, ''),
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              // Edge/CDN often 403 Electron-originated Origin/UA through the Vite proxy.
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
              proxyReq.setHeader(
                'user-agent',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              )
            })
          },
        },
      },
    },
  }
})
