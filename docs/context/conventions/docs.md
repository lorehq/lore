# Docs

## When to Write

- A gotcha or non-obvious behavior was discovered.
- A multi-step procedure would otherwise be re-discovered each time.
- A public API needs purpose, parameters, returns, and an example.
- Architecture or design decisions need rationale captured.
- Environment-specific knowledge would be lost between sessions.

Don't write docs speculatively. If the code is self-documenting, leave it alone.

## Content Routing

Different content belongs in different places:

- **Code comments** — explain WHY, never WHAT. Intent, decisions, trade-offs, edge cases.
- **Docstrings** — purpose, params, returns, exceptions, one example.
- **README** — project context, setup, architecture (for humans).
- **Agent instructions** — build/test commands, conventions, gotchas (for agents).
- **Commit messages** — WHY the change was made, not WHAT changed.

Never duplicate across locations. Link instead.

## Formatting

- **Heading hierarchy** — H1 > H2 > H3 in sequence. Never skip levels.
- **One topic per section** — don't mix unrelated concerns under one heading.
- **Fenced code blocks** with language identifier. Never bare inline code for multi-word commands.
- **Consistent terminology** — one term per concept, project-wide.
- **No vague pronouns** — replace "it", "this", "that" with the explicit noun when ambiguous.
- **Blank line before lists** — required for MkDocs to render lists correctly.

## Tone

- Second person ("you"), present tense, active voice.
- Direct and imperative for instructions. No hedging.
- Concrete over vague: specific values, exact commands, real examples.
- One code example beats a paragraph of description.
- Assume a competent reader. Don't over-explain basics.

## Anti-Patterns

- Don't restate code as prose. `x = x + 1` does not need a comment saying "increment x."
- Don't let docs contradict code. Stale docs are worse than no docs.
- Don't create monolithic documents. Keep files focused.
- Don't use vague guidance ("write clean code") without a concrete alternative.
- Don't create docs proactively. Only when explicitly requested or when a real problem demands it.
