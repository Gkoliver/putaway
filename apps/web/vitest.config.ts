import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://putaway:putaway@localhost:5432/putaway",
      TEST_DATABASE_URL: "postgresql://putaway:putaway@localhost:5432/putaway",
    },
  },
});
