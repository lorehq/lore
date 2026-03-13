package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

// CursorProjector generates Cursor IDE platform files.
type CursorProjector struct{}

func (p *CursorProjector) Name() string { return "cursor" }

func (p *CursorProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	paths := []string{"AGENTS.md", ".cursor/hooks.json"}
	if hasMCP {
		paths = append(paths, ".cursor/mcp.json")
	}
	for _, n := range rules {
		paths = append(paths, ".cursor/rules/"+n+".mdc")
	}
	for _, n := range skills {
		paths = append(paths, ".cursor/skills/"+n+"/", ".cursor/skills/"+n+"/SKILL.md")
		paths = append(paths, ".cursor/commands/"+n+".md")
	}
	for _, n := range agents {
		paths = append(paths, ".cursor/agents/"+n+".md")
	}
	return paths
}

func (p *CursorProjector) Project(root string, ms *MergedSet) error {
	cursorDir := filepath.Join(root, ".cursor")

	// Rules → .cursor/rules/<name>.mdc
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if err := p.writeRule(root, name, rule); err != nil {
			return err
		}
	}

	// Skills → .cursor/skills/<name>/SKILL.md
	if err := projectSkills(cursorDir, ms); err != nil {
		return err
	}

	// Agents → .cursor/agents/<name>.md
	if err := projectAgents(cursorDir, ms); err != nil {
		return err
	}

	// .cursor/hooks.json
	if err := p.writeHooks(root); err != nil {
		return err
	}

	// AGENTS.md at root
	if err := writeAGENTSMD(root, ms); err != nil {
		return err
	}

	// .cursor/mcp.json — merge bundle MCP servers with existing user config
	if len(ms.MCP) > 0 {
		if err := writeMCPConfig(filepath.Join(root, ".cursor", "mcp.json"), ms.MCP); err != nil {
			return err
		}
	}

	// User-invocable skills → .cursor/commands/<name>.md (Cursor slash commands)
	// Cursor commands are plain markdown — no frontmatter, no argument support.
	for _, skill := range userInvocableSkills(ms) {
		path := filepath.Join(root, ".cursor", "commands", skill.Name+".md")
		if err := writeFile(path, []byte(skill.Body+"\n")); err != nil {
			return fmt.Errorf("write cursor command %s: %w", skill.Name, err)
		}
	}

	return nil
}

func (p *CursorProjector) writeRule(root, name string, rule *AgenticFile) error {
	var sb strings.Builder
	sb.WriteString("---\n")
	if rule.Description != "" {
		sb.WriteString(fmt.Sprintf("description: %s\n", rule.Description))
	}
	if len(rule.Globs) > 0 {
		sb.WriteString("globs:\n")
		for _, p := range rule.Globs {
			sb.WriteString(fmt.Sprintf("  - %s\n", p))
		}
	} else {
		sb.WriteString("alwaysApply: true\n")
	}
	sb.WriteString("---\n\n")
	sb.WriteString(rule.Body)
	sb.WriteString("\n")

	path := filepath.Join(root, ".cursor", "rules", name+".mdc")
	return writeFile(path, []byte(sb.String()))
}

// cursorHooksConfig matches .cursor/hooks.json format.
type cursorHooksConfig struct {
	Version int                     `json:"version"`
	Hooks   map[string][]cursorHook `json:"hooks"`
}

type cursorHook struct {
	Command string `json:"command"`
	Type    string `json:"type"`
	Matcher string `json:"matcher,omitempty"`
}

func (p *CursorProjector) writeHooks(root string) error {
	loreHook := func(cmd string) []cursorHook {
		return []cursorHook{{Command: cmd, Type: "command"}}
	}
	cfg := cursorHooksConfig{
		Version: 1,
		Hooks: map[string][]cursorHook{
			"preToolUse":        loreHook("lore hook pre-tool-use"),
			"postToolUse":       loreHook("lore hook post-tool-use"),
			"beforeSubmitPrompt": loreHook("lore hook prompt-submit"),
			"sessionStart":      loreHook("lore hook session-start"),
			"stop":              loreHook("lore hook stop"),
			"preCompact":        loreHook("lore hook pre-compact"),
			"sessionEnd":        loreHook("lore hook session-end"),
			"subagentStart":     loreHook("lore hook subagent-start"),
			"subagentStop":      loreHook("lore hook subagent-stop"),
		},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal cursor hooks.json: %w", err)
	}
	return writeFile(filepath.Join(root, ".cursor", "hooks.json"), append(data, '\n'))
}
