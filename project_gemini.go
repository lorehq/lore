package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"text/template"
)

// GeminiProjector generates Gemini CLI platform files.
type GeminiProjector struct{}

func (p *GeminiProjector) Name() string { return "gemini" }

func (p *GeminiProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	// Gemini inlines rules into GEMINI.md — no separate rule files
	paths := []string{"GEMINI.md", ".gemini/settings.json"}
	for _, n := range skills {
		paths = append(paths, ".gemini/skills/"+n+"/", ".gemini/skills/"+n+"/SKILL.md")
	}
	for _, n := range agents {
		paths = append(paths, ".gemini/agents/"+n+".md")
	}
	return paths
}

func (p *GeminiProjector) Project(root string, ms *MergedSet) error {
	geminiDir := filepath.Join(root, ".gemini")

	// Skills → .gemini/skills/<name>/SKILL.md
	if err := projectSkills(geminiDir, ms); err != nil {
		return err
	}

	// Agents → .gemini/agents/<name>.md
	if err := projectAgents(geminiDir, ms); err != nil {
		return err
	}

	// GEMINI.md — rules inline (Gemini has no dedicated rules directory)
	if err := p.writeGEMINIMD(root, ms); err != nil {
		return err
	}

	// .gemini/settings.json with hooks
	return p.writeSettings(root)
}

func (p *GeminiProjector) writeGEMINIMD(root string, ms *MergedSet) error {
	tmplData, err := templateFS.ReadFile("templates/gemini.md.tmpl")
	if err != nil {
		return fmt.Errorf("read gemini template: %w", err)
	}

	tmpl, err := template.New("gemini").Parse(string(tmplData))
	if err != nil {
		return fmt.Errorf("parse gemini template: %w", err)
	}

	type ruleInfo struct {
		Name string
		Body string
	}

	var ruleList []ruleInfo
	for _, name := range sortedKeys(ms.Rules) {
		r := ms.Rules[name]
		ruleList = append(ruleList, ruleInfo{Name: r.Name, Body: r.Body})
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, struct {
		LoreMD string
		Rules  []ruleInfo
	}{ms.LoreMD, ruleList}); err != nil {
		return fmt.Errorf("execute gemini template: %w", err)
	}

	return writeFile(filepath.Join(root, "GEMINI.md"), []byte(sb.String()))
}

// geminiSettings matches .gemini/settings.json hook format.
type geminiSettings struct {
	Hooks map[string][]geminiHookGroup `json:"hooks"`
}

type geminiHookGroup struct {
	Matcher string       `json:"matcher,omitempty"`
	Hooks   []geminiHook `json:"hooks"`
}

type geminiHook struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Name    string `json:"name,omitempty"`
}

func (p *GeminiProjector) writeSettings(root string) error {
	cfg := geminiSettings{
		Hooks: map[string][]geminiHookGroup{
			"BeforeTool": {
				{Hooks: []geminiHook{{
					Type:    "command",
					Command: "lore hook pre-tool-use",
					Name:    "lore-pre-tool",
				}}},
			},
			"AfterTool": {
				{Hooks: []geminiHook{{
					Type:    "command",
					Command: "lore hook post-tool-use",
					Name:    "lore-post-tool",
				}}},
			},
			"BeforeAgent": {
				{Hooks: []geminiHook{{
					Type:    "command",
					Command: "lore hook prompt-submit",
					Name:    "lore-prompt",
				}}},
			},
		},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal gemini settings: %w", err)
	}
	return writeFile(filepath.Join(root, ".gemini", "settings.json"), append(data, '\n'))
}
