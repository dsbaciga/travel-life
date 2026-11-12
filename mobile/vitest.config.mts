import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests cover the platform-free core (db/, sync/, domain/, lib/) and run in
// plain Node: no React Native runtime, with Node's built-in SQLite standing in
// for expo-sqlite behind the SqlDriver interface.
export default defineConfig({
  define: {
    __DEV__: 'true',
  },
  resolve: {
    alias: {
      '@travel-life/shared': fileURLToPath(
        new URL('../packages/shared/src/index.ts', import.meta.url)
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'react-native': 'react-native-web',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
