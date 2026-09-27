import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'drizzle', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // Scripts de linha de comando podem escrever no console.
    files: ['src/db/migrate.ts', 'src/db/seed.ts'],
    rules: { 'no-console': 'off' },
  },
);
