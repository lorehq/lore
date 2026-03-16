package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// Projector generates platform-specific output from a merged content set.
type Projector interface {
	Name() string
	Project(root string, ms *MergedSet) error
	// OutputPaths returns the relative paths this projector would create.
	// Directories end with "/". Files include the actual filename.
	OutputPaths(rules, skills, agents []string, hasMCP bool) []string
}

// projectorRegistry maps platform names to their projectors.
var projectorRegistry = map[string]Projector{
	"claude":   &ClaudeProjector{},
	"copilot":  &CopilotProjector{},
	"cursor":   &CursorProjector{},
	"gemini":   &GeminiProjector{},
	"windsurf": &WindsurfProjector{},
	"opencode": &OpenCodeProjector{},
	"cline":    &ClineProjector{},
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
		case bool:
			sb.WriteString(fmt.Sprintf("%s: %t\n", k, val))
		case map[string]bool:
			if len(val) == 0 {
				continue
			}
			sb.WriteString(fmt.Sprintf("%s:\n", k))
			for _, bk := range sortedKeys(val) {
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
// Universal SKILL.md format — all 7 platforms support this.
// Frontmatter includes `name` and `description` (the universal common denominator).
func projectSkills(baseDir string, ms *MergedSet) error {
	for _, name := range sortedKeys(ms.Skills) {
		skill := ms.Skills[name]
		fm := map[string]interface{}{}
		fm["name"] = name
		if skill.Description != "" {
			fm["description"] = skill.Description
		}
		if skill.Type != "" {
			fm["type"] = skill.Type
		}
		if skill.UserInvocable != nil {
			fm["user-invocable"] = *skill.UserInvocable
		}
		if len(skill.AllowedTools) > 0 {
			fm["allowed-tools"] = skill.AllowedTools
		}
		if skill.Agent != "" {
			fm["agent"] = skill.Agent
		}
		content := renderFrontmatter(fm) + "\n" + skill.Body + "\n"
		skillDir := filepath.Join(baseDir, "skills", name)
		path := filepath.Join(skillDir, "SKILL.md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write skill %s: %w", name, err)
		}
		// Copy supporting files from source directory (standard layout only).
		// Per the Agent Skills open standard, skills can contain scripts/,
		// references/, assets/, and other supporting files alongside SKILL.md.
		if skill.SourceDir != "" {
			if err := copySkillResources(skill.SourceDir, skillDir); err != nil {
				return fmt.Errorf("copy skill resources %s: %w", name, err)
			}
		}
	}
	return nil
}

// copySkillResources copies all files from a skill source directory to the
// projected skill directory, EXCEPT SKILL.md (which is handled by projectSkills).
// This enables deep skills per the Agent Skills open standard — scripts/,
// references/, assets/, and other supporting files are projected alongside SKILL.md.
func copySkillResources(srcDir, dstDir string) error {
	return filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		rel, _ := filepath.Rel(srcDir, path)
		if rel == "." || rel == "SKILL.md" {
			return nil // skip root and SKILL.md (handled separately)
		}
		dst := filepath.Join(dstDir, rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil // skip unreadable files
		}
		return writeFile(dst, data)
	})
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
		if len(agent.Skills) > 0 {
			fm["skills"] = agent.Skills
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
		if len(rule.Globs) > 0 {
			fm["paths"] = rule.Globs
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
	if err := projectAgents(claudeDir, ms); err != nil {
		return err
	}

	return nil
}

// userInvocableSkills returns user-invocable skills, sorted by name.
// Skills are user-invocable by default — only excluded if explicitly set to false.
func userInvocableSkills(ms *MergedSet) []*AgenticFile {
	var out []*AgenticFile
	for _, name := range sortedKeys(ms.Skills) {
		skill := ms.Skills[name]
		if skill.UserInvocable != nil && !*skill.UserInvocable {
			continue
		}
		out = append(out, skill)
	}
	return out
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
		if len(agent.Skills) > 0 {
			fm["skills"] = agent.Skills
		}
		content := renderFrontmatter(fm) + "\n" + agent.Body + "\n"
		path := filepath.Join(baseDir, "agents", agent.Name+".md")
		if err := writeFile(path, []byte(content)); err != nil {
			return fmt.Errorf("write agent %s: %w", agent.Name, err)
		}
	}
	return nil
}

// writeMCPConfig writes the MCP config file. Fully generated — we own these files.
// Bundle + project MCP servers are already merged in the MergedSet.
func writeMCPConfig(path string, servers []MCPServer) error {
	serversMap := make(map[string]interface{})
	for _, s := range servers {
		entry := map[string]interface{}{
			"command": s.Command,
			"args":    s.Args,
		}
		if len(s.Env) > 0 {
			entry["env"] = s.Env
		}
		serversMap[s.Name] = entry
	}
	config := map[string]interface{}{
		"mcpServers": serversMap,
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal MCP config: %w", err)
	}
	return writeFile(path, append(data, '\n'))
}

// writeMCPConfigMerge merges Lore's MCP servers into an existing global config file.
// Unlike writeMCPConfig, this does NOT fully own the file — it reads existing servers,
// merges Lore's servers on top by name, and writes back. Used for global config paths
// (Cline, Windsurf) that other tools also write to.
func writeMCPConfigMerge(path string, servers []MCPServer) error {
	existing := make(map[string]json.RawMessage)

	if data, err := os.ReadFile(path); err == nil {
		var cfg struct {
			MCPServers map[string]json.RawMessage `json:"mcpServers"`
		}
		cleaned := stripJSONComments(data)
		if json.Unmarshal(cleaned, &cfg) == nil && cfg.MCPServers != nil {
			existing = cfg.MCPServers
		}
	}

	// Overwrite with Lore's servers
	for _, s := range servers {
		entry := map[string]interface{}{
			"command": s.Command,
			"args":    s.Args,
		}
		if len(s.Env) > 0 {
			entry["env"] = s.Env
		}
		raw, err := json.Marshal(entry)
		if err != nil {
			return fmt.Errorf("marshal MCP server %s: %w", s.Name, err)
		}
		existing[s.Name] = json.RawMessage(raw)
	}

	// Build stable JSON with sorted keys (Go maps are non-deterministic)
	names := sortedKeys(existing)
	var sb strings.Builder
	sb.WriteString("{\n  \"mcpServers\": {")
	for i, name := range names {
		if i > 0 {
			sb.WriteString(",")
		}
		keyJSON, _ := json.Marshal(name)
		var indented bytes.Buffer
		if err := json.Indent(&indented, existing[name], "    ", "  "); err != nil {
			sb.WriteString(fmt.Sprintf("\n    %s: %s", keyJSON, string(existing[name])))
			continue
		}
		sb.WriteString(fmt.Sprintf("\n    %s: %s", keyJSON, indented.String()))
	}
	if len(names) > 0 {
		sb.WriteString("\n  ")
	}
	sb.WriteString("}\n}\n")

	return writeFile(path, []byte(sb.String()))
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

// filterOut returns a new slice with entries in the exclude set removed.
func filterOut(names []string, exclude map[string]bool) []string {
	var out []string
	for _, n := range names {
		if !exclude[n] {
			out = append(out, n)
		}
	}
	return out
}
