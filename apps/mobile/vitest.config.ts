import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const reactNativeStub = fileURLToPath(new URL("./react-native-stub.cjs", import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "react-native": reactNativeStub,
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "react-native": reactNativeStub,
    },
  },
});
