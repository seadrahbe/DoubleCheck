import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN so the survey link opens from your phone.
    host: true,
    proxy: {
      '/api': 'http://localhost:3056',
    },
  },
})
