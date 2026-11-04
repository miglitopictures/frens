import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths, so the built site works in any subfolder
  // (GitHub Pages serves it at /frens/).
  base: './',
})
