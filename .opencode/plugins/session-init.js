// Session Init Plugin
// Injects session banner at startup and after compaction.
// Thin ESM adapter — core logic lives in lib/banner.js.

// OpenCode plugins are ESM but shared lib is CJS. createRequire bridges the gap.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildBanner, ensureStickyFiles } = require("../../lib/banner");

export const SessionInit = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  // Scaffold missing files before first banner build so PROJECT section
  // picks up the agent-rules.md template on first run.
  ensureStickyFiles(hub);
  await client.app.log({
    body: { service: "session-init", level: "info", message: buildBanner(hub) },
  });

  return {
    "session.created": async () => {
      ensureStickyFiles(hub);
      await client.app.log({
        body: { service: "session-init", level: "info", message: buildBanner(hub) },
      });
    },
    // Re-inject after compaction so the banner survives context window trimming.
    "experimental.session.compacting": async (_input, output) => {
      ensureStickyFiles(hub);
      output.context.push(buildBanner(hub));
    },
  };
};
