# Work Tracking

Lore tracks in-flight work to maintain context across sessions. All workflow items are **operator-initiated**.

## Hierarchy

1.  **Initiatives** (`in-flight/initiatives/`): Strategic goals lasting months.
2.  **Epics** (`in-flight/epics/`): Tactical projects lasting weeks. Often nested under initiatives.
3.  **Items** (`in-flight/items/`): Discrete deliverables lasting days. Nested under epics.

Active items (marked `status: active`) appear in the session banner to keep them "top of mind" for the agent.

## Lightweight Capture

- **Notes** (`notes/`): Single files for bugs, ideas, or observations. Untracked in the banner.
- **Brainstorms** (`brainstorms/`): Collaborative thinking sessions. No status field — purely informational artifacts.

## Archive

Completed work is moved to `archive/` subfolders within each category to keep the `in-flight/` directory clean and optimized for agent scanning.

