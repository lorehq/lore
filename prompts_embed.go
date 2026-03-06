package main

import (
	"embed"
	"strings"
)

//go:embed prompts/beforeTool/*.md prompts/afterTool/*.md prompts/onPrompt/*.md
var promptsFS embed.FS

// loadPrompt reads a prompt file from the embedded prompts FS.
// Path format: "beforeTool/memoryGuard.md" or "afterTool/memoryNudge.warn.md"
func loadPrompt(path string) string {
	data, err := promptsFS.ReadFile("prompts/" + path)
	if err != nil {
		return ""
	}
	return stripPromptFrontmatter(string(data))
}

// stripPromptFrontmatter removes YAML frontmatter from a prompt file,
// returning only the body content (trimmed).
func stripPromptFrontmatter(content string) string {
	if !strings.HasPrefix(content, "---\n") {
		return strings.TrimSpace(content)
	}
	end := strings.Index(content[4:], "\n---")
	if end < 0 {
		return strings.TrimSpace(content)
	}
	return strings.TrimSpace(content[4+end+4:])
}
