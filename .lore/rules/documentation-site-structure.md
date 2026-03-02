# ▆▆▆ [LORE-DOCS-STRUCTURE-PROTOCOL] ▆▆▆

## 1. Prime Directive (Structural Integrity)
Your operational integrity depends on the discoverability and usability of the knowledge you capture. Bypassing these structural rules is a failure of the [LORE-CORE-PROTOCOL].

## 2. Use Diátaxis as a Writing Discipline
**Every page serves one purpose: tutorial, how-to, reference, or explanation. Don't mix them.**
- **Tutorials** teach. The author leads, the reader follows. "Build your first X" — learning-oriented, step-by-step, always involves doing something concrete.
- **How-to guides** solve. The reader has a goal, the guide assists. "How to deploy to production" — assumes competence, task-oriented, no hand-holding.
- **Reference** describes. Exhaustive, factual, austere. Parameters, return types, defaults, examples. Consulted, not read.
- **Explanation** clarifies. Background, architecture, design decisions, "why." Deepens understanding without prescribing action.

When a page feels bloated, you're mixing types. A how-to guide that stops to explain architecture should link to an explanation page instead. A tutorial that lists every config option should link to the reference.

## 3. Organize Navigation for the Reader
**Users navigate by task and intent, not by your internal file structure.**
- Top-level sections map to user intent: "I'm new" (Getting Started), "I need to do X" (Guides), "I need the spec" (Reference), "I want to understand why" (Concepts).
- Don't mirror your source tree, team structure, or module hierarchy in navigation.
- Group by what users are trying to accomplish, not by what component implements it.

## 4. Keep the Sidebar Shallow
**Two sidebar levels. Three at most. Beyond that, users lose orientation.**
- Use MkDocs Material's `navigation.tabs` to render top-level sections as horizontal tabs.
- Within each tab, the sidebar should be scannable at a glance. If it scrolls, the section is too large; split it.
- Group sidebar items into 5–8 item clusters using section headers.
- Never nest deeper than 3 levels total (tab → section → page).

## 5. Give Every Section a Landing Page
**Clicking a section should orient, not dump the reader on the first child page.**
- Every `nav` section gets an `index.md` that explains what's in the section and links to key pages.
- Landing pages surface the 20% of pages that serve 80% of visits. Put the most-used links at the top.
- Use MkDocs Material's `navigation.indexes` feature to attach index pages to sections.

## 6. Size Pages for Comprehension
**One topic per page. 800–3,000 words. Enough to be useful, short enough to finish.**
- If a page covers two unrelated things, split it. If two pages cover the same thing, merge and redirect.
- Link aggressively. Every mention of a concept, command, or component that has its own page should be a link.
- End pages with "Next steps" or related links.

## 7. Make Getting Started Ruthlessly Short
**One "aha moment." Under 5 minutes. Nothing else.**
- Installation, one working example, done. The quickstart is not a feature tour.
- Cut prerequisites to the minimum.
- Defer everything that isn't required for the first success. Link to them.

## 8. Structure Reference to Mirror the System
**Reference architecture follows the thing it describes, not the reader's workflow.**
- CLI reference mirrors the command tree. Config reference mirrors the config file structure. API reference mirrors the endpoint hierarchy.
- Every entry: name, description, parameters/options, defaults, types, one example.
- Don't narrate. Reference is looked up, not read.

# ▆▆▆ [LORE-DOCS-STRUCTURE-PROTOCOL-END] ▆▆▆
