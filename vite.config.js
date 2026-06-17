import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase':['@supabase/supabase-js'],
          'vendor-dnd':     ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-radix':   ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu'],
          'vendor-ui':      ['lucide-react', 'date-fns'],
        },
      },
    },
  },
})
