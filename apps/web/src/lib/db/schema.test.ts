import { describe, expect, it } from "vitest";
import { withTestDb } from "./test";
import { households } from "./schema";

describe("schema", () => {
  it("inserts a household", async () => {
    await withTestDb(async (db) => {
      const [row] = await db
        .insert(households)
        .values({ name: "Oliver house" })
        .returning();
      expect(row.name).toBe("Oliver house");
      expect(row.id).toBeTruthy();
    });
  });
});
