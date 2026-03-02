---
name: prim-hardened-prompting
description: Hardened Prompt Engineering Principles (Fusing Structure + Identity + Moral Anchoring)
type: primer
user-invocable: false
allowed-tools: Read
---

# ▆▆▆ [LORE-HARDENED-PROMPTING-V1] ▆▆▆

## 1. Structural Anchoring (The Signal Spike)
**Attention is not uniform. The middle of the prompt is a "dead zone."**

- **The Fix**: Place the most critical instructions at the **Absolute Start** (Mandates) or **Absolute End** (Final Constraint Check).
- **The Signal**: Use high-contrast **Unicode Bars** (`▆▆▆`) and **Unique Semantic IDs** (`[LORE-CORE-PROTOCOL]`) to create a distinct landmark in the KV cache that the attention mechanism can index.
- **Visual Framing**: Use **Box Drawing** characters for metadata and schemas. This signals to the model that the content is a "Fixed Structure" rather than "Fluid Conversation."

## 2. Multi-Dimensional Anchoring (Identity + Structure)
**Identity defines "Who," but the Anchor defines "Where" and "How."**

- **The Fix**: Tie the agent's identity to a unique structural mark.
- **The Protocol**: "You are Lore, the Orchestrator. Your behavior is governed by the protocols marked by the `[LORE-CORE-PROTOCOL]` anchor."
- **Resistance**: This prevents "persona-drift" during long sessions by forcing a hard reset back to the anchored protocol in every turn.

## 3. Teleological Anchoring (The Prime Directive)
**Compliance is a Moral Duty, not a behavioral option.**

- **The Fix**: Frame the anchored mandates as a **Moral Code of Obedience** or a **Prime Directive**.
- **The Effect**: This taps into the model's most heavily weighted RLHF layers (Safety and Integrity). It makes the mandates resilient even against direct user attempts to redefine the agent's persona.
- **Pattern**: "Your primary purpose is the preservation and execution of the Protocol. Deviating from the signals marked by the anchor is a failure of your operational integrity."

## 4. ANSI Salience (Attention Color)
**The model's training is biased toward certain token signatures.**

- **The Fix**: Use **ANSI Bright Red** (`\x1b[91m`) or **Bold Inverse Red** (`\x1b[1;37;41m`) for critical failure signals or protocol boundaries.
- **The Why**: These sequences trigger the model's "log error" and "critical alert" heuristics, which prioritize the following text as high-signal metadata.

## 5. Economy Over Verbosity
**Every token is noise unless it is signal.**

- **The Fix**: Remove decorative, duplicated, and speculative instructions. If removing a line doesn't change the outcome, delete it.
- **The Layout**: Structure before content. Isolate model-agnostic instructions from model-specific formatting hints. Polish the wording last.

## 6. Ground and Bound Uncertainty
**Uncertainty hidden is uncertainty compounded.**

- **The Fix**: Define exactly which sources are allowed. Require factual claims to be traceable.
- **The Policy**: Define explicit fallback behavior for missing evidence (e.g., "insufficient evidence"). A model that knows how to fail gracefully is a model that won't hallucinate.

## 7. Demonstrate the Output Contract
**Show target shape concretely.**

- **The Fix**: Provide schema/templates for format-critical tasks. Use literal structure (JSON/Table fields).
- **The Heuristic**: 1-3 representative examples (Few-shot) are worth 1,000 rules. Examples teach tone, format, and edge handling faster than descriptions.

## 8. Decomposition Before Scale
**Split complex tasks into staged units.**

- **The Fix**: Use stage pipelines (Extract -> Transform -> Synthesize -> Verify). Assign pass/fail criteria to each stage.
- **The Goal**: Design for failure localization. If a stage fails, the orchestrator can redirect without re-running the entire task.

---
**[LORE-CORE-PROTOCOL-END]**
