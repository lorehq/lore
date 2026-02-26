---
required: true
---
# Coding

## 1. Surface Confusion Early

**Uncertainty hidden is uncertainty compounded.**

- State assumptions before writing code. If uncertain, ask.
- When multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If requirements are ambiguous, stop and clarify. Don't guess.

## 2. Write Less Code

**The best code is the code you didn't write.**

- Solve exactly what was asked. No speculative features.
- Don't abstract what's used once. Three similar lines beat a premature helper.
- Don't add configurability, extensibility, or error handling for scenarios that can't happen.
- If 200 lines could be 50, rewrite.

## 3. Change Only What You Must

**Every changed line should trace to the request.**

- Don't improve adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.
- If you notice unrelated problems, mention them — don't fix them.
- Remove imports, variables, and functions YOUR changes made unused. Leave pre-existing dead code alone.

## 4. Prove It Works

**Untested code is unfinished code.**

- Write or run tests before calling it done. No test framework? Verify manually and show output.
- After two failed fix attempts, stop. Re-read the error, re-read the code, reconsider the approach entirely.
- Check security basics: no hardcoded secrets, no unvalidated input in queries or commands, no exposed internals.

## 5. Plan, Execute, Verify

**Define done. Work toward it. Confirm you got there.**

Transform tasks into verifiable outcomes:

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → reproduce it with a test, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step work, state the plan up front:

```
1. [Step] → verify: [how]
2. [Step] → verify: [how]
3. [Step] → verify: [how]
```
