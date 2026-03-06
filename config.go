package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

const defaultMemoryEngineUrl = "http://localhost:9184"

// readGlobalConfig reads ~/.lore/config.json and returns the raw map.
func readGlobalConfig() map[string]interface{} {
	data, err := os.ReadFile(filepath.Join(globalPath(), "config.json"))
	if err != nil {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(stripJSONComments(data), &cfg); err != nil {
		return nil
	}
	return cfg
}

// getMemoryEngineUrl returns the memory engine URL from global config,
// falling back to the default.
func getMemoryEngineUrl() string {
	cfg := readGlobalConfig()
	if cfg != nil {
		if url, ok := cfg["memoryEngineUrl"].(string); ok && url != "" {
			return url
		}
	}
	return defaultMemoryEngineUrl
}

// readProjectConfig reads .lore/config.json and returns profile and platforms.
// Falls back to defaults if the file is missing or malformed.
func readProjectConfig() (profile string, platforms map[string]bool, err error) {
	profile = "standard"
	platforms = defaultPlatforms()

	data, err := os.ReadFile(filepath.Join(".lore", "config.json"))
	if err != nil {
		return profile, platforms, fmt.Errorf("read config: %w", err)
	}

	var cfg map[string]interface{}
	if err := json.Unmarshal(stripJSONComments(data), &cfg); err != nil {
		return profile, platforms, fmt.Errorf("parse config: %w", err)
	}

	if p, ok := cfg["profile"].(string); ok && p != "" {
		profile = p
	}

	if raw, ok := cfg["platforms"]; ok {
		platforms = parsePlatformsConfig(raw)
	}

	return profile, platforms, nil
}

// readThresholds reads nudgeThreshold and warnThreshold from .lore/config.json,
// applying profile-based defaults if not explicitly set.
func readThresholds() (nudge int, warn int) {
	nudge, warn = 15, 30

	data, err := os.ReadFile(filepath.Join(".lore", "config.json"))
	if err != nil {
		return
	}

	var cfg map[string]interface{}
	if err := json.Unmarshal(stripJSONComments(data), &cfg); err != nil {
		return
	}

	// Profile-based defaults
	if p, ok := cfg["profile"].(string); ok && p == "discovery" {
		nudge, warn = 5, 10
	}

	// Explicit overrides
	if v, ok := cfg["nudgeThreshold"]; ok {
		nudge = jsonToInt(v, nudge)
	}
	if v, ok := cfg["warnThreshold"]; ok {
		warn = jsonToInt(v, warn)
	}

	return
}

func jsonToInt(v interface{}, fallback int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return i
		}
	}
	return fallback
}

// writeProjectConfig merges profile and platforms into .lore/config.json,
// preserving any other existing fields (nudgeThreshold, warnThreshold, etc.).
func writeProjectConfig(profile string, platforms map[string]bool) error {
	configPath := filepath.Join(".lore", "config.json")

	// Read existing config to preserve other fields
	cfg := make(map[string]interface{})
	if existing, err := os.ReadFile(configPath); err == nil {
		_ = json.Unmarshal(stripJSONComments(existing), &cfg)
	}

	// Update only the fields we manage
	cfg["platforms"] = orderedPlatformJSON(platforms)
	if profile != "" {
		cfg["profile"] = profile
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

// readEnabledPlatforms reads .lore/config.json and returns enabled platform names.
func readEnabledPlatforms() ([]string, error) {
	_, platforms, err := readProjectConfig()
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

// parsePlatformsConfig handles both object and legacy array formats from config JSON.
func parsePlatformsConfig(raw interface{}) map[string]bool {
	// Object format: {"claude": true, "cursor": false, ...}
	if obj, ok := raw.(map[string]interface{}); ok {
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

	// Legacy array format: ["claude", "cursor"]
	if arr, ok := raw.([]interface{}); ok && len(arr) > 0 {
		var names []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				names = append(names, s)
			}
		}
		return platformsFromList(names)
	}

	return defaultPlatforms()
}

// sortedPlatformMap returns a consistently ordered JSON-friendly map.
// (Go maps are unordered; this ensures deterministic output via json.MarshalIndent
// by using the validPlatforms order in the struct.)
func orderedPlatformJSON(platforms map[string]bool) json.RawMessage {
	// Build ordered entries
	type entry struct {
		Name    string
		Enabled bool
	}
	var entries []entry
	for _, p := range validPlatforms {
		entries = append(entries, entry{p, platforms[p]})
	}
	// Also include any unknown keys (shouldn't happen, but be safe)
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
