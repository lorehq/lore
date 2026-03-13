package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ClineProjector generates Cline platform files.
type ClineProjector struct{}

func (p *ClineProjector) Name() string { return "cline" }

// clineHookScripts maps Cline hook event names to Lore event names.
var clineHookScripts = []struct{ clineEvent, loreEvent string }{
	{"PreToolUse", "pre-tool-use"},
	{"PostToolUse", "post-tool-use"},
	{"UserPromptSubmit", "prompt-submit"},
	{"TaskStart", "session-start"},
	{"TaskResume", "session-start"},
	{"TaskCancel", "session-end"},
}

func (p *ClineProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	paths := []string{"AGENTS.md", ".clinerules/_lore-mandate.md"}
	for _, n := range rules {
		paths = append(paths, ".clinerules/"+n+".md")
	}
	for _, n := range skills {
		paths = append(paths, ".cline/skills/"+n+"/", ".cline/skills/"+n+"/SKILL.md")
	}
	for _, hs := range clineHookScripts {
		paths = append(paths, ".clinerules/hooks/"+hs.clineEvent)
	}
	return paths
}

func (p *ClineProjector) Project(root string, ms *MergedSet) error {
	clineRulesDir := filepath.Join(root, ".clinerules")
	clineDir := filepath.Join(root, ".cline")

	// Rules → .clinerules/<name>.md
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if err := p.writeRule(clineRulesDir, name, rule); err != nil {
			return err
		}
	}

	// Skills → .cline/skills/<name>/SKILL.md
	if err := projectSkills(clineDir, ms); err != nil {
		return err
	}

	// LORE.md → .clinerules/_lore-mandate.md
	if ms.LoreMD != "" {
		path := filepath.Join(clineRulesDir, "_lore-mandate.md")
		if err := writeFile(path, []byte(ms.LoreMD+"\n")); err != nil {
			return fmt.Errorf("write cline lore mandate: %w", err)
		}
	}

	// Agents → AGENTS.md (flat listing, Cline has no per-agent format)
	if err := writeAGENTSMD(root, ms); err != nil {
		return err
	}

	// Hooks → .clinerules/hooks/<ClineEvent> (executable scripts)
	if err := p.writeHooks(root); err != nil {
		return err
	}

	// MCP → ~/.cline/data/settings/cline_mcp_settings.json (global, merge)
	if len(ms.MCP) > 0 {
		home, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("cline MCP: get home dir: %w", err)
		}
		mcpPath := filepath.Join(home, ".cline", "data", "settings", "cline_mcp_settings.json")
		if err := writeMCPConfigMerge(mcpPath, ms.MCP); err != nil {
			return fmt.Errorf("cline MCP: %w", err)
		}
	}

	return nil
}

func (p *ClineProjector) writeRule(rulesDir, name string, rule *AgenticFile) error {
	var sb strings.Builder
	hasFM := rule.Description != "" || len(rule.Globs) > 0
	if hasFM {
		sb.WriteString("---\n")
		if rule.Description != "" {
			sb.WriteString(fmt.Sprintf("description: %s\n", rule.Description))
		}
		if len(rule.Globs) > 0 {
			sb.WriteString("globs:\n")
			for _, g := range rule.Globs {
				sb.WriteString(fmt.Sprintf("  - %s\n", g))
			}
		}
		sb.WriteString("---\n\n")
	}
	sb.WriteString(rule.Body)
	sb.WriteString("\n")

	path := filepath.Join(rulesDir, name+".md")
	return writeFile(path, []byte(sb.String()))
}

func (p *ClineProjector) writeHooks(root string) error {
	for _, hs := range clineHookScripts {
		script := fmt.Sprintf("#!/bin/sh\nlore hook %s\n", hs.loreEvent)
		path := filepath.Join(root, ".clinerules", "hooks", hs.clineEvent)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return fmt.Errorf("create cline hooks dir: %w", err)
		}
		if err := os.WriteFile(path, []byte(script), 0755); err != nil {
			return fmt.Errorf("write cline hook %s: %w", hs.clineEvent, err)
		}
	}
	return nil
}
