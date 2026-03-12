package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// readProjectConfig reads .lore/config.json and returns platforms.
// Falls back to defaults if the file is missing or malformed.
func readProjectConfig() (platforms map[string]bool, err error) {
	platforms = defaultPlatforms()

	data, err := os.ReadFile(filepath.Join(".lore", "config.json"))
	if err != nil {
		return platforms, fmt.Errorf("read config: %w", err)
	}

	var cfg map[string]interface{}
	if err := json.Unmarshal(stripJSONComments(data), &cfg); err != nil {
		return platforms, fmt.Errorf("parse config: %w", err)
	}

	if raw, ok := cfg["platforms"]; ok {
		platforms = parsePlatformsConfig(raw)
	}

	return platforms, nil
}

// --- Hook scripts (dispatcher model) ---

// HookScripts maps hook event names to accumulated script paths.
// All scripts for an event run in parallel. Blocking events (pre-tool-use,
// prompt-submit, stop) fail if any script returns non-zero.
type HookScripts struct {
	scripts map[string][]string // event name → ordered list of script paths
}

// allHookEvents lists every canonical hook event name.
var allHookEvents = []string{
	"pre-tool-use", "post-tool-use", "prompt-submit",
	"session-start", "stop", "pre-compact", "session-end",
}

// blockingEvents are hook events where a non-zero exit blocks the action.
var blockingEvents = map[string]bool{
	"pre-tool-use":  true,
	"prompt-submit": true,
	"stop":          true,
}

// readHookScripts resolves hook scripts using three-layer accumulation:
//
//	Bundle(s) → Global → Project
//
// All layers contribute scripts. They all run in parallel at dispatch time.
func readHookScripts() HookScripts {
	hs := HookScripts{scripts: make(map[string][]string)}

	// Layer 1: Bundles (in priority order)
	for _, slug := range readBundleSlugs() {
		hs.appendFromBundle(slug)
	}

	// Layer 2: Global — ~/.config/lore/HOOKS/<event>.mjs
	hs.appendFromDir(filepath.Join(globalPath(), "HOOKS"))

	// Layer 3: Project — .lore/HOOKS/<event>.mjs
	hs.appendFromDir(filepath.Join(".lore", "HOOKS"))

	return hs
}

// ScriptsFor returns all script paths for a given event, or nil.
func (hs HookScripts) ScriptsFor(event string) []string {
	return hs.scripts[event]
}

// appendFromDir scans a HOOKS directory for <event>.mjs files.
func (hs *HookScripts) appendFromDir(dir string) {
	for _, event := range allHookEvents {
		p := filepath.Join(dir, event+".mjs")
		if _, err := os.Stat(p); err == nil {
			absPath, _ := filepath.Abs(p)
			hs.scripts[event] = append(hs.scripts[event], absPath)
		}
	}
}

// appendFromBundle reads hook paths from a bundle's manifest.
func (hs *HookScripts) appendFromBundle(slug string) {
	bundleDir := bundleDirForSlug(slug)
	if bundleDir == "" {
		return
	}
	data, err := os.ReadFile(filepath.Join(bundleDir, "manifest.json"))
	if err != nil {
		return
	}
	var manifest struct {
		Hooks map[string]string `json:"hooks"`
	}
	if json.Unmarshal(data, &manifest) != nil {
		return
	}
	for event, relPath := range manifest.Hooks {
		absPath := filepath.Join(bundleDir, relPath)
		hs.scripts[event] = append(hs.scripts[event], absPath)
	}
}

// expandHome replaces a leading ~ with the user's home directory.
func expandHome(path string) string {
	if !strings.HasPrefix(path, "~") {
		return path
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return path
	}
	return filepath.Join(home, path[1:])
}

