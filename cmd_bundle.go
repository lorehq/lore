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

const defaultRegistryURL = "https://raw.githubusercontent.com/lorehq/lore-bundles/main/registry.json"
const registryCacheTTL = 24 * time.Hour

// RegistryEntry represents a bundle listed in the registry.
type RegistryEntry struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Repo        string   `json:"repo"`
	Path        string   `json:"path,omitempty"`
	Source      string   `json:"source,omitempty"` // original creator's repo URL
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
	Hooks           map[string]json.RawMessage `json:"hooks"`
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

// installBundleFromRepo clones a bundle from a git URL into the XDG bundles directory.
// If subPath is non-empty, the bundle lives in a subdirectory of the repo (monorepo).
// Used by both CLI (cmdBundleInstall) and TUI marketplace.
func installBundleFromRepo(slug, repoURL, subPath string) error {
	if existing := bundleDirForSlug(slug); existing != "" {
		return fmt.Errorf("bundle '%s' is already installed at %s", slug, existing)
	}

	bp := bundlesPath()
	os.MkdirAll(bp, 0755)
	bundleDir := filepath.Join(bp, slug)

	if subPath == "" {
		// Single-repo bundle: clone directly
		cmd := exec.Command("git", "clone", "--depth", "1", repoURL, bundleDir)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("clone failed: %v\n%s", err, out)
		}
	} else {
		// Monorepo bundle: sparse checkout, fallback to full clone + copy
		if err := cloneSubPath(repoURL, subPath, bundleDir); err != nil {
			return fmt.Errorf("clone failed: %v", err)
		}
	}

	manifest, err := readAndValidateManifest(bundleDir)
	if err != nil {
		os.RemoveAll(bundleDir)
		return fmt.Errorf("invalid manifest (rolled back): %v", err)
	}

	if manifest.Setup != "" {
		setupPath := filepath.Join(bundleDir, manifest.Setup)
		if _, err := os.Stat(setupPath); err == nil {
			setup := exec.Command("node", setupPath, bundleDir)
			setup.CombinedOutput() // non-fatal
		}
	}

	return nil
}

// cloneSubPath extracts a subdirectory from a git repo.
// Tries sparse checkout first (fast, minimal download). Falls back to
// full shallow clone + directory copy if the server doesn't support it.
func cloneSubPath(repoURL, subPath, destDir string) error {
	tmpDir, err := os.MkdirTemp("", "lore-bundle-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	// Try sparse checkout
	clone := exec.Command("git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", repoURL, tmpDir)
	if out, err := clone.CombinedOutput(); err == nil {
		sparse := exec.Command("git", "-C", tmpDir, "sparse-checkout", "set", subPath)
		if out, err := sparse.CombinedOutput(); err == nil {
			srcDir := filepath.Join(tmpDir, subPath)
			if info, err := os.Stat(srcDir); err == nil && info.IsDir() {
				return copyDir(srcDir, destDir)
			}
			return fmt.Errorf("path '%s' not found in repo after sparse checkout", subPath)
		} else {
			fmt.Fprintf(os.Stderr, "sparse checkout not supported, falling back to full clone\n%s", out)
		}
	} else {
		fmt.Fprintf(os.Stderr, "sparse clone not supported, falling back to full clone\n%s", out)
	}

	// Fallback: full shallow clone
	os.RemoveAll(tmpDir)
	os.MkdirAll(tmpDir, 0755)
	fallback := exec.Command("git", "clone", "--depth", "1", repoURL, tmpDir)
	if out, err := fallback.CombinedOutput(); err != nil {
		return fmt.Errorf("full clone failed: %v\n%s", err, out)
	}

	srcDir := filepath.Join(tmpDir, subPath)
	if info, err := os.Stat(srcDir); err != nil || !info.IsDir() {
		return fmt.Errorf("path '%s' not found in repo", subPath)
	}

	return copyDir(srcDir, destDir)
}


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

	// Derive slug from URL if only --url was given
	if slug == "" && url != "" {
		slug = slugFromURL(url)
		if slug == "" {
			fatal("Cannot derive slug from URL. Provide a slug: lore bundle install <slug> --url <url>")
		}
	}

	// Guard: already installed (check before network)
	if slug != "" {
		if existing := bundleDirForSlug(slug); existing != "" {
			fatal("Bundle '%s' is already installed at %s\nUse 'lore bundle update %s' to update.", slug, existing, slug)
		}
	}

	// Resolve repo URL (and path for monorepo bundles) from registry
	var subPath string
	if url == "" {
		entry := registryLookup(slug)
		if entry == nil {
			fatal("Bundle '%s' not found in registry.\nUse --url to install from a git URL directly.", slug)
		}
		url = entry.Repo
		subPath = entry.Path
	}

	fmt.Printf("Installing %s...\n", slug)
	if err := installBundleFromRepo(slug, url, subPath); err != nil {
		fatal(err.Error())
	}

	name := slug
	if dir := bundleDirForSlug(slug); dir != "" {
		if n := readBundleName(dir); n != "" {
			name = n
		}
	}
	fmt.Printf("Installed %s at %s\n", name, bundleDirForSlug(slug))
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
	if dir := bundleDirForSlug(slug); dir != "" {
		if n := readBundleName(dir); n != "" {
			name = n
		}
	}
	fmt.Printf("Enabled %s. Run 'lore generate' to apply.\n", name)
}

