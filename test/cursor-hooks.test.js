// Tests for Cursor hooks (.cursor/hooks/) — SKIPPED.
// The .cursor/hooks/ directory was removed in the harness refactor.
// Hook scripts now live at .lore/harness/hooks/ and are tested by:
//   - session-init.test.js
//   - memory-nudge.test.js
// Removed hooks (capture-nudge, compaction-flag, failure-tracker) were
// consolidated into memory-nudge.js.

const { test } = require('node:test');

// ── Session Init ──

test('session-init: emits cursor banner with version and dynamic content', { skip: 'Cursor hooks removed' }, () => {});

test('session-init: creates sticky files', { skip: 'Cursor hooks removed' }, () => {});

test('session-init: includes active initiatives in dynamic banner', { skip: 'Cursor hooks removed' }, () => {});

// ── Protect Memory ──

test('protect-memory: blocks MEMORY.md reads with deny permission', { skip: 'Cursor hooks removed' }, () => {});

test('protect-memory: allows MEMORY.local.md', { skip: 'Cursor hooks removed' }, () => {});

test('protect-memory: allows nested MEMORY.md', { skip: 'Cursor hooks removed' }, () => {});

test('protect-memory: allows non-MEMORY files', { skip: 'Cursor hooks removed' }, () => {});

// ── Knowledge Tracker ──

test('memory-nudge: silent on knowledge path writes', { skip: 'Cursor hooks removed' }, () => {});

test('memory-nudge: silent on all writes (output moved to capture-nudge)', { skip: 'Cursor hooks removed' }, () => {});

test('memory-nudge: file edit resets bash counter', { skip: 'Cursor hooks removed' }, () => {});

// ── Protect Memory (preToolUse Write) ──

test('protect-memory: blocks MEMORY.md writes via preToolUse', { skip: 'Cursor hooks removed' }, () => {});

test('protect-memory: allows non-MEMORY writes via preToolUse', { skip: 'Cursor hooks removed' }, () => {});

// ── Capture Nudge ──

test('capture-nudge: increments bash counter and emits allow', { skip: 'Cursor hooks removed' }, () => {});

test('capture-nudge: emits nudge at threshold', { skip: 'Cursor hooks removed' }, () => {});

test('capture-nudge: emits warn at warn threshold', { skip: 'Cursor hooks removed' }, () => {});

test('capture-nudge: emits compaction re-orientation and clears flag', { skip: 'Cursor hooks removed' }, () => {});

test('capture-nudge: includes failure note and clears flag', { skip: 'Cursor hooks removed' }, () => {});

// ── Compaction Flag ──

test('compaction-flag: creates lore-compacted flag file', { skip: 'Cursor hooks removed' }, () => {});

// ── Failure Tracker ──

test('failure-tracker: sets lastFailure in state', { skip: 'Cursor hooks removed' }, () => {});

test('failure-tracker: preserves existing bash count', { skip: 'Cursor hooks removed' }, () => {});
