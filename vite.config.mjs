import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    // allow Replit preview host for local dev
    allowedHosts: [
      '91b7b977-42a6-4815-95d3-73fd63e96fdf-00-3gjfrifky4xz7.riker.replit.dev'
    ]
  },
  preview: {
    port: 5000,
    host: '0.0.0.0'
  }
})