// --- update ---

// updateBundleInPlace fetches and resets a bundle to the latest remote HEAD.
// Used by both CLI (cmdBundleUpdate) and TUI marketplace.
func updateBundleInPlace(slug string) error {
	bundleDir := bundleDirForSlug(slug)
	if bundleDir == "" {
		return fmt.Errorf("bundle '%s' is not installed", slug)
	}

	fetch := exec.Command("git", "-C", bundleDir, "fetch", "origin")
	if out, err := fetch.CombinedOutput(); err != nil {
		return fmt.Errorf("fetch failed: %v\n%s", err, out)
	}

	reset := exec.Command("git", "-C", bundleDir, "reset", "--hard", "origin/main")
	if out, err := reset.CombinedOutput(); err != nil {
		return fmt.Errorf("update failed: %v\n%s", err, out)
	}

	manifest, err := readAndValidateManifest(bundleDir)
	if err != nil {
		return fmt.Errorf("manifest invalid after update: %v", err)
	}

	if manifest.Setup != "" {
		setupPath := filepath.Join(bundleDir, manifest.Setup)
		if _, err := os.Stat(setupPath); err == nil {
			setup := exec.Command("node", setupPath, bundleDir)
			setup.CombinedOutput() // non-fatal
		}
	}

	return nil
}

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

	fmt.Printf("Updating %s...\n", slug)
	if err := updateBundleInPlace(slug); err != nil {
		fatal(err.Error())
	}

	name := slug
	if dir := bundleDirForSlug(slug); dir != "" {
		if n := readBundleName(dir); n != "" {
			name = n
		}
	}
	fmt.Printf("Updated %s\n", name)
}

// --- remove ---

// removeBundleFromDisk deletes a bundle's directory. Does NOT check project enablement.
// Used by both CLI (cmdBundleRemove) and TUI marketplace.
func removeBundleFromDisk(slug string) error {
	bundleDir := bundleDirForSlug(slug)
	if bundleDir == "" {
		return fmt.Errorf("bundle '%s' is not installed", slug)
	}

	// Run teardown if declared
	manifest, _ := readAndValidateManifest(bundleDir)
	if manifest != nil && manifest.Teardown != "" {
		teardownPath := filepath.Join(bundleDir, manifest.Teardown)
		if _, err := os.Stat(teardownPath); err == nil {
			td := exec.Command("node", teardownPath, bundleDir)
			td.CombinedOutput() // non-fatal
		}
	}

	return os.RemoveAll(bundleDir)
}

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

	bundleDir := bundleDirForSlug(slug)
	if bundleDir == "" {
		fatal("Bundle '%s' is not installed", slug)
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

	if err := removeBundleFromDisk(slug); err != nil {
		fatal(err.Error())
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
	bundleDir := bundleDirForSlug(slug)
	if bundleDir == "" {
		fatal("Bundle '%s' is not installed", slug)
	}
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
	// Validate hook paths: must be relative, no path traversal
	for event, raw := range m.Hooks {
		// Collect script paths from both formats
		var paths []string
		var behaviors []struct {
			Script string `json:"script"`
		}
		if json.Unmarshal(raw, &behaviors) == nil && len(behaviors) > 0 {
			for _, b := range behaviors {
				paths = append(paths, b.Script)
			}
		} else {
			var single string
			if json.Unmarshal(raw, &single) == nil && single != "" {
				paths = append(paths, single)
			}
		}
		for _, path := range paths {
			if filepath.IsAbs(path) {
				return nil, fmt.Errorf("hook '%s' path must be relative: %s", event, path)
			}
			if strings.Contains(path, "..") {
				return nil, fmt.Errorf("hook '%s' path must not contain '..': %s", event, path)
			}
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
