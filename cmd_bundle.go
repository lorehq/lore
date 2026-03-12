package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const defaultRegistryURL = "https://raw.githubusercontent.com/lorehq/lore-registry/main/registry.json"
const registryCacheTTL = 24 * time.Hour

// RegistryEntry represents a bundle listed in the registry.
type RegistryEntry struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Repo        string   `json:"repo"`
	Author      string   `json:"author"`
	Tags        []string `json:"tags"`
}

// Registry represents the bundle registry file.
type Registry struct {
	Schema   int             `json:"schema"`
	Bundles []RegistryEntry `json:"bundles"`
}

// BundleManifest represents a bundle's manifest.json.
type BundleManifest struct {
	ManifestVersion int               `json:"manifest_version"`
	Slug            string            `json:"slug"`
	Name            string            `json:"name"`
	Version         string            `json:"version"`
	Description     string            `json:"description"`
	Hooks           map[string]string `json:"hooks"`
	Agentic         string            `json:"agentic"`
	MCP             map[string]struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	} `json:"mcp"`
	TUI struct {
		Pages []struct {
			Name   string `json:"name"`
			Script string `json:"script"`
		} `json:"pages"`
	} `json:"tui"`
	Setup    string `json:"setup"`
	Teardown string `json:"teardown"`
}

func cmdBundle(args []string) {
	if len(args) == 0 {
		fmt.Print(bundleHelpText)
		return
	}

	sub := args[0]
	rest := args[1:]

	switch sub {
	case "install":
		cmdBundleInstall(rest)
	case "list":
		cmdBundleList(rest)
	case "enable":
		cmdBundleEnable(rest)
	case "disable":
		cmdBundleDisable(rest)
	case "update":
		cmdBundleUpdate(rest)
	case "remove":
		cmdBundleRemove(rest)
	case "info":
		cmdBundleInfo(rest)
	case "help", "--help", "-h":
		fmt.Print(bundleHelpText)
	default:
		fmt.Fprintf(os.Stderr, "Unknown bundle command: %s\nRun 'lore bundle help' for usage.\n", sub)
		os.Exit(1)
	}
}

// --- install ---

func cmdBundleInstall(args []string) {
	var slug, url string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--help", "-h":
			fmt.Print(bundleInstallHelpText)
			return
		case "--url":
			if i+1 >= len(args) {
				fatal("--url requires a value")
			}
			i++
			url = args[i]
		default:
			if slug == "" {
				slug = args[i]
			}
		}
	}

	if slug == "" && url == "" {
		fatal("Usage: lore bundle install <slug> [--url <git-url>]")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		fatal("Cannot determine home directory: %v", err)
	}

	// Derive slug from URL if only --url was given
	if slug == "" && url != "" {
		slug = slugFromURL(url)
		if slug == "" {
			fatal("Cannot derive slug from URL. Provide a slug: lore bundle install <slug> --url <url>")
		}
	}

	// Guard: already installed (check before network)
	if slug != "" {
		bundleDir := filepath.Join(home, "."+slug)
		if _, err := os.Stat(bundleDir); err == nil {
			fatal("Bundle '%s' is already installed at %s\nUse 'lore bundle update %s' to update.", slug, bundleDir, slug)
		}
	}

	// Resolve repo URL from registry if not provided directly
	if url == "" {
		entry := registryLookup(slug)
		if entry == nil {
			fatal("Bundle '%s' not found in registry.\nUse --url to install from a git URL directly.", slug)
		}
		url = entry.Repo
	}

	bundleDir := filepath.Join(home, "."+slug)

	// Clone
	fmt.Printf("Installing %s...\n", slug)
	cmd := exec.Command("git", "clone", "--depth", "1", url, bundleDir)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fatal("Clone failed: %v", err)
	}

	// Validate manifest
	manifest, err := readAndValidateManifest(bundleDir)
	if err != nil {
		os.RemoveAll(bundleDir)
		fatal("Invalid manifest (rolled back): %v", err)
	}

	// Run setup script if declared
	if manifest.Setup != "" {
		setupPath := filepath.Join(bundleDir, manifest.Setup)
		if _, err := os.Stat(setupPath); err == nil {
			fmt.Println("Running setup...")
			setup := exec.Command("node", setupPath, bundleDir)
			setup.Stdout = os.Stdout
			setup.Stderr = os.Stderr
			if err := setup.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: setup script failed: %v\n", err)
			}
		}
	}

	name := manifest.Name
	if name == "" {
		name = slug
	}
	fmt.Printf("Installed %s (%s) at %s\n", name, manifest.Version, bundleDir)
}

