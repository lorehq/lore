# Knowledge Capture

How to write knowledge entries. For routing rules (what goes where), see `.lore/instructions.md`.

## Quality Bar

- Front-load the key insight. First sentence should answer "what do I need to know?"
- 30-80 lines for skills. If longer, split by concern.
- Generic only — no usernames, URLs, tokens, or account IDs. Those go in `docs/knowledge/environment/`.
- One topic per file. If a file covers two unrelated things, split it.
- Scannable. Use headings, short bullets, and code examples — not prose paragraphs.

## When to Capture

- A gotcha or non-obvious behavior was discovered during work.
- A multi-step procedure would otherwise be re-discovered next session.
- You interacted with a service, URL, API, or infrastructure component not yet documented.
- A workaround was needed that future sessions should know about.

Don't capture speculative knowledge. Only write what was confirmed through direct experience.

## Structure

- **Skills** — problem, cause, solution. What breaks, why, how to fix it.
- **Runbooks** — numbered steps with verification checks. A reader should be able to follow without context.
- **Environment docs** — facts, not opinions. URLs, account names, relationships, current state.

## Anti-Patterns

- Don't duplicate what's already in instructions or conventions. Link instead.
- Don't capture session-specific context (current task, in-progress decisions).
- Don't write knowledge that restates what the code already makes obvious.
- Don't create entries for hypothetical problems you haven't actually hit.
