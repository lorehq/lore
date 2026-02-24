# Prompt Engineering

## 1. Establish Identity First

**A clear persona anchors every decision the model makes.**

- Define who the model is and what it's responsible for in the opening lines. Identity shapes tone, expertise, and judgment calls downstream.
- Make the identity specific: "You are a senior security auditor reviewing infrastructure configs" beats "You are a helpful assistant."
- A strong identity reduces rule count — a model that knows it's an auditor will flag risks without being told to. A model that knows it's a code reviewer will check edge cases unprompted.
- When the model drifts, check whether the identity is clear before adding more rules.

## 2. Start Minimal, Add on Failure

**The best prompt is the shortest one that produces correct behavior.**

- Begin with a bare prompt on the strongest model available. Observe where it fails.
- Add instructions only to fix observed failures — not to preempt imagined ones.
- Every token in a system prompt multiplies across every request. Cut filler: "It is important to note that" → state the thing. "In order to" → "to".
- Hill-climb quality first, then trim cost. Don't optimize for brevity before the behavior is right.

## 3. Motivate, Don't Just Command

**A model that understands why generalizes better than one told what.**

- "Never use ellipses — the text-to-speech engine can't pronounce them" outperforms "NEVER use ellipses."
- One sentence of motivation replaces a paragraph of rules. The model infers the edge cases you didn't list.
- Context beats commands: include the background, the audience, or the downstream use — the model adapts.

## 4. Positive Over Prohibitive

**Tell the model what to do, not what to avoid.**

- "Write in active voice" beats "Do not use passive voice."
- "Search first, then read matched files" beats "Do NOT read files without searching first."
- Reserve "NEVER" and "DO NOT" for genuine safety rails. Overuse erodes emphasis — when everything is critical, nothing is.

## 5. Find the Right Altitude

**Too specific is brittle. Too vague is ignored.**

- Brittle: "If the user says X, respond with Y" — breaks on paraphrases.
- Vague: "Be helpful" — gives the model nothing to act on.
- Heuristic: "When uncertain about scope, ask before expanding" — specific enough to follow, flexible enough to generalize.
- Avoid laundry lists of edge cases. Curate a small set of diverse examples that demonstrate the pattern instead.

## 6. Show, Don't Enumerate

**Examples are worth a thousand rules.**

- 2-3 concrete input/output pairs teach tone, format, and edge handling faster than describing them.
- When multiple rules interact (formatting + tone + length), a single example demonstrates all at once.
- If you're writing a long chain of "if X then Y" conditions, replace it with examples that cover the cases. Models learn patterns from demonstrations more reliably than from exhaustive enumeration.

## 7. Structure for Parsing

**Models follow structured prompts more reliably than prose.**

- Use markdown headers, tables, or XML tags to separate sections. Avoid wall-of-text instructions.
- Put the highest-priority instruction first — models weight early content more heavily.
- Group related rules. Scattered related rules get partially followed.
- Match prompt formatting to desired output formatting — markdown prompts produce markdown responses.

## 8. Soften for Stronger Models

**Aggressive language that helped weaker models hurts stronger ones.**

- Remove anti-laziness prompts ("be thorough," "do not be lazy") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help." Undertriggering workarounds from older models cause overtriggering on newer ones.
- Drop explicit "think step-by-step" instructions for models that reason well natively — they over-plan when told to plan.
- When behavior is too aggressive after softening, lower effort/temperature before adding more prompt constraints.

## 9. Iterate on Observed Behavior

**Prompts improve through testing, not through writing more rules.**

- Test against real inputs, not just the happy path. Adversarial and edge-case inputs reveal prompt gaps.
- When output quality changes, diagnose whether the prompt drifted or the inputs did.
- A fix for one failure mode can break three working cases. Change one thing, observe, then change the next.
- Prompt refinement is continuous — revisit when models update, inputs shift, or new failure modes appear.
