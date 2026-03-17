package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// globalPath returns the Lore global directory following XDG Base Directory spec.
// Uses $XDG_CONFIG_HOME/lore if set, otherwise ~/.config/lore.
func globalPath() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "lore")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "lore")
	}
	return filepath.Join(home, ".config", "lore")
}

// bundlesPath returns the directory where bundles are installed.
// Uses $XDG_DATA_HOME/lore/bundles if set, otherwise ~/.local/share/lore/bundles.
func bundlesPath() string {
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "lore", "bundles")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "lore", "bundles")
	}
	return filepath.Join(home, ".local", "share", "lore", "bundles")
}

// Platform-managed directories. Only structural scaffolding.
// Bundle-specific directories are created by the bundle's setup script.
var globalDirs = []string{
	"SKILLS",
	"RULES",
	"AGENTS",
	"HOOKS",
	"MCP",
	".harness/SKILLS",
	".harness/RULES",
	".harness/AGENTS",
}

// ensureGlobalDir creates the global directory with platform scaffolding
// and seeds example content on first run.
func ensureGlobalDir() error {
	gp := globalPath()
	for _, dir := range globalDirs {
		if err := os.MkdirAll(filepath.Join(gp, dir), 0755); err != nil {
			return fmt.Errorf("create dir %s: %w", dir, err)
		}
	}
	// Ensure bundles directory exists
	if err := os.MkdirAll(bundlesPath(), 0755); err != nil {
		return fmt.Errorf("create bundles dir: %w", err)
	}
	seedGlobalContent(gp)
	return nil
}

// seedGlobalContent writes starter content files if they don't already exist.
// Only creates files on first run — never overwrites user content.
func seedGlobalContent(gp string) {
	// Create LORE.md stub if it doesn't exist
	loreMDPath := filepath.Join(gp, "LORE.md")
	if _, err := os.Stat(loreMDPath); err != nil {
		stub, _ := templateFS.ReadFile("templates/global-lore.md")
		os.WriteFile(loreMDPath, stub, 0644)
	}

	// Harness content — always written (binary owns these files).
	// Content is embedded from the harness/ directory at build time.
	seedHarnessContent(gp)

}

// seedHarnessContent writes harness content from the embedded harness/ FS.
// Harness content is always overwritten — the binary owns these files.
func seedHarnessContent(gp string) {
	harnessRoot := filepath.Join(gp, ".harness")
	fs.WalkDir(harnessFS, "harness", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel("harness", path)
		dst := filepath.Join(harnessRoot, rel)
		data, err := harnessFS.ReadFile(path)
		if err != nil {
			return nil
		}
		os.MkdirAll(filepath.Dir(dst), 0755)
		os.WriteFile(dst, data, 0644)
		return nil
	})
}
