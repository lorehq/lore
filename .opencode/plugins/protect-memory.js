// Protect Memory Plugin
// Blocks access to MEMORY.md and redirects to correct locations.
// Thin ESM adapter — core logic lives in lib/memory-guard.js.
//
// OpenCode blocks tool execution by throwing from tool.execute.before.
// Claude Code uses { decision: 'block' } JSON — different wire format, same logic.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { checkMemoryAccess } = require("../../lib/memory-guard");

export const ProtectMemory = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input?.tool || "";
      // OpenCode puts tool args in output.args (not input.args)
      const filePath = output?.args?.file_path || output?.args?.path || "";
      const result = checkMemoryAccess(tool, filePath, directory);
      // Non-null result = blocked (no separate flag needed)
      if (result) throw new Error(result.reason);
    },
  };
};
