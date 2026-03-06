package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// Projector generates platform-specific output from a merged AGENTIC set.
type Projector interface {
	Name() string
	Project(root string, ms *MergedSet) error
}

// projectorRegistry maps platform names to their projectors.
var projectorRegistry = map[string]Projector{
	"claude":   &ClaudeProjector{},
	"copilot":  &CopilotProjector{},
	"cursor":   &CursorProjector{},
	"gemini":   &GeminiProjector{},
	"windsurf": &WindsurfProjector{},
	"opencode": &OpenCodeProjector{},
}

// writeFile is a helper that creates parent dirs and writes content.
func writeFile(path string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, content, 0644)
}

// renderFrontmatter renders YAML frontmatter fields into a string.
func renderFrontmatter(fields map[string]interface{}) string {
	if len(fields) == 0 {
		return ""
	}
	// Stable key order: name first, description second, rest sorted
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	// Simple sort with name/description priority
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && fmKeyLess(keys[j], keys[j-1]); j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}

	var sb strings.Builder
	sb.WriteString("---\n")
	for _, k := range keys {
		switch val := fields[k].(type) {
		case string:
			sb.WriteString(fmt.Sprintf("%s: %s\n", k, val))
		case []string:
			if len(val) == 0 {
				continue
			}
			sb.WriteString(fmt.Sprintf("%s:\n", k))
			for _, item := range val {
				sb.WriteString(fmt.Sprintf("  - %s\n", item))
			}
		case map[string]bool:
			if len(val) == 0 {
				continue
			}
			sb.WriteString(fmt.Sprintf("%s:\n", k))
			for _, bk := range sortedMapKeys(val) {
				sb.WriteString(fmt.Sprintf("  %s: true\n", bk))
			}
		}
	}
	sb.WriteString("---\n")
	return sb.String()
}

// fmKeyLess orders frontmatter keys: name < description < everything else (alpha).
func fmKeyLess(a, b string) bool {
	pri := func(s string) int {
		switch s {
		case "name":
			return 0
		case "description":
			return 1
		default:
			return 2
		}
	}
	pa, pb := pri(a), pri(b)
	if pa != pb {
		return pa < pb
	}
	return a < b
}

// stripJSONComments removes // line comments and /* */ block comments from JSON.
// This allows config files to contain human-readable annotations.
func stripJSONComments(data []byte) []byte {
	src := string(data)
	var out []byte
	i := 0
	for i < len(src) {
		// Inside a string literal — pass through unchanged
		if src[i] == '"' {
			out = append(out, src[i])
			i++
			for i < len(src) {
				out = append(out, src[i])
				if src[i] == '\\' {
					i++
					if i < len(src) {
						out = append(out, src[i])
					}
				} else if src[i] == '"' {
					break
				}
				i++
			}
			i++
			continue
		}
		// Line comment
		if i+1 < len(src) && src[i] == '/' && src[i+1] == '/' {
			for i < len(src) && src[i] != '\n' {
				i++
			}
			continue
		}
		// Block comment
		if i+1 < len(src) && src[i] == '/' && src[i+1] == '*' {
			i += 2
			for i+1 < len(src) && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			i += 2
			continue
		}
		out = append(out, src[i])
		i++
	}
	return out
}

// projectSkills writes skills to <baseDir>/skills/<name>/SKILL.md.
// Universal SKILL.md format — all 6 platforms support this.
// Frontmatter includes `name` and `description` (the universal common denominator).
func projectSkills(baseDir string, ms *MergedSet) error {
	for _, name := range sortedKeys(ms.Skills) {
		skill := ms.Skills[name]
		fm := map[string]interface{}{}
		fm["name"] = name
		if skill.Description != "" {
			fm["description"] = skill.Description
		}
		content := renderFrontmatter(fm) + "\n" + skill.Body + "\n"
		path := filepath.Join(baseDir, "skills", name, "SKILL.md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write skill %s: %w", name, err)
		}
	}
	return nil
}

