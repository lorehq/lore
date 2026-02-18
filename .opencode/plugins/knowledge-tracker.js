// Knowledge Tracker Plugin
// Adaptive knowledge capture reminders after tool use.
// Thin ESM adapter — core logic lives in lib/tracker.js.
//
// Unlike the Claude Code hook (which runs as a subprocess per event and
// persists state to a file), this plugin is long-lived. Bash count lives
// in a closure; thresholds are read once at init.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { processToolUse, getThresholds, isDocsWrite, getNavFlagPath, setNavDirty, navReminder } = require("../../lib/tracker");

export const KnowledgeTracker = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  let consecutiveBash = 0;
  const thresholds = getThresholds(hub);
  const navFlag = getNavFlagPath(hub);

  return {
    "tool.execute.after": async (input) => {
      const tool = input?.tool || "";
      const filePath = input?.args?.file_path || input?.args?.path || "";
      const isFailure = !!input?.error;

      // Nav-dirty must fire before the silent-exit paths below,
      // because docs/ writes hit the knowledge-capture path and would skip it.
      if (isDocsWrite(tool, filePath)) setNavDirty(navFlag);

      const result = processToolUse({
        tool, filePath, isFailure,
        bashCount: consecutiveBash,
        thresholds,
      });
      consecutiveBash = result.bashCount;

      if (result.silent) {
        // Still emit nav reminder even when capture message is suppressed.
        const extra = navReminder(navFlag, null);
        if (extra) {
          await client.app.log({
            body: { service: "knowledge-tracker", level: "info", message: extra },
          });
        }
        return;
      }

      await client.app.log({
        body: { service: "knowledge-tracker", level: result.level, message: navReminder(navFlag, result.message) },
      });
    },
  };
};
