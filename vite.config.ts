import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'noudilo-api',
      configureServer(server) { server.middlewares.use(createApi()) },
      configurePreviewServer(server) { server.middlewares.use(createApi()) },
    },
  ],
})
