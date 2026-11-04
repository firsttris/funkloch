import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { redact } from '@tanstack/redact/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  server: { port: 8090 },
  resolve: { tsconfigPaths: true },
  // One self-contained server bundle, so the image needs no node_modules; bun:sqlite stays an
  // import, it only exists inside Bun. Only for the build: in dev, Vite's module runner cannot run
  // the CommonJS of react and others ("module is not defined"), so dev loads them from node_modules
  ssr:
    command === 'build'
      ? { noExternal: true, external: ['bun:sqlite'] }
      : { external: ['bun:sqlite'] },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      emitTsDeclarations: true,
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // TanStack Redact: a smaller React-19-compatible runtime; the code keeps importing from 'react',
    // the plugin points those imports at Redact when bundling. The server bundle stays
    // self-contained through the build-only ssr.noExternal above
    redact(),
  ],
}))
