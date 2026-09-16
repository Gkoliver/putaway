import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mobileRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("EAS Metro toolchain", () => {
  it("lets Node resolve babel-preset-expo from apps/mobile", () => {
    const resolved = execFileSync(
      process.execPath,
      ["-e", "console.log(require.resolve('babel-preset-expo'))"],
      {
        cwd: mobileRoot,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
      },
    );
    expect(resolved).toContain("babel-preset-expo");
  });
});
