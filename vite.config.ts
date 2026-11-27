import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHttpApi } from './server/api'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'noudilo-api',
      async configureServer(server) {
        const api = await createHttpApi(); await api.ready()
        server.middlewares.use((request, response, next) => request.url?.startsWith('/api/') ? void api.server.emit('request', request, response) : next())
        server.httpServer?.once('close', () => { void api.close() })
      },
      async configurePreviewServer(server) {
        const api = await createHttpApi(); await api.ready()
        server.middlewares.use((request, response, next) => request.url?.startsWith('/api/') ? void api.server.emit('request', request, response) : next())
        server.httpServer?.once('close', () => { void api.close() })
      },
    },
  ],
})
