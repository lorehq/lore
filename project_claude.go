package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// ClaudeProjector generates Claude Code platform files.
type ClaudeProjector struct{}

func (p *ClaudeProjector) Name() string { return "claude" }

func (p *ClaudeProjector) Project(root string, ms *MergedSet) error {
	// Shared .claude/ directory (rules, skills, agents)
	if err := projectClaudeDir(root, ms); err != nil {
		return err
	}

	// CLAUDE.md from template
	if err := p.writeCLAUDEMD(root, ms); err != nil {
		return err
	}

	// .claude/settings.json with hooks
	if err := p.writeSettings(root); err != nil {
		return err
	}

	return nil
}

type claudeTemplateData struct {
	LoreMD       string
	Rules        []*AgenticFile
	ProjectRules []*AgenticFile
}

func (p *ClaudeProjector) writeCLAUDEMD(root string, ms *MergedSet) error {
	tmplData, err := templateFS.ReadFile("templates/claude.md.tmpl")
	if err != nil {
		return fmt.Errorf("read claude template: %w", err)
	}

	tmpl, err := template.New("claude").Parse(string(tmplData))
	if err != nil {
		return fmt.Errorf("parse claude template: %w", err)
	}

	// Separate global vs project rules for template
	globalDir := filepath.Join(globalPath(), "AGENTIC")
	var globalRules, projectRules []*AgenticFile
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if strings.HasPrefix(rule.Path, globalDir) {
			globalRules = append(globalRules, rule)
		} else {
			projectRules = append(projectRules, rule)
		}
	}

	data := claudeTemplateData{
		LoreMD:       ms.LoreMD,
		Rules:        globalRules,
		ProjectRules: projectRules,
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, data); err != nil {
		return fmt.Errorf("execute claude template: %w", err)
	}

	return writeFile(filepath.Join(root, "CLAUDE.md"), []byte(sb.String()))
}

// ClaudeSettings mirrors .claude/settings.json structure.
type ClaudeSettings struct {
	Hooks map[string][]ClaudeHookGroup `json:"hooks"`
}

type ClaudeHookGroup struct {
	Matcher string       `json:"matcher"`
	Hooks   []ClaudeHook `json:"hooks"`
}

type ClaudeHook struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

func (p *ClaudeProjector) writeSettings(root string) error {
	settings := ClaudeSettings{
		Hooks: map[string][]ClaudeHookGroup{
			"PreToolUse": {
				{Matcher: "", Hooks: []ClaudeHook{{Type: "command", Command: "lore hook pre-tool-use"}}},
			},
			"PostToolUse": {
				{Matcher: "", Hooks: []ClaudeHook{{Type: "command", Command: "lore hook post-tool-use"}}},
			},
			"UserPromptSubmit": {
				{Matcher: "", Hooks: []ClaudeHook{{Type: "command", Command: "lore hook prompt-submit"}}},
			},
		},
	}

	// Read existing settings and merge hooks
	settingsPath := filepath.Join(root, ".claude", "settings.json")
	if existing, err := os.ReadFile(settingsPath); err == nil {
		var existingSettings map[string]interface{}
		if json.Unmarshal(existing, &existingSettings) == nil {
			// Preserve non-hook fields
			merged := make(map[string]interface{})
			for k, v := range existingSettings {
				if k != "hooks" {
					merged[k] = v
				}
			}
			// Add our hooks
			hooksJSON, _ := json.Marshal(settings.Hooks)
			var hooksMap interface{}
			json.Unmarshal(hooksJSON, &hooksMap)
			merged["hooks"] = hooksMap

			data, err := json.MarshalIndent(merged, "", "  ")
			if err != nil {
				return fmt.Errorf("marshal settings: %w", err)
			}
			return writeFile(settingsPath, append(data, '\n'))
		}
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal settings: %w", err)
	}
	return writeFile(settingsPath, append(data, '\n'))
}
