import stylex from '@stylexjs/unplugin';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [stylex.rollup({devMode: 'css-only', useCSSLayers: true})],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    restoreMocks: true,
  },
});
