package main

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func cmdHook(args []string) {
	if len(args) == 0 {
		fmt.Print(hookHelpText)
		return
	}

	hookName := args[0]
	if hookName == "--help" || hookName == "-h" {
		fmt.Print(hookHelpText)
		return
	}

	// Read stdin (hook input from platform)
	var input map[string]interface{}
	if stat, _ := os.Stdin.Stat(); (stat.Mode() & os.ModeCharDevice) == 0 {
		data, err := io.ReadAll(os.Stdin)
		if err == nil && len(data) > 0 {
			json.Unmarshal(data, &input)
		}
	}

	switch hookName {
	case "pre-tool-use":
		hookPreToolUse(input)
	case "post-tool-use":
		hookPostToolUse(input)
	case "prompt-submit":
		hookPromptSubmit(input)
	default:
		fatal("Unknown hook: %s\nValid hooks: pre-tool-use, post-tool-use, prompt-submit", hookName)
	}
}

// --- Pre-Tool-Use Hook ---
// Guards: memory protection, harness guard, search nudge.

func hookPreToolUse(input map[string]interface{}) {
	tool, _ := input["tool_name"].(string)
	inputData, _ := input["tool_input"].(map[string]interface{})
	filePath := extractFilePath(tool, inputData)
	hc := readHookConfig()

	// 1. Memory guard: block MEMORY.md access at project root
	if hc.BeforeTool.MemoryGuard && isMemoryAccess(tool, filePath) {
		emitJSON(preToolUseOutput("deny", loadPrompt("beforeTool/memoryGuard.md")))
		return
	}

	// 2. Auto-memory redirect: block writes, redirect reads
	if hc.BeforeTool.AutoMemoryRedirect && isClaudeAutoMemory(filePath) {
		if isWriteTool(tool) {
			emitJSON(preToolUseOutput("deny", loadPrompt("beforeTool/autoMemoryRedirect.write.md")))
			return
		}
		if isReadTool(tool) {
			emitJSON(preToolUseOutput("", loadPrompt("beforeTool/autoMemoryRedirect.read.md")))
			return
		}
	}

	// 3. Harness guard: operator-gate writes to ~/.lore/
	if hc.BeforeTool.HarnessGuard && isWriteTool(tool) && isGlobalPath(filePath) {
		emitJSON(preToolUseOutput("ask", loadPrompt("beforeTool/harnessGuard.md")))
		return
	}

	// 4. Search nudge: suggest semantic search for indexed paths
	if hc.BeforeTool.SearchNudge && isReadTool(tool) && isIndexedPath(filePath) {
		emitJSON(preToolUseOutput("", loadPrompt("beforeTool/searchNudge.md")))
		return
	}
}

// --- Post-Tool-Use Hook ---
// Memory nudge: adaptive knowledge capture reminders.

func hookPostToolUse(input map[string]interface{}) {
	tool, _ := input["tool_name"].(string)

	// Skip silent tools (reads, knowledge writes)
	if isReadOnlyTool(tool) || isKnowledgeTool(tool) {
		return
	}

	// Track bash command count for adaptive nudging
	if isBashTool(tool) {
		hc := readHookConfig()
		mn := hc.AfterTool.MemoryNudge
		if !mn.Enabled {
			return
		}

		count := incrementBashCounter()

		if count == 1 {
			output := map[string]interface{}{
				"additionalContext": "\x1b[92m" + loadPrompt("afterTool/memoryNudge.first.md") + "\x1b[0m",
			}
			emitJSON(output)
			return
		}

		if count%mn.NudgeEvery == 0 {
			msg := "\x1b[92m" + loadPrompt("afterTool/memoryNudge.nudge.md") + "\x1b[0m"
			if count >= mn.WarnAt {
				msg = "\x1b[93m" + loadPrompt("afterTool/memoryNudge.warn.md") + "\x1b[0m"
			}
			output := map[string]interface{}{
				"additionalContext": msg,
			}
			emitJSON(output)
			return
		}
	}
}

// --- Prompt Submit Hook ---
// Ambiguity scan on user input.

func hookPromptSubmit(input map[string]interface{}) {
	hc := readHookConfig()
	if !hc.OnPrompt.AmbiguityNudge {
		return
	}

	userInput, _ := input["user_input"].(string)
	if userInput == "" {
		return
	}

	ambiguities := scanAmbiguity(userInput)
	if len(ambiguities) > 0 {
		tmpl := loadPrompt("onPrompt/ambiguityNudge.md")
		msg := "\x1b[93m" + strings.ReplaceAll(tmpl, "{{TERMS}}", strings.Join(ambiguities, ", ")) + "\x1b[0m"
		output := map[string]interface{}{
			"additionalContext": msg,
		}
		emitJSON(output)
	}
}

// --- Helpers ---

func extractFilePath(tool string, input map[string]interface{}) string {
	switch tool {
	case "Read", "Write", "Edit":
		if fp, ok := input["file_path"].(string); ok {
			return fp
		}
	case "Glob":
		if p, ok := input["path"].(string); ok {
			return p
		}
	case "Grep":
		if p, ok := input["path"].(string); ok {
			return p
		}
	case "Bash":
		if cmd, ok := input["command"].(string); ok {
			return cmd // best effort for bash
		}
	}
	return ""
}

func isMemoryAccess(tool, filePath string) bool {
	if tool != "Read" && tool != "Write" && tool != "Edit" {
		return false
	}
	base := filepath.Base(filePath)
	if base != "MEMORY.md" {
		return false
	}
	// Only block if it's at the project root level
	cwd, _ := os.Getwd()
	expected := filepath.Join(cwd, "MEMORY.md")
	abs, _ := filepath.Abs(filePath)
	return abs == expected
}

