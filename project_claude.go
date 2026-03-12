package main

import (
	"crypto/rand"
	"encoding/hex"
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

func (p *ClaudeProjector) OutputPaths(rules, skills, agents []string, hasMCP bool) []string {
	paths := []string{"CLAUDE.md", ".claude/settings.json"}
	if hasMCP {
		paths = append(paths, ".mcp.json")
	}
	for _, n := range rules {
		paths = append(paths, ".claude/rules/"+n+".md")
	}
	for _, n := range skills {
		paths = append(paths, ".claude/skills/"+n+"/", ".claude/skills/"+n+"/SKILL.md")
	}
	for _, n := range agents {
		paths = append(paths, ".claude/agents/"+n+".md")
	}
	return paths
}

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

	// .mcp.json — merge bundle MCP servers with existing user config
	if len(ms.MCP) > 0 {
		if err := writeMCPConfig(filepath.Join(root, ".mcp.json"), ms.MCP); err != nil {
			return err
		}
	}

	return nil
}

type claudeTemplateData struct {
	Nonce        string
	LoreMD       string
	Rules        []*AgenticFile
	ProjectRules []*AgenticFile
}

// readOrCreateNonce reads the project nonce from .lore/.session-nonce,
// or generates a new one if it doesn't exist. The nonce is stable for
// the life of the project — resumed sessions see the same value.
func readOrCreateNonce(root string) string {
	noncePath := filepath.Join(root, ".lore", ".session-nonce")
	if data, err := os.ReadFile(noncePath); err == nil {
		if n := strings.TrimSpace(string(data)); len(n) > 0 {
			return n
		}
	}
	// Generate 4 random bytes → 8 hex chars, take first 4
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "0000"
	}
	nonce := hex.EncodeToString(b)[:4]
	os.WriteFile(noncePath, []byte(nonce+"\n"), 0644)
	return nonce
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

	// Separate bundle/global vs project rules for template
	globalDir := globalPath()
	bundleDirs := activeBundleDirs()
	isNonProject := func(path string) bool {
		if strings.HasPrefix(path, globalDir) {
			return true
		}
		for _, bd := range bundleDirs {
			if strings.HasPrefix(path, bd) {
				return true
			}
		}
		return false
	}
	var globalRules, projectRules []*AgenticFile
	for _, name := range sortedKeys(ms.Rules) {
		rule := ms.Rules[name]
		if isNonProject(rule.Path) {
			globalRules = append(globalRules, rule)
		} else {
			projectRules = append(projectRules, rule)
		}
	}

	data := claudeTemplateData{
		Nonce:        readOrCreateNonce(root),
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
	loreHook := func(cmd string) []ClaudeHookGroup {
		return []ClaudeHookGroup{
			{Matcher: "", Hooks: []ClaudeHook{{Type: "command", Command: cmd}}},
		}
	}
	settings := ClaudeSettings{
		Hooks: map[string][]ClaudeHookGroup{
			"PreToolUse":       loreHook("lore hook pre-tool-use"),
			"PostToolUse":      loreHook("lore hook post-tool-use"),
			"UserPromptSubmit": loreHook("lore hook prompt-submit"),
			"SessionStart":     loreHook("lore hook session-start"),
			"Stop":             loreHook("lore hook stop"),
			"PreCompact":       loreHook("lore hook pre-compact"),
			"SessionEnd":       loreHook("lore hook session-end"),
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