// --- list ---

func cmdBundleList(args []string) {
	var refresh bool
	for _, a := range args {
		switch a {
		case "--help", "-h":
			fmt.Println("Usage: lore bundle list [--refresh]")
			return
		case "--refresh":
			refresh = true
		}
	}

	// Installed bundles
	bundles := discoverBundles()
	if len(bundles) > 0 {
		fmt.Println("Installed:")
		for _, b := range bundles {
			status := ""
			if b.Active {
				status = " (enabled)"
			}
			fmt.Printf("  %-20s %s  %s%s\n", b.Slug, b.Version, b.Name, status)
		}
	} else {
		fmt.Println("No bundles installed.")
	}

	// Registry bundles
	registry := fetchRegistry(refresh)
	if registry == nil {
		return
	}

	// Filter out already-installed
	installed := make(map[string]bool)
	for _, b := range bundles {
		installed[b.Slug] = true
	}

	var available []RegistryEntry
	for _, e := range registry.Bundles {
		if !installed[e.Slug] {
			available = append(available, e)
		}
	}

	if len(available) > 0 {
		fmt.Println("\nAvailable:")
		for _, e := range available {
			fmt.Printf("  %-20s %s\n", e.Slug, e.Description)
		}
	}
}

// --- enable ---

func cmdBundleEnable(args []string) {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Println("Usage: lore bundle enable <slug>")
		return
	}

	requireProject()

	slug := args[0]
	if err := enableBundle("", slug); err != nil {
		fatal("Enable failed: %v", err)
	}

	name := slug
	home, _ := os.UserHomeDir()
	if n := readBundleName(filepath.Join(home, "."+slug)); n != "" {
		name = n
	}
	fmt.Printf("Enabled %s. Run 'lore generate' to apply.\n", name)
}

// --- update ---

func cmdBundleUpdate(args []string) {
	for _, a := range args {
		if a == "--help" || a == "-h" {
			fmt.Println("Usage: lore bundle update [slug]")
			return
		}
	}

	var slug string
	if len(args) > 0 {
		slug = args[0]
	} else {
		slugs := readBundleSlugs()
		if len(slugs) == 0 {
			fatal("No enabled bundles. Specify a slug: lore bundle update <slug>")
		}
		slug = slugs[len(slugs)-1] // highest priority
	}

	home, err := os.UserHomeDir()
	if err != nil {
		fatal("Cannot determine home directory: %v", err)
	}

	bundleDir := filepath.Join(home, "."+slug)
	if _, err := os.Stat(bundleDir); err != nil {
		fatal("Bundle '%s' is not installed at %s", slug, bundleDir)
	}

	fmt.Printf("Updating %s...\n", slug)
	fetch := exec.Command("git", "-C", bundleDir, "fetch", "origin")
	fetch.Stdout = os.Stdout
	fetch.Stderr = os.Stderr
	if err := fetch.Run(); err != nil {
		fatal("Fetch failed: %v", err)
	}
	reset := exec.Command("git", "-C", bundleDir, "reset", "--hard", "origin/main")
	reset.Stdout = os.Stdout
	reset.Stderr = os.Stderr
	if err := reset.Run(); err != nil {
		fatal("Update failed: %v\nResolve manually in %s", err, bundleDir)
	}

	// Re-validate manifest
	manifest, err := readAndValidateManifest(bundleDir)
	if err != nil {
		fatal("Manifest invalid after update: %v", err)
	}

	// Re-run setup if declared (must be idempotent)
	if manifest.Setup != "" {
		setupPath := filepath.Join(bundleDir, manifest.Setup)
		if _, err := os.Stat(setupPath); err == nil {
			fmt.Println("Running setup...")
			setup := exec.Command("node", setupPath, bundleDir)
			setup.Stdout = os.Stdout
			setup.Stderr = os.Stderr
			if err := setup.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: setup script failed: %v\n", err)
			}
		}
	}

	// Hook paths are derived at runtime from manifest, no refresh needed.

	fmt.Printf("Updated %s to %s\n", slug, manifest.Version)
}

// --- remove ---