// projectAgents writes agents to <baseDir>/agents/<name>.md.
func projectAgents(baseDir string, ms *MergedSet) error {
	for _, name := range sortedKeys(ms.Agents) {
		agent := ms.Agents[name]
		fm := map[string]interface{}{}
		fm["name"] = agent.Name
		if agent.Description != "" {
			fm["description"] = agent.Description
		}
		if agent.Model != "" {
			fm["model"] = agent.Model
		}
		if len(agent.Tools) > 0 {
			fm["tools"] = agent.Tools
		}
		content := renderFrontmatter(fm) + "\n" + agent.Body + "\n"
		path := filepath.Join(baseDir, "agents", agent.Name+".md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write agent %s: %w", agent.Name, err)
		}
	}
	return nil
}

// projectClaudeDir writes rules, skills, and agents to .claude/ in the Claude/OpenCode
// shared format. Both Claude and OpenCode read from this directory structure.
func projectClaudeDir(root string, ms *MergedSet) error {
	claudeDir := filepath.Join(root, ".claude")

	// Rules → .claude/rules/<name>.md (Claude-specific paths frontmatter)
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		fm := map[string]interface{}{}
		if rule.Description != "" {
			fm["description"] = rule.Description
		}
		if len(rule.Paths) > 0 {
			fm["paths"] = rule.Paths
		}
		content := renderFrontmatter(fm) + "\n" + rule.Body + "\n"
		path := filepath.Join(claudeDir, "rules", name+".md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write rule %s: %w", name, err)
		}
	}

	// Skills + Agents via shared helpers
	if err := projectSkills(claudeDir, ms); err != nil {
		return err
	}
	return projectAgents(claudeDir, ms)
}

// writeAGENTSMD generates AGENTS.md at the project root from the agents template.
func writeAGENTSMD(root string, ms *MergedSet) error {
	tmplData, err := templateFS.ReadFile("templates/agents.md.tmpl")
	if err != nil {
		return fmt.Errorf("read agents template: %w", err)
	}

	tmpl, err := template.New("agents").Parse(string(tmplData))
	if err != nil {
		return fmt.Errorf("parse agents template: %w", err)
	}

	type agentInfo struct {
		Name        string
		Description string
	}
	var agentList []agentInfo
	for _, name := range sortedKeys(ms.Agents) {
		agent := ms.Agents[name]
		agentList = append(agentList, agentInfo{
			Name:        agent.Name,
			Description: agent.Description,
		})
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, struct {
		LoreMD string
		Agents []agentInfo
	}{ms.LoreMD, agentList}); err != nil {
		return fmt.Errorf("execute agents template: %w", err)
	}

	return writeFile(filepath.Join(root, "AGENTS.md"), []byte(sb.String()))
}

// projectAgentsRecord writes agents with tools as record format (key: true)
// instead of YAML arrays. Used by OpenCode which requires this format.
func projectAgentsRecord(baseDir string, ms *MergedSet) error {
	for _, name := range sortedKeys(ms.Agents) {
		agent := ms.Agents[name]
		fm := map[string]interface{}{}
		fm["name"] = agent.Name
		if agent.Description != "" {
			fm["description"] = agent.Description
		}
		if agent.Model != "" {
			fm["model"] = agent.Model
		}
		if len(agent.Tools) > 0 {
			toolMap := make(map[string]bool, len(agent.Tools))
			for _, t := range agent.Tools {
				toolMap[strings.ToLower(t)] = true
			}
			fm["tools"] = toolMap
		}
		content := renderFrontmatter(fm) + "\n" + agent.Body + "\n"
		path := filepath.Join(baseDir, "agents", agent.Name+".md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write agent %s: %w", agent.Name, err)
		}
	}
	return nil
}

// sortedMapKeys returns map[string]bool keys in sorted order.
func sortedMapKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

// sortedKeys returns map keys in a stable order (sorted).
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple insertion sort — these maps are small
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}
