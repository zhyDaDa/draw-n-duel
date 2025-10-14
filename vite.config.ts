import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // allow imports like: import Foo from 'src/components/Foo'
      { find: 'src', replacement: resolve(__dirname, 'src') },
    ],
  },
})
