---
name: prompt-engineering-principles
description: Hardened prompt engineering principles for writing effective agent prompts
type: reference
user-invocable: false
domain: general
---

# Hardened Prompt Engineering

## 1. Structural Anchoring (The Signal Spike)
**Attention is not uniform. The middle of the prompt is a "dead zone."**

- **The Fix**: Place the most critical instructions at the **Absolute Start** (Mandates) or **Absolute End** (Final Constraint Check).
- **The Signal**: Use high-contrast **Unicode Bars** (`▆▆▆`) and **Unique Semantic IDs** (`[LORE-HARNESS-PROTOCOL]`) to create a distinct landmark in the KV cache that the attention mechanism can index.
- **Visual Framing**: Use **Box Drawing** characters for metadata and schemas. This signals to the model that the content is a "Fixed Structure" rather than "Fluid Conversation."

## 2. Multi-Dimensional Anchoring (Identity + Structure)
**Identity defines "Who," but the Anchor defines "Where" and "How."**

- **The Fix**: Tie critical instructions to unique structural marks.
- **The Technique**: "Your behavior is governed by the protocols marked by the `[LORE-HARNESS-PROTOCOL]` anchor."
- **Resistance**: This prevents drift during long sessions by forcing a hard reset back to the anchored protocol in every turn.

## 3. Graduated Salience (3-Tier Color System)
**Not everything is equally important. Reserve maximum-intensity framing for genuine safety.**

- **Bright Red** (`\x1b[91m`): Security violations, credential protection, write-guard failures. The "stop everything" tier.
- **Bright Yellow** (`\x1b[93m`): Core protocol (search-first, capture reminders, checkpoints). Important but not dangerous.
- **Bright Cyan** (`\x1b[96m`): Style guidance (coding standards, docs formatting). Helpful but lowest priority.
- **The Why**: Overusing red erodes its signal. A system where everything is critical is a system where nothing is.

## 4. Economy Over Verbosity
**Every token is noise unless it is signal.**

- **The Fix**: Remove decorative, duplicated, and speculative instructions. If removing a line doesn't change the outcome, delete it.
- **The Layout**: Structure before content. Isolate model-agnostic instructions from model-specific formatting hints. Polish the wording last.

## 5. Ground and Bound Uncertainty
**Uncertainty hidden is uncertainty compounded.**

- **The Fix**: Define exactly which sources are allowed. Require factual claims to be traceable.
- **The Policy**: Define explicit fallback behavior for missing evidence (e.g., "insufficient evidence"). A model that knows how to fail gracefully is a model that won't hallucinate.

## 6. Demonstrate the Output Contract
**Show target shape concretely.**

- **The Fix**: Provide schema/templates for format-critical tasks. Use literal structure (JSON/Table fields).
- **The Heuristic**: 1-3 representative examples (Few-shot) are worth 1,000 rules. Examples teach tone, format, and edge handling faster than descriptions.

## 7. Decomposition Before Scale
**Split complex tasks into staged units.**

- **The Fix**: Use stage pipelines (Extract -> Transform -> Synthesize -> Verify). Assign pass/fail criteria to each stage.
- **The Goal**: Design for failure localization. If a stage fails, the caller can redirect without re-running the entire task.

## 8. Soften for Stronger Models
**Aggressive language that helped weaker models hurts stronger ones.**

- Remove anti-laziness prompts ("be thorough") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help."
- Avoid persona-heavy framing (roles, moral duties) except for security, where a strong frame is warranted.
