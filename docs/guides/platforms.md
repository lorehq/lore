# Platform Integrations

Lore is designed to provide a consistent "Harness" experience across different agentic coding tools. While the core knowledge base and principles are the same, each platform has unique integration mechanisms.

## Claude Code

Claude Code is the primary platform for Lore. It uses a comprehensive set of lifecycle hooks and the `CLAUDE.md` file for foundational mandates.

- **Integration:** Hooks + `CLAUDE.md`
- **Maturity:** Supported (Production-ready)
- **Key Features:**
    - **Passive Enforcement:** Uses `BeforeTool` and `AfterTool` hooks to intercept actions.
    - **Context Injection:** The full Lore banner is baked into `CLAUDE.md`.
    - **Knowledge Tracking:** Automatically scans tool output for "snags" and environment facts.

## Gemini CLI

Gemini CLI offers the most sophisticated integration, combining the best of hook-based enforcement and tool-based interaction.

- **Integration:** Hooks + MCP + `GEMINI.md`
- **Maturity:** Supported (Production-ready)
- **Key Features:**
    - **Foundational Mandates:** Loads instructions from `GEMINI.md` (root, parents, and global).
    - **Rich Lifecycle Hooks:** Uses `BeforeAgent` for ambiguity scanning and `BeforeTool` for writing guardrails.
    - **MCP Support:** Provides `lore_check_in` and `lore_context` as native tools.

## Cursor

Cursor is a "High-Trust" integration that relies on its powerful model awareness and custom rule system.

- **Integration:** Hooks + MCP Server + `.mdc` Rules
- **Maturity:** Experimental
- **Key Features:**
    - **Lazy-Loaded Rules:** Uses glob-based `.mdc` files in `.cursor/rules/` to load context only when relevant.
    - **Active Interaction:** The agent uses MCP tools (`lore_context`, `lore_write_guard`) on-demand.
    - **Context Compaction Awareness:** Detects when Cursor summarizes history and prompts for a context refresh.

## OpenCode

OpenCode uses a modern ESM plugin architecture for integration.

- **Integration:** ESM Plugins + `opencode.json`
- **Maturity:** Experimental
- **Key Features:**
    - **Plugin-Driven:** Hooks are implemented as standard JavaScript modules.
    - **Direct System Injection:** Injects the Lore banner directly into the system prompt via the `chat.system.transform` hook.

---

## Comparison Summary

| Feature | Claude Code | Gemini CLI | Cursor | OpenCode |
| :--- | :--- | :--- | :--- | :--- |
| **Foundational Mandates** | `CLAUDE.md` | `GEMINI.md` | `.mdc` Rules | `opencode.json` |
| **Startup Hooks** | ✅ | ✅ | ✅ | ✅ |
| **Pre-Tool Hooks** | ✅ | ✅ | ❌ (Tool-based) | ✅ |
| **Post-Tool Hooks** | ✅ | ✅ | ❌ (Tool-based) | ✅ |
| **MCP Tools** | ✅ (via MCP) | ✅ (Native) | ✅ (Native) | ❌ |
| **Ambiguity Scanning** | ✅ | ✅ | ❌ | ✅ |