func cmdBundleRemove(args []string) {
	var force bool
	var slug string

	for _, a := range args {
		switch a {
		case "--help", "-h":
			fmt.Println("Usage: lore bundle remove <slug> [--force]")
			return
		case "--force":
			force = true
		default:
			if slug == "" {
				slug = a
			}
		}
	}

	if slug == "" {
		fatal("Usage: lore bundle remove <slug> [--force]")
	}

	// Cannot remove the bundle if it's enabled in the current project
	for _, s := range readBundleSlugs() {
		if s == slug {
			fatal("Bundle '%s' is enabled in this project. Run 'lore bundle disable %s' first.", slug, slug)
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		fatal("Cannot determine home directory: %v", err)
	}

	bundleDir := filepath.Join(home, "."+slug)
	if _, err := os.Stat(bundleDir); err != nil {
		fatal("Bundle '%s' is not installed at %s", slug, bundleDir)
	}

	if !force {
		fmt.Printf("Remove bundle '%s' at %s? This deletes the directory. [y/N] ", slug, bundleDir)
		var answer string
		fmt.Scanln(&answer)
		if strings.ToLower(strings.TrimSpace(answer)) != "y" {
			fmt.Println("Cancelled.")
			return
		}
	}

	// Run teardown if declared
	manifest, _ := readAndValidateManifest(bundleDir)
	if manifest != nil && manifest.Teardown != "" {
		teardownPath := filepath.Join(bundleDir, manifest.Teardown)
		if _, err := os.Stat(teardownPath); err == nil {
			fmt.Println("Running teardown...")
			td := exec.Command("node", teardownPath, bundleDir)
			td.Stdout = os.Stdout
			td.Stderr = os.Stderr
			if err := td.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: teardown script failed: %v\n", err)
			}
		}
	}

	if err := os.RemoveAll(bundleDir); err != nil {
		fatal("Failed to remove %s: %v", bundleDir, err)
	}

	fmt.Printf("Removed %s\n", slug)
}

// --- info ---

func cmdBundleInfo(args []string) {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Println("Usage: lore bundle info <slug>")
		return
	}

	slug := args[0]
	home, err := os.UserHomeDir()
	if err != nil {
		fatal("Cannot determine home directory: %v", err)
	}

	bundleDir := filepath.Join(home, "."+slug)
	manifest, err := readAndValidateManifest(bundleDir)
	if err != nil {
		fatal("Cannot read bundle '%s': %v", slug, err)
	}

	status := "installed"
	for _, s := range readBundleSlugs() {
		if s == slug {
			status = "enabled"
			break
		}
	}

	fmt.Printf("Name:        %s\n", manifest.Name)
	fmt.Printf("Slug:        %s\n", manifest.Slug)
	fmt.Printf("Version:     %s\n", manifest.Version)
	fmt.Printf("Status:      %s\n", status)
	if manifest.Description != "" {
		fmt.Printf("Description: %s\n", manifest.Description)
	}
	fmt.Printf("Directory:   %s\n", bundleDir)

	// Count agentic content
	agenticDir := bundleDir
	if manifest.Agentic != "" {
		agenticDir = filepath.Join(bundleDir, manifest.Agentic)
	}
	rules, skills, agents, _ := scanAgenticDir(agenticDir)
	if len(rules) > 0 || len(skills) > 0 || len(agents) > 0 {
		fmt.Printf("Agentic:     %d rules, %d skills, %d agents\n", len(rules), len(skills), len(agents))
	}

	// Hooks
	if len(manifest.Hooks) > 0 {
		fmt.Printf("Hooks:       %s\n", strings.Join(sortedKeys(manifest.Hooks), ", "))
	}

	// MCP
	if len(manifest.MCP) > 0 {
		var names []string
		for name := range manifest.MCP {
			names = append(names, name)
		}
		fmt.Printf("MCP:         %s\n", strings.Join(names, ", "))
	}

	if manifest.Setup != "" {
		fmt.Println("Setup:       yes")
	}
	if manifest.Teardown != "" {
		fmt.Println("Teardown:    yes")
	}
}

// --- disable ---

func cmdBundleDisable(args []string) {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Println("Usage: lore bundle disable <slug>")
		return
	}

	requireProject()

	slug := args[0]
	if err := disableBundle("", slug); err != nil {
		fatal("Disable failed: %v", err)
	}
	fmt.Printf("Disabled %s.\n", slug)
}

// requireProject exits with an error if not in a Lore project.
func requireProject() {
	if _, err := os.Stat(filepath.Join(".lore", "config.json")); err != nil {
		fatal("Not a Lore project (no .lore/config.json). Run 'lore init' first.")
	}
}

// --- Registry ---

func registryURL() string {
	data, err := os.ReadFile(filepath.Join(globalPath(), "config.json"))
	if err != nil {
		return defaultRegistryURL
	}
	var cfg map[string]interface{}
	if json.Unmarshal(stripJSONComments(data), &cfg) != nil {
		return defaultRegistryURL
	}
	if url, ok := cfg["registryUrl"].(string); ok && url != "" {
		return url
	}
	return defaultRegistryURL
}

