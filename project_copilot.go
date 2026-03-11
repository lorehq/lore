package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"text/template"
)

// CopilotProjector generates GitHub Copilot platform files.
type CopilotProjector struct{}

func (p *CopilotProjector) Name() string { return "copilot" }

func (p *CopilotProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	paths := []string{"AGENTS.md", ".github/copilot-instructions.md", ".github/hooks/lore.json"}
	for _, n := range rules {
		paths = append(paths, ".github/instructions/"+n+".instructions.md")
	}
	for _, n := range skills {
		paths = append(paths, ".github/skills/"+n+"/", ".github/skills/"+n+"/SKILL.md")
	}
	for _, n := range agents {
		paths = append(paths, ".github/agents/"+n+".agent.md")
	}
	return paths
}

func (p *CopilotProjector) Project(root string, ms *MergedSet) error {
	// Rules → .github/instructions/<name>.instructions.md
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if err := p.writeRule(root, name, rule); err != nil {
			return err
		}
	}

	// Skills → .github/skills/<name>/SKILL.md
	if err := projectSkills(filepath.Join(root, ".github"), ms); err != nil {
		return err
	}

	// Agents → .github/agents/<name>.agent.md
	for _, name := range sortedKeys(ms.Agents) {
		agent := ms.Agents[name]
		if err := p.writeAgent(root, agent); err != nil {
			return err
		}
	}

	// .github/copilot-instructions.md
	if err := p.writeCopilotInstructions(root, ms); err != nil {
		return err
	}

	// .github/hooks/lore.json
	if err := p.writeHooks(root); err != nil {
		return err
	}

	// AGENTS.md at root
	return writeAGENTSMD(root, ms)
}

func (p *CopilotProjector) writeRule(root, name string, rule *AgenticFile) error {
	fm := map[string]interface{}{}
	if rule.Description != "" {
		fm["description"] = rule.Description
	}
	if len(rule.Globs) > 0 {
		fm["applyTo"] = rule.Globs
	}

	content := renderFrontmatter(fm) + "\n" + rule.Body + "\n"
	path := filepath.Join(root, ".github", "instructions", name+".instructions.md")
	return writeFile(path, []byte(content))
}

func (p *CopilotProjector) writeAgent(root string, agent *AgenticFile) error {
	fm := map[string]interface{}{}
	if agent.Description != "" {
		fm["description"] = agent.Description
	}
	if len(agent.Tools) > 0 {
		fm["tools"] = agent.Tools
	}
	if len(agent.Skills) > 0 {
		fm["handoffs"] = agent.Skills
	}

	content := renderFrontmatter(fm) + "\n" + agent.Body + "\n"
	path := filepath.Join(root, ".github", "agents", agent.Name+".agent.md")
	return writeFile(path, []byte(content))
}

func (p *CopilotProjector) writeCopilotInstructions(root string, ms *MergedSet) error {
	tmplData, err := templateFS.ReadFile("templates/copilot-instructions.md.tmpl")
	if err != nil {
		return fmt.Errorf("read copilot template: %w", err)
	}

	tmpl, err := template.New("copilot").Parse(string(tmplData))
	if err != nil {
		return fmt.Errorf("parse copilot template: %w", err)
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
		return fmt.Errorf("execute copilot template: %w", err)
	}

	return writeFile(filepath.Join(root, ".github", "copilot-instructions.md"), []byte(sb.String()))
}

// copilotHooksConfig matches .github/hooks/<name>.json format.
type copilotHooksConfig struct {
	PreToolUse          []copilotHookEntry `json:"preToolUse,omitempty"`
	PostToolUse         []copilotHookEntry `json:"postToolUse,omitempty"`
	UserPromptSubmitted []copilotHookEntry `json:"userPromptSubmitted,omitempty"`
}

type copilotHookEntry struct {
	Command string `json:"command"`
}

func (p *CopilotProjector) writeHooks(root string) error {
	cfg := copilotHooksConfig{
		PreToolUse:          []copilotHookEntry{{Command: "lore hook pre-tool-use"}},
		PostToolUse:         []copilotHookEntry{{Command: "lore hook post-tool-use"}},
		UserPromptSubmitted: []copilotHookEntry{{Command: "lore hook prompt-submit"}},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal copilot hooks: %w", err)
	}
	return writeFile(filepath.Join(root, ".github", "hooks", "lore.json"), append(data, '\n'))
}
