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

	// 1. Memory guard: block MEMORY.md access at project root
	if isMemoryAccess(tool, filePath) {
		emitJSON(preToolUseOutput("deny",
			"[MEMORY-GUARD] MEMORY.md is managed by the platform. "+
				"Use fieldnotes for knowledge capture, or .lore/MEMORY.md for session notes."))
		return
	}

	// 2. Auto-memory redirect: block writes, redirect reads
	if isClaudeAutoMemory(filePath) {
		if isWriteTool(tool) {
			emitJSON(preToolUseOutput("deny",
				"[LORE-MEMORY] BLOCKED: Do not write to Claude auto-memory (~/.claude/projects/*/memory/).\n"+
					"Lore uses shared Redis hot memory so all platforms benefit.\n\n"+
					"Instead use these MCP tools:\n"+
					"  - lore_hot_write: save a fact or observation (key + content)\n"+
					"  - lore_hot_session_note: record session context (decisions, scope)\n"+
					"  - lore_hot_fieldnote: draft a fieldnote for a non-obvious snag\n\n"+
					"These persist in Redis and are accessible from Claude, Cursor, Gemini, and all other platforms."))
			return
		}
		if isReadTool(tool) {
			emitJSON(preToolUseOutput("",
				"[LORE-MEMORY] Skip auto-memory reads. Use Lore's shared memory instead:\n"+
					"  - lore_hot_recall: recall recent facts and session context from Redis\n"+
					"  - lore_search: semantic search across the DATABANK\n"+
					"  - Grep/Glob on ~/.lore/MEMORY/DATABANK/ for direct file access\n\n"+
					"These are shared across all platforms — not just Claude."))
			return
		}
	}

	// 3. Harness guard: operator-gate writes to ~/.lore/
	if isWriteTool(tool) && isGlobalPath(filePath) {
		emitJSON(preToolUseOutput("ask",
			"[HARNESS-GUARD] Writing to ~/.lore/ (managed by harness). Operator approval required."))
		return
	}

	// 4. Search nudge: suggest semantic search for indexed paths
	if isReadTool(tool) && isIndexedPath(filePath) {
		emitJSON(preToolUseOutput("",
			"[LORE-MEMORY] This path is indexed. Consider semantic search (lore_search MCP tool) before manual file reads."))
		return
	}

	// No action needed
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
		count := incrementBashCounter()
		nudgeThreshold, warnThreshold := readThresholds()

		if count == 1 {
			output := map[string]interface{}{
				"additionalContext": "\x1b[92m[■ LORE-MEMORY]\x1b[0m Snag? → fieldnote. Decision/context? → session note. Write freely.",
			}
			emitJSON(output)
			return
		}

		if count%nudgeThreshold == 0 {
			msg := "\x1b[92m[■ LORE-MEMORY]\x1b[0m Snag? → fieldnote. Decision/context? → session note. Write freely."
			if count >= warnThreshold {
				msg = "\x1b[93m[■ LORE-MEMORY]\x1b[0m High bash activity without knowledge capture. Consider recording findings."
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
	userInput, _ := input["user_input"].(string)
	if userInput == "" {
		return
	}

	ambiguities := scanAmbiguity(userInput)
	if len(ambiguities) > 0 {
		msg := "\x1b[93m[AMBIGUITY]\x1b[0m Detected potentially ambiguous terms: " +
			strings.Join(ambiguities, ", ") +
			". Consider clarifying before proceeding."
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