// writeProjectConfig merges platforms into .lore/config.json,
// preserving any other existing fields.
func writeProjectConfig(projectDir string, platforms map[string]bool) error {
	configPath := filepath.Join(projectDir, ".lore", "config.json")

	// Read existing config to preserve other fields
	cfg := make(map[string]interface{})
	if existing, err := os.ReadFile(configPath); err == nil {
		_ = json.Unmarshal(stripJSONComments(existing), &cfg)
	}

	// Update only the fields we manage
	cfg["platforms"] = orderedPlatformJSON(platforms)

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

// readEnabledPlatforms reads .lore/config.json and returns enabled platform names.
func readEnabledPlatforms() ([]string, error) {
	platforms, err := readProjectConfig()
	if err != nil {
		return nil, err
	}
	return enabledPlatformNames(platforms), nil
}

// enabledPlatformNames returns sorted platform names where value is true.
func enabledPlatformNames(platforms map[string]bool) []string {
	var result []string
	for _, p := range validPlatforms {
		if platforms[p] {
			result = append(result, p)
		}
	}
	return result
}

// defaultPlatforms returns the full platform map with all disabled.
func defaultPlatforms() map[string]bool {
	m := make(map[string]bool)
	for _, p := range validPlatforms {
		m[p] = false
	}
	return m
}

// platformsFromList converts a string slice to a platform map (selected=true, rest=false).
func platformsFromList(selected []string) map[string]bool {
	m := defaultPlatforms()
	for _, p := range selected {
		if _, ok := m[p]; ok {
			m[p] = true
		}
	}
	return m
}

// parsePlatformsConfig parses the platforms object from config JSON.
func parsePlatformsConfig(raw interface{}) map[string]bool {
	obj, ok := raw.(map[string]interface{})
	if !ok {
		return defaultPlatforms()
	}
	m := defaultPlatforms()
	for k, v := range obj {
		if b, ok := v.(bool); ok {
			if _, valid := m[k]; valid {
				m[k] = b
			}
		}
	}
	return m
}

// sortedPlatformMap returns a consistently ordered JSON-friendly map.
func orderedPlatformJSON(platforms map[string]bool) json.RawMessage {
	type entry struct {
		Name    string
		Enabled bool
	}
	var entries []entry
	for _, p := range validPlatforms {
		entries = append(entries, entry{p, platforms[p]})
	}
	// Also include any unknown keys
	known := make(map[string]bool)
	for _, p := range validPlatforms {
		known[p] = true
	}
	var extras []string
	for k := range platforms {
		if !known[k] {
			extras = append(extras, k)
		}
	}
	sort.Strings(extras)
	for _, k := range extras {
		entries = append(entries, entry{k, platforms[k]})
	}

	// Manual JSON build for consistent ordering
	buf := []byte("{")
	for i, e := range entries {
		if i > 0 {
			buf = append(buf, ',')
		}
		key, _ := json.Marshal(e.Name)
		val := []byte("false")
		if e.Enabled {
			val = []byte("true")
		}
		buf = append(buf, '\n', ' ', ' ', ' ', ' ')
		buf = append(buf, key...)
		buf = append(buf, ':', ' ')
		buf = append(buf, val...)
	}
	buf = append(buf, '\n', ' ', ' ')
	buf = append(buf, '}')
	return json.RawMessage(buf)
}

// --- inherit.json ---

// validInheritValues are the valid values for inheritance state.
var validInheritValues = map[string]bool{
	"off":       true,
	"defer":     true,
	"overwrite": true,
}

// readInheritConfig reads .lore/inherit.json and returns the inheritance map.
// Returns nil if the file doesn't exist or is malformed.
func readInheritConfig(projectDir string) map[string]map[string]string {
	data, err := os.ReadFile(filepath.Join(projectDir, ".lore", "inherit.json"))
	if err != nil {
		return nil
	}
	var cfg map[string]map[string]string
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil
	}
	return cfg
}

// writeInheritConfig writes .lore/inherit.json with the given inheritance map.
func writeInheritConfig(projectDir string, config map[string]map[string]string) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal inherit config: %w", err)
	}
	return os.WriteFile(filepath.Join(projectDir, ".lore", "inherit.json"), append(data, '\n'), 0644)
}

// enableBundle appends a bundle slug to the "bundles" array in .lore/config.json.
// projectDir is the project root (containing .lore/). Pass "" to use cwd.
// The new bundle is added at the end (highest priority).
func enableBundle(projectDir, slug string) error {
	if bundleDirForSlug(slug) == "" {
		return fmt.Errorf("bundle '%s' is not installed", slug)
	}

	configPath := filepath.Join(projectDir, ".lore", "config.json")
	cfg := make(map[string]interface{})
	if existing, err := os.ReadFile(configPath); err == nil {
		_ = json.Unmarshal(stripJSONComments(existing), &cfg)
	}

	slugs := parseBundleSlugs(cfg)
	for _, s := range slugs {
		if s == slug {
			return fmt.Errorf("bundle '%s' is already enabled", slug)
		}
	}
	slugs = append(slugs, slug)

	cfg["bundles"] = slugs

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	return os.WriteFile(configPath, append(out, '\n'), 0644)
}

// disableBundle removes a bundle slug from the "bundles" array in .lore/config.json.
// projectDir is the project root (containing .lore/). Pass "" to use cwd.
func disableBundle(projectDir, slug string) error {
	configPath := filepath.Join(projectDir, ".lore", "config.json")
	cfg := make(map[string]interface{})
	if existing, err := os.ReadFile(configPath); err == nil {
		_ = json.Unmarshal(stripJSONComments(existing), &cfg)
	}

	slugs := parseBundleSlugs(cfg)
	var filtered []string
	for _, s := range slugs {
		if s != slug {
			filtered = append(filtered, s)
		}
	}
	if len(filtered) == len(slugs) {
		return fmt.Errorf("bundle '%s' is not enabled", slug)
	}

	cfg["bundles"] = filtered

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	return os.WriteFile(configPath, append(out, '\n'), 0644)
}
