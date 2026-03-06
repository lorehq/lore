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
	return writeAGENTSMD(root, ms)
}

func (p *CursorProjector) writeRule(root, name string, rule *AgenticFile) error {
	var sb strings.Builder
	sb.WriteString("---\n")
	if rule.Description != "" {
		sb.WriteString(fmt.Sprintf("description: %s\n", rule.Description))
	}
	if len(rule.Paths) > 0 {
		sb.WriteString("globs:\n")
		for _, p := range rule.Paths {
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
	cfg := cursorHooksConfig{
		Version: 1,
		Hooks: map[string][]cursorHook{
			"preToolUse": {
				{Command: "lore hook pre-tool-use", Type: "command"},
			},
			"postToolUse": {
				{Command: "lore hook post-tool-use", Type: "command"},
			},
			"beforeSubmitPrompt": {
				{Command: "lore hook prompt-submit", Type: "command"},
			},
		},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal cursor hooks.json: %w", err)
	}
	return writeFile(filepath.Join(root, ".cursor", "hooks.json"), append(data, '\n'))
}
