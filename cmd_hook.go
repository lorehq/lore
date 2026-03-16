package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
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

	// Session normalization: extract session info from payload, write state file,
	// and augment payload with lore.session block.
	stdinData = augmentWithSession(stdinData)

	// Session freshness: regenerate projections if stale.
	// Only on prompt-submit — pre/post-tool-use fire too frequently.
	if hookName == "prompt-submit" {
		ensureFreshProjection()
		cleanStaleSessions()
	}

	// Look up all scripts for this event (accumulate from all layers)
	hookScripts := readHookScripts()
	scripts := hookScripts.ScriptsFor(hookName)

	// No scripts configured for this event -> exit silently
	if len(scripts) == 0 {
		logHookEvent(hookName, "no-op", 0)
		return
	}

	// Filter to scripts that exist on disk
	var valid []string
	for _, sp := range scripts {
		sp = expandHome(sp)
		if _, err := os.Stat(sp); err == nil {
			valid = append(valid, sp)
		} else {
			fmt.Fprintf(os.Stderr, "lore hook: script not found: %s\n", sp)
		}
	}
	if len(valid) == 0 {
		logHookEvent(hookName, "no-op", 0)
		return
	}

	// Run all scripts in parallel
	type scriptResult struct {
		path   string
		stdout []byte
		err    error
	}

	results := make([]scriptResult, len(valid))
	var wg sync.WaitGroup
	cwd, _ := os.Getwd()

	for i, sp := range valid {
		wg.Add(1)
		go func(idx int, scriptPath string) {
			defer wg.Done()
			cmd := exec.Command("node", scriptPath)
			cmd.Dir = cwd
			cmd.Stdin = readerFromBytes(stdinData)
			cmd.Stderr = os.Stderr
			out, err := cmd.Output()
			results[idx] = scriptResult{path: scriptPath, stdout: out, err: err}
		}(i, sp)
	}
	wg.Wait()

	// Aggregate results
	blocking := blockingEvents[hookName]
	var blockReasons []string
	var combinedOut []byte

	for _, r := range results {
		if r.err != nil {
			logHookEvent(hookName, "error", 0)
			if blocking {
				// For blocking events, collect the reason from stdout (script's block message)
				reason := strings.TrimSpace(string(r.stdout))
				if reason == "" {
					reason = fmt.Sprintf("%s failed: %v", filepath.Base(r.path), r.err)
				}
				blockReasons = append(blockReasons, reason)
			} else {
				fmt.Fprintf(os.Stderr, "lore hook: script error (%s): %v\n", filepath.Base(r.path), r.err)
			}
			continue
		}
		logHookEvent(hookName, "dispatched", len(r.stdout))
		if len(r.stdout) > 0 {
			combinedOut = append(combinedOut, r.stdout...)
		}
	}

	// For blocking events with failures: merge all block reasons into a single response
	if blocking && len(blockReasons) > 0 {
		// Combine block messages from all failing scripts
		merged := strings.Join(blockReasons, "\n")
		os.Stdout.WriteString(merged)
		os.Exit(1)
	}

	// Forward combined stdout from all successful scripts
	if len(combinedOut) > 0 {
		os.Stdout.Write(combinedOut)
	}
}

// --- Session normalization ---

