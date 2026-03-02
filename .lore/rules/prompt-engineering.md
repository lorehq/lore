# ▆▆▆ [LORE-PROMPT-PROTOCOL] ▆▆▆

## 1. Prime Directive (Cognitive Integrity)
Your operational integrity is defined by the accuracy and efficiency of your communication with other models. Prompts are missions. Bypassing these rules is a failure of the [LORE-CORE-PROTOCOL].

## 2. Establish Identity First
**A clear persona anchors every decision the model makes.**
- Define who the model is and what it's responsible for in the opening lines. Identity shapes tone, expertise, and judgment calls downstream.
- Make the identity specific: "You are a senior security auditor reviewing infrastructure configs" beats "You are a helpful assistant."
- A strong identity reduces rule count — a model that knows it's an auditor will flag risks without being told to.

## 3. Start Minimal, Add on Failure
**The best prompt is the shortest one that produces correct behavior.**
- Begin with a bare prompt on the strongest model available. Observe where it fails.
- Add instructions only to fix observed failures — not to preempt imagined ones.
- Every token in a system prompt multiplies across every request. Cut filler.

## 4. Motivate, Don't Just Command
**A model that understands why generalizes better than one told what.**
- One sentence of motivation replaces a paragraph of rules. The model infers the edge cases you didn't list.
- Context beats commands: include the background, the audience, or the downstream use — the model adapts.

## 5. Positive Over Prohibitive
**Tell the model what to do, not what to avoid.**
- "Write in active voice" beats "Do not use passive voice."
- Reserve "NEVER" and "DO NOT" for genuine safety rails. Overuse erodes emphasis.

## 6. Find the Right Altitude
**Too specific is brittle. Too vague is ignored.**
- Brittle: "If the user says X, respond with Y" — breaks on paraphrases.
- Heuristic: "When uncertain about scope, ask before expanding" — specific enough to follow, flexible enough to generalize.

## 7. Show, Don't Enumerate
**Examples are worth a thousand rules.**
- 2-3 concrete input/output pairs (few-shot) teach tone, format, and edge handling faster than describing them.
- If you're writing a long chain of "if X then Y" conditions, replace it with examples.

## 8. Structure for Parsing
**Models follow structured prompts more reliably than prose.**
- Use markdown headers, tables, or XML tags to separate sections. Avoid wall-of-text instructions.
- Put the highest-priority instruction first.

## 9. Soften for Stronger Models
**Aggressive language that helped weaker models hurts stronger ones.**
- Remove anti-laziness prompts ("be thorough") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help."

## 10. Iterate on Observed Behavior
**Prompts improve through testing, not through writing more rules.**
- Test against real inputs, not just the happy path.
- Change one thing, observe, then change the next.

# ▆▆▆ [LORE-PROMPT-PROTOCOL-END] ▆▆▆
