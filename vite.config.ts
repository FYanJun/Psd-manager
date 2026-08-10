import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-config-yaml": ["yaml"],
          "vendor-password-strength": ["@zxcvbn-ts/core", "@zxcvbn-ts/language-common"],
        },
      },
    },
  },
});
