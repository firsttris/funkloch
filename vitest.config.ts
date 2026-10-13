import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    pool: 'forks',
  },
})
