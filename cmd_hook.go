package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
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

	// Read stdin (hook input from platform) as raw bytes
	var stdinData []byte
	if stat, _ := os.Stdin.Stat(); (stat.Mode() & os.ModeCharDevice) == 0 {
		data, err := io.ReadAll(os.Stdin)
		if err == nil {
			stdinData = data
		}
	}

	// Session freshness: regenerate projections if stale.
	// Only on prompt-submit — pre/post-tool-use fire too frequently.
	if hookName == "prompt-submit" {
		ensureFreshProjection()
	}

	// Look up hook file path from config (project first, then global)
	hookPaths := readHookPaths()
	scriptPath := hookPaths.PathFor(hookName)

	// No script configured for this event -> exit silently
	if scriptPath == "" {
		logHookEvent(hookName, "no-op", 0)
		return
	}

	// Expand ~ in the path
	scriptPath = expandHome(scriptPath)

	// Verify the script exists
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		logHookEvent(hookName, "missing-script", 0)
		fmt.Fprintf(os.Stderr, "lore hook: script not found: %s\n", scriptPath)
		return
	}

	// Invoke: node <scriptPath>
	cwd, _ := os.Getwd()
	cmd := exec.Command("node", scriptPath)
	cmd.Dir = cwd
	cmd.Stdin = readerFromBytes(stdinData)
	cmd.Stderr = os.Stderr

	stdout, err := cmd.Output()
	if err != nil {
		logHookEvent(hookName, "error", 0)
		fmt.Fprintf(os.Stderr, "lore hook: script error (%s): %v\n", filepath.Base(scriptPath), err)
		return
	}

	logHookEvent(hookName, "dispatched", len(stdout))

	// Forward script stdout to platform
	if len(stdout) > 0 {
		os.Stdout.Write(stdout)
	}
}

// readerFromBytes returns an io.Reader for a byte slice (nil-safe).
func readerFromBytes(data []byte) io.Reader {
	if len(data) == 0 {
		return nil
	}
	return bytes.NewReader(data)
}

func emitJSON(v interface{}) {
	data, _ := json.Marshal(v)
	fmt.Println(string(data))
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

// ensureFreshProjection checks if projections are stale and regenerates if needed.
// Fails gracefully — errors become stderr warnings, never block the session.
func ensureFreshProjection() {
	// Only in Lore projects
	if _, err := os.Stat(".lore/config.json"); err != nil {
		return
	}

	root, err := os.Getwd()
	if err != nil {
		return
	}

	if !projectionStale(root) {
		return
	}

	platforms, err := readEnabledPlatforms()
	if err != nil {
		fmt.Fprintf(os.Stderr, "lore: cannot read platforms: %v\n", err)
		return
	}
	if len(platforms) == 0 {
		return
	}

	warnings, err := doProjection(root, platforms)
	for _, w := range warnings {
		fmt.Fprintf(os.Stderr, "lore: %s\n", w)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "lore: projection refresh failed: %v\n", err)
	}
}

const hookHelpText = `Handle platform hook callbacks.

Usage: lore hook <name>

This command is called by platform hooks (e.g., Claude Code settings.json),
not directly by users. The binary dispatches to scripts configured in
.lore/config.json or ~/.config/lore/config.json.

Hooks:
  pre-tool-use     Invoked before a tool executes
  post-tool-use    Invoked after a tool executes
  prompt-submit    Invoked before a user message is processed

Hook input is read from stdin as JSON (provided by the platform).
Script stdout is forwarded back to the platform.
`
