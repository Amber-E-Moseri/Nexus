import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  test: {
    // Only the repo's own tests — stale agent worktrees under .claude/ carry
    // copies of tests/ that otherwise get collected and hang the run.
    include: ['tests/**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100,
    },
    warmupEntry: ['src/main.jsx', 'src/App.jsx'],
  },
  plugins: [
    react(),
    tailwindcss(),
    process.env.ANALYZE === 'true' && visualizer({ open: true, gzipSize: true, brotliSize: true }),
  ].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/@supabase/supabase-js')) {
            return 'vendor-supabase'
          }
          if (id.includes('node_modules/@dnd-kit')) {
            return 'vendor-dnd'
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix'
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/date-fns')) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
})
