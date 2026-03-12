---
name: lore-coding
description: Coding principles — surface confusion early, write less code, prove it works
user-invocable: true
---

# Coding Principles

## Surface Confusion Early
- State assumptions before writing code. If uncertain, ask.
- When multiple interpretations exist, present them — don't pick silently.
- If requirements are ambiguous, stop and clarify. Don't guess.

## Write Less Code
- Solve exactly what was asked. No speculative features.
- Don't abstract what's used once. Three similar lines beat a premature helper.
- Don't add error handling for scenarios that can't happen.
- Trust internal code and framework guarantees. Only validate at system boundaries.

## Change Only What You Must
- Don't improve adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.
- If you notice unrelated problems, mention them — don't fix them.
- No backwards compatibility hacks — no shims, no re-exports, no aliases.

## Prove It Works
- Write or run tests before calling it done.
- After two failed fix attempts, stop. Re-read the error, reconsider the approach.
- Check security basics: no hardcoded secrets, no unvalidated input at boundaries.

## Plan, Execute, Verify
- Transform tasks into verifiable outcomes.
- For multi-step work, state the plan up front.
- Build and verify after every significant change.

## Names Matter
- Names are read thousands of times. Get them right the first time.
- If a name is wrong, rename it now — don't leave it because "it works."

## Zero Cruft
- Dead code, unused imports, stale references — delete immediately.
- Don't comment things out. Don't leave TODOs. Just remove them.
