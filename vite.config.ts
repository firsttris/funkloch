import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 8090 },
  resolve: { tsconfigPaths: true },
  // bun:sqlite only exists inside Bun; the server bundle keeps it as an external import
  ssr: { external: ['bun:sqlite'] },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      emitTsDeclarations: true,
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
