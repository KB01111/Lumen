import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],

  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-aria",
              test: /node_modules[\\/](?:@react-aria|@react-stately|@react-types|react-aria-components)[\\/]/,
              priority: 5,
            },
            {
              name: "react-core",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 4,
            },
            {
              name: "motion",
              test: /node_modules[\\/](?:motion|motion-dom|motion-utils)[\\/]/,
              priority: 3,
            },
            {
              name: "data-state",
              test: /node_modules[\\/](?:@tanstack|zod|zustand)[\\/]/,
              priority: 2,
            },
            {
              name: "tauri",
              test: /node_modules[\\/]@tauri-apps[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
