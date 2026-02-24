---
name: pymdownx-extension-order
description: pymdownx.tilde must be listed before pymdownx.tasklist for strikethrough inside checkboxes
---

# pymdownx Extension Order

## When This Matters

When using `pymdownx.tilde` (strikethrough) and `pymdownx.tasklist` together in MkDocs Material.

## The Gotcha

`pymdownx.tilde` must be listed **before** `pymdownx.tasklist` in `mkdocs.yml` `markdown_extensions`. If tasklist comes first, `~~strikethrough~~` inside task list items renders as literal tildes instead of struck-through text.

## Correct Order

```yaml
markdown_extensions:
  - pymdownx.tilde
  - pymdownx.tasklist
```

## Wrong Order

```yaml
markdown_extensions:
  - pymdownx.tasklist
  - pymdownx.tilde    # strikethrough won't work inside checkboxes
```

## Why

pymdownx.tasklist transforms `- [x] text` into custom HTML before tilde gets a chance to process `~~text~~`. When tilde runs first, it converts strikethrough to `<del>` tags, and tasklist handles the rest correctly.
