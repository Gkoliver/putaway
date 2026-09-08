import Module from "node:module";
import { fileURLToPath } from "node:url";

const stub = fileURLToPath(new URL("./react-native-stub.cjs", import.meta.url));
const proto = Module as unknown as {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown,
  ) => string;
};
const original = proto._resolveFilename.bind(Module);
proto._resolveFilename = function (request, parent, isMain, options) {
  if (request === "react-native") return stub;
  return original(request, parent, isMain, options);
};

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (String(args[0] ?? "").includes("react-test-renderer is deprecated")) return;
  originalError.apply(console, args as Parameters<typeof console.error>);
};
