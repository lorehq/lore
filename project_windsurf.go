package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

// WindsurfProjector generates Windsurf (Cascade) platform files.
type WindsurfProjector struct{}

func (p *WindsurfProjector) Name() string { return "windsurf" }

func (p *WindsurfProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	paths := []string{"AGENTS.md", ".windsurfrules", ".windsurf/hooks.json"}
	for _, n := range rules {
		paths = append(paths, ".windsurf/rules/"+n+".md")
	}
	for _, n := range skills {
		paths = append(paths, ".windsurf/skills/"+n+"/", ".windsurf/skills/"+n+"/SKILL.md")
	}
	return paths
}

func (p *WindsurfProjector) Project(root string, ms *MergedSet) error {
	windsurfDir := filepath.Join(root, ".windsurf")

	// Rules → .windsurf/rules/<name>.md
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if err := p.writeRule(windsurfDir, name, rule); err != nil {
			return err
		}
	}

	// Skills → .windsurf/skills/<name>/SKILL.md
	if err := projectSkills(windsurfDir, ms); err != nil {
		return err
	}

	// .windsurfrules — legacy mandate file (kept for compatibility)
	if err := p.writeWindsurfRules(root, ms); err != nil {
		return err
	}

	// Agents → AGENTS.md (flat markdown, Windsurf has no structured agents dir)
	if err := writeAGENTSMD(root, ms); err != nil {
		return err
	}

	// .windsurf/hooks.json
	return p.writeHooks(root)
}

func (p *WindsurfProjector) writeRule(windsurfDir, name string, rule *AgenticFile) error {
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

	path := filepath.Join(windsurfDir, "rules", name+".md")
	return writeFile(path, []byte(sb.String()))
}

func (p *WindsurfProjector) writeWindsurfRules(root string, ms *MergedSet) error {
	var sb strings.Builder
	if ms.LoreMD != "" {
		sb.WriteString(ms.LoreMD)
		sb.WriteString("\n\n")
	}
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		sb.WriteString(fmt.Sprintf("## %s\n\n", rule.Name))
		sb.WriteString(rule.Body)
		sb.WriteString("\n\n")
	}
	return writeFile(filepath.Join(root, ".windsurfrules"), []byte(sb.String()))
}

// windsurfHooksConfig matches .windsurf/hooks.json format.
type windsurfHooksConfig struct {
	Hooks map[string][]windsurfHook `json:"hooks"`
}

type windsurfHook struct {
	Command string `json:"command"`
}

func (p *WindsurfProjector) writeHooks(root string) error {
	h := func(cmd string) []windsurfHook { return []windsurfHook{{Command: cmd}} }
	cfg := windsurfHooksConfig{
		Hooks: map[string][]windsurfHook{
			"pre_read_code":        h("lore hook pre-tool-use"),
			"pre_write_code":       h("lore hook pre-tool-use"),
			"pre_run_command":      h("lore hook pre-tool-use"),
			"pre_mcp_tool_use":     h("lore hook pre-tool-use"),
			"post_read_code":       h("lore hook post-tool-use"),
			"post_write_code":      h("lore hook post-tool-use"),
			"post_run_command":     h("lore hook post-tool-use"),
			"post_mcp_tool_use":    h("lore hook post-tool-use"),
			"pre_user_prompt":      h("lore hook prompt-submit"),
			"post_cascade_response": h("lore hook stop"),
		},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal windsurf hooks: %w", err)
	}
	return writeFile(filepath.Join(root, ".windsurf", "hooks.json"), append(data, '\n'))
}