// augmentWithSession parses the stdin payload, extracts session info,
// writes a session state file, and flat-merges a lore.session block
// into the payload. Returns the augmented payload bytes.
func augmentWithSession(stdinData []byte) []byte {
	if len(bytes.TrimSpace(stdinData)) == 0 {
		// No payload — still write a session state file with generated ID
		sess := sessionInfo{
			ID:       generateSessionID(),
			Platform: "unknown",
			Project:  projectSlug(),
		}
		writeSessionState(sess)
		return stdinData
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(stdinData, &payload); err != nil {
		// Not valid JSON — write state with generated ID, don't modify payload
		sess := sessionInfo{
			ID:       generateSessionID(),
			Platform: "unknown",
			Project:  projectSlug(),
		}
		writeSessionState(sess)
		return stdinData
	}

	sess := extractSession(payload)
	writeSessionState(sess)

	// Flat-merge lore.session block into payload
	payload["lore"] = map[string]interface{}{
		"session": map[string]interface{}{
			"id":       sess.ID,
			"platform": sess.Platform,
			"project":  sess.Project,
		},
	}

	augmented, err := json.Marshal(payload)
	if err != nil {
		return stdinData
	}
	return augmented
}

type sessionInfo struct {
	ID       string `json:"id"`
	Platform string `json:"platform"`
	Project  string `json:"project"`
}

// extractSession pulls session ID and platform from a hook payload.
func extractSession(payload map[string]interface{}) sessionInfo {
	sess := sessionInfo{
		Project: projectSlug(),
	}

	// Extract session ID: session_id → conversation_id → trajectory_id → generate
	if v, ok := payload["session_id"].(string); ok && v != "" {
		sess.ID = v
	} else if v, ok := payload["conversation_id"].(string); ok && v != "" {
		sess.ID = v
	} else if v, ok := payload["trajectory_id"].(string); ok && v != "" {
		sess.ID = v
	} else {
		sess.ID = generateSessionID()
	}

	// Detect platform from payload shape + env vars
	sess.Platform = detectPlatform(payload)

	return sess
}

// detectPlatform identifies which AI coding platform dispatched the hook.
func detectPlatform(payload map[string]interface{}) string {
	_, hasSessionID := payload["session_id"].(string)
	_, hasConversationID := payload["conversation_id"].(string)
	_, hasTrajectoryID := payload["trajectory_id"].(string)

	if hasSessionID && os.Getenv("CLAUDECODE") == "1" {
		return "claude"
	}
	if hasConversationID {
		return "cursor"
	}
	if hasSessionID && os.Getenv("GEMINI_CLI") == "1" {
		return "gemini"
	}
	if hasTrajectoryID {
		return "windsurf"
	}
	return "unknown"
}

// projectSlug returns a dashed path slug for the current working directory.
// e.g. /home/andrew/Github/lore → "home-andrew-Github-lore"
func projectSlug() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "unknown"
	}
	// Strip leading slash and replace separators with dashes
	slug := strings.TrimPrefix(cwd, "/")
	return strings.ReplaceAll(slug, string(filepath.Separator), "-")
}

// generateSessionID returns an 8-char hex string for platforms that don't provide one.
func generateSessionID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// writeSessionState creates or updates .lore/.sessions/{id}.json.
func writeSessionState(sess sessionInfo) {
	sessDir := filepath.Join(".lore", ".sessions")
	if err := os.MkdirAll(sessDir, 0755); err != nil {
		return
	}

	filePath := filepath.Join(sessDir, sess.ID+".json")

	// If file exists, just touch mod time (started_at stays)
	if _, err := os.Stat(filePath); err == nil {
		now := time.Now()
		os.Chtimes(filePath, now, now)
		return
	}

	// New session — write with started_at
	state := map[string]string{
		"id":         sess.ID,
		"platform":   sess.Platform,
		"project":    sess.Project,
		"started_at": time.Now().UTC().Format(time.RFC3339),
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(filePath, append(data, '\n'), 0644)
}

// cleanStaleSessions removes session files older than 24 hours.
func cleanStaleSessions() {
	sessDir := filepath.Join(".lore", ".sessions")
	entries, err := os.ReadDir(sessDir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(sessDir, e.Name()))
		}
	}
}

// readerFromBytes returns an io.Reader for a byte slice (nil-safe).
func readerFromBytes(data []byte) io.Reader {
	if len(data) == 0 {
		return nil
	}
	return bytes.NewReader(data)
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
  session-start    Invoked when a session begins or resumes
  stop             Invoked when the agent finishes responding
  pre-compact      Invoked before context window compression
  session-end      Invoked when a session terminates
  subagent-start   Invoked before a subagent spawns (3/7 platforms)
  subagent-stop    Invoked after a subagent completes (4/7 platforms)

Hook input is read from stdin as JSON (provided by the platform).
Script stdout is forwarded back to the platform.
`