func isClaudeAutoMemory(filePath string) bool {
	if filePath == "" {
		return false
	}
	abs, _ := filepath.Abs(filePath)
	home, _ := os.UserHomeDir()
	claudeProjects := filepath.Join(home, ".claude", "projects")
	return strings.HasPrefix(abs, claudeProjects) && strings.Contains(abs, string(filepath.Separator)+"memory"+string(filepath.Separator))
}

func isGlobalPath(filePath string) bool {
	if filePath == "" {
		return false
	}
	abs, _ := filepath.Abs(filePath)
	gp := globalPath()
	return strings.HasPrefix(abs, gp+string(filepath.Separator)) || abs == gp
}

func isIndexedPath(filePath string) bool {
	if filePath == "" {
		return false
	}
	indexedPrefixes := []string{
		"docs/",
		".lore/AGENTIC/SKILLS/",
		".lore/AGENTIC/RULES/",
	}
	for _, prefix := range indexedPrefixes {
		if strings.Contains(filePath, prefix) {
			return true
		}
	}
	return false
}

func isWriteTool(tool string) bool {
	return tool == "Write" || tool == "Edit"
}

func isReadTool(tool string) bool {
	return tool == "Read" || tool == "Glob"
}

func isReadOnlyTool(tool string) bool {
	return tool == "Read" || tool == "Glob" || tool == "Grep" || tool == "WebFetch" || tool == "WebSearch"
}

func isBashTool(tool string) bool {
	return tool == "Bash"
}

func isKnowledgeTool(tool string) bool {
	return strings.HasPrefix(tool, "mcp__MEMORY__") || strings.HasPrefix(tool, "lore_")
}

// preToolUseOutput builds a PreToolUse hook response.
// For "deny"/"ask": message goes in permissionDecisionReason.
// For "" (no decision, just context): message goes in additionalContext.
func preToolUseOutput(decision, message string) map[string]interface{} {
	hso := map[string]interface{}{
		"hookEventName": "PreToolUse",
	}
	if decision != "" {
		hso["permissionDecision"] = decision
		hso["permissionDecisionReason"] = message
	} else {
		hso["additionalContext"] = message
	}
	return map[string]interface{}{
		"hookSpecificOutput": hso,
	}
}

func emitJSON(v interface{}) {
	data, _ := json.Marshal(v)
	fmt.Println(string(data))
}

// --- Bash counter (persistent across hook invocations within a session) ---

func bashCounterPath() string {
	cwd, _ := os.Getwd()
	hash := fmt.Sprintf("%x", md5.Sum([]byte(cwd)))
	// Try .git/ first, fall back to /tmp/
	gitPath := filepath.Join(cwd, ".git", fmt.Sprintf("lore-bash-count-%s.json", hash[:8]))
	if _, err := os.Stat(filepath.Dir(gitPath)); err == nil {
		return gitPath
	}
	return filepath.Join(os.TempDir(), fmt.Sprintf("lore-bash-count-%s.json", hash[:8]))
}

func incrementBashCounter() int {
	path := bashCounterPath()

	var state struct {
		Count   int    `json:"count"`
		Updated string `json:"updated"`
	}

	if data, err := os.ReadFile(path); err == nil {
		json.Unmarshal(data, &state)
	}

	state.Count++
	state.Updated = time.Now().Format(time.RFC3339)

	data, _ := json.Marshal(state)
	os.WriteFile(path, data, 0644)

	return state.Count
}

// --- Ambiguity scanner ---

var ambiguityPatterns = []struct {
	pattern string
	label   string
}{
	{"recently", "relative time"},
	{"a few", "vague quantity"},
	{"some of", "vague scope"},
	{"the usual", "assumed knowledge"},
	{"etc", "open scope"},
	{"and so on", "open scope"},
	{"as needed", "vague criteria"},
	{"appropriate", "vague criteria"},
	{"similar", "vague criteria"},
}

func scanAmbiguity(input string) []string {
	lower := strings.ToLower(input)
	var found []string
	seen := map[string]bool{}
	for _, p := range ambiguityPatterns {
		if strings.Contains(lower, p.pattern) && !seen[p.label] {
			found = append(found, p.label)
			seen[p.label] = true
		}
	}
	return found
}

// --- Hook logging ---

func logHookEvent(hook, event string, outputSize int) {
	if os.Getenv("LORE_HOOK_LOG") != "1" {
		return
	}

	cwd, _ := os.Getwd()
	logPath := filepath.Join(cwd, ".git", "lore-hook-events.jsonl")
	if _, err := os.Stat(filepath.Dir(logPath)); err != nil {
		logPath = filepath.Join(os.TempDir(), "lore-hook-events.jsonl")
	}

	entry := map[string]interface{}{
		"ts":          time.Now().Format(time.RFC3339),
		"hook":        hook,
		"event":       event,
		"output_size": outputSize,
	}
	data, _ := json.Marshal(entry)

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.WriteString(string(data) + "\n")
}

const hookHelpText = `Handle platform hook callbacks.

Usage: lore hook <name>

This command is called by platform hooks (e.g., Claude Code settings.json),
not directly by users.

Hooks:
  pre-tool-use     Guards: memory protection, harness guard, search nudge
  post-tool-use    Adaptive knowledge capture reminders
  prompt-submit    Ambiguity scan on user input

Hook input is read from stdin as JSON (provided by the platform).
`
