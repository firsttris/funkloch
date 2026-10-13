import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    pool: 'forks',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/contract/**/*.test.ts'],
        },
      },
      {
        // Needs a broker: MQTT_TEST_URL=mqtt://localhost:1883 bun run test:integration
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
})