func registryCachePath() string {
	return filepath.Join(globalPath(), ".cache", "registry.json")
}

func fetchRegistry(forceRefresh bool) *Registry {
	cachePath := registryCachePath()

	// Try cache first
	if !forceRefresh {
		if info, err := os.Stat(cachePath); err == nil {
			if time.Since(info.ModTime()) < registryCacheTTL {
				if reg := readRegistryFile(cachePath); reg != nil {
					return reg
				}
			}
		}
	}

	// Fetch from network
	url := registryURL()
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		// Stale fallback
		if reg := readRegistryFile(cachePath); reg != nil {
			return reg
		}
		fmt.Fprintf(os.Stderr, "Warning: could not fetch registry: %v\n", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		if reg := readRegistryFile(cachePath); reg != nil {
			return reg
		}
		fmt.Fprintf(os.Stderr, "Warning: registry returned %d\n", resp.StatusCode)
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return readRegistryFile(cachePath)
	}

	var reg Registry
	if err := json.Unmarshal(body, &reg); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: invalid registry JSON: %v\n", err)
		return readRegistryFile(cachePath)
	}

	// Write cache
	os.MkdirAll(filepath.Dir(cachePath), 0755)
	os.WriteFile(cachePath, body, 0644)

	return &reg
}

func readRegistryFile(path string) *Registry {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var reg Registry
	if json.Unmarshal(data, &reg) != nil {
		return nil
	}
	return &reg
}

func registryLookup(slug string) *RegistryEntry {
	reg := fetchRegistry(false)
	if reg == nil {
		return nil
	}
	for _, e := range reg.Bundles {
		if e.Slug == slug {
			return &e
		}
	}
	return nil
}

// --- Manifest validation ---

func readAndValidateManifest(bundleDir string) (*BundleManifest, error) {
	data, err := os.ReadFile(filepath.Join(bundleDir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read manifest.json: %w", err)
	}

	var m BundleManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest.json: %w", err)
	}

	if m.Slug == "" {
		return nil, fmt.Errorf("manifest missing required field: slug")
	}
	if m.Name == "" {
		return nil, fmt.Errorf("manifest missing required field: name")
	}
	if m.Version == "" {
		return nil, fmt.Errorf("manifest missing required field: version")
	}
	if len(m.Hooks) == 0 {
		return nil, fmt.Errorf("manifest missing required field: hooks")
	}

	// Validate hook paths: must be relative, no path traversal
	for event, path := range m.Hooks {
		if filepath.IsAbs(path) {
			return nil, fmt.Errorf("hook '%s' path must be relative: %s", event, path)
		}
		if strings.Contains(path, "..") {
			return nil, fmt.Errorf("hook '%s' path must not contain '..': %s", event, path)
		}
	}

	// Validate setup path if declared
	if m.Setup != "" {
		if filepath.IsAbs(m.Setup) || strings.Contains(m.Setup, "..") {
			return nil, fmt.Errorf("setup path must be relative without '..': %s", m.Setup)
		}
	}

	// Validate agentic path if declared
	if m.Agentic != "" {
		if filepath.IsAbs(m.Agentic) || strings.Contains(m.Agentic, "..") {
			return nil, fmt.Errorf("agentic path must be relative without '..': %s", m.Agentic)
		}
	}

	return &m, nil
}

// --- Helpers ---

func slugFromURL(url string) string {
	// Extract repo name from git URL: https://github.com/org/repo.git → repo
	url = strings.TrimSuffix(url, ".git")
	parts := strings.Split(url, "/")
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

// --- Help text ---

const bundleHelpText = `Manage bundles — installable behavioral configurations.

Usage: lore bundle <command> [args]

Commands:
  install <slug>    Install a bundle from the registry (or --url <git-url>)
  list              Show installed and available bundles
  enable <slug>     Enable a bundle in this project
  disable <slug>    Disable a bundle in this project
  update [slug]     Update a bundle (defaults to highest-priority enabled bundle)
  remove <slug>     Remove an installed bundle
  info <slug>       Show bundle details

Multiple bundles can be enabled per project. Priority order matches
the order they were enabled (last enabled = highest priority).

Run 'lore bundle <command> --help' for details.
`

const bundleInstallHelpText = `Install a bundle from the registry or a git URL.

Usage: lore bundle install <slug> [options]

Options:
  --url <git-url>   Install from a git URL instead of the registry
  --help, -h        Print this help

Examples:
  lore bundle install lore-os              # from registry
  lore bundle install my-bundle --url https://github.com/me/my-bundle.git
`
