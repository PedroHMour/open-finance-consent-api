import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    // Os testes de integração compartilham o mesmo banco: rodam um arquivo por vez.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://openfinance:openfinance@localhost:5433/openfinance_test',
      JWT_SECRET: 'test-secret-com-pelo-menos-32-caracteres-ok',
      CORS_ORIGINS: 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts', 'src/shared/types/**'],
      reporter: ['text-summary', 'text', 'html'],
    },
  },
});
