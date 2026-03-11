package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// AgenticFile represents a parsed agentic content file (rule, skill, or agent).
type AgenticFile struct {
	Kind      string // "rule", "skill", "agent"
	Name      string // derived from filename/dirname
	Path      string // source path on disk
	SourceDir string // for standard-layout skills: directory containing SKILL.md and supporting files

	// Frontmatter fields (passthrough — each projector uses what it needs)
	Description   string   `yaml:"description"`
	Globs         []string `yaml:"globs"`          // rules: path/glob scoping
	Model         string   `yaml:"model"`          // agents: model preference
	Tools         []string `yaml:"tools"`          // agents: tool allowlist
	Skills        []string `yaml:"skills"`         // agents: declared skill dependencies
	Agent         string   `yaml:"agent"`          // skills: informational parent agent
	UserInvocable *bool    `yaml:"user-invocable"` // skills: show in autocomplete
	AllowedTools  []string `yaml:"allowed-tools"`  // skills: tool allowlist
	Type          string   `yaml:"type"`           // skills: command type

	// Body is everything after the frontmatter
	Body string
}

// MCPServer represents an MCP server declaration.
type MCPServer struct {
	Name    string
	Command string
	Args    []string
	Env     map[string]string
}

// MergedSet holds the result of merging bundle + global + project content.
// Rules, skills, and agents are independent peers — no ownership hierarchy.
type MergedSet struct {
	Rules  map[string]*AgenticFile
	Skills map[string]*AgenticFile
	Agents map[string]*AgenticFile
	LoreMD string // accumulated LORE.md from all layers (bundle → global → project)
	MCP    []MCPServer
}

// parseAgenticFile parses a markdown file with YAML frontmatter.
func parseAgenticFile(path string, kind string) (*AgenticFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	af := &AgenticFile{
		Kind: kind,
		Path: path,
	}

	content := strings.ReplaceAll(string(data), "\r\n", "\n")

	// Parse frontmatter if present
	if strings.HasPrefix(content, "---\n") {
		end := strings.Index(content[4:], "\n---")
		if end >= 0 {
			fmData := content[4 : 4+end]
			af.Body = strings.TrimSpace(content[4+end+4:])
			if err := yaml.Unmarshal([]byte(fmData), af); err != nil {
				return nil, fmt.Errorf("parse frontmatter in %s: %w", path, err)
			}
		} else {
			af.Body = strings.TrimSpace(content)
		}
	} else {
		af.Body = strings.TrimSpace(content)
	}

	return af, nil
}

// readBundleSlugs reads enabled bundle slugs from .lore/config.json (project config).
// Returns slugs in priority order (first = lowest, last = highest).
func readBundleSlugs() []string {
	return readBundleSlugsFrom("")
}

// readBundleSlugsFrom reads enabled bundle slugs from a specific project directory.
func readBundleSlugsFrom(projectDir string) []string {
	data, err := os.ReadFile(filepath.Join(projectDir, ".lore", "config.json"))
	if err != nil {
		return nil
	}
	var cfg map[string]interface{}
	if json.Unmarshal(stripJSONComments(data), &cfg) != nil {
		return nil
	}
	return parseBundleSlugs(cfg)
}

// parseBundleSlugs extracts bundle slugs from a parsed config map.
func parseBundleSlugs(cfg map[string]interface{}) []string {
	arr, ok := cfg["bundles"].([]interface{})
	if !ok {
		return nil
	}
	var slugs []string
	for _, v := range arr {
		if s, ok := v.(string); ok && s != "" {
			slugs = append(slugs, s)
		}
	}
	return slugs
}

// activeBundleDirs returns directories of all enabled bundles for the current project.
// Ordered by priority (first = lowest, last = highest).
func activeBundleDirs() []string {
	return activeBundleDirsFrom("")
}

// activeBundleDirsFrom returns directories of all enabled bundles for a specific project.
func activeBundleDirsFrom(projectDir string) []string {
	slugs := readBundleSlugsFrom(projectDir)
	var dirs []string
	for _, slug := range slugs {
		if dir := bundleDirForSlug(slug); dir != "" {
			dirs = append(dirs, dir)
		}
	}
	return dirs
}

// bundleDirForSlug resolves a bundle slug to its home directory.
func bundleDirForSlug(slug string) string {
	if slug == "" {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	dir := filepath.Join(home, "."+slug)
	if _, err := os.Stat(dir); err == nil {
		return dir
	}
	return ""
}

// readBundleManifest reads name and slug from manifest.json in the given bundle directory.
func readBundleManifest(pkgDir string) (name, slug string) {
	data, err := os.ReadFile(filepath.Join(pkgDir, "manifest.json"))
	if err != nil {
		return "", ""
	}
	var manifest struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if json.Unmarshal(data, &manifest) != nil {
		return "", ""
	}
	return manifest.Name, manifest.Slug
}

// readBundleName reads the "name" field from manifest.json in the given bundle directory.
func readBundleName(pkgDir string) string {
	name, _ := readBundleManifest(pkgDir)
	return name
}

// readBundleHookEvents reads hook event names from a bundle's manifest.json.
// Returns sorted event names (e.g., ["post-tool-use", "pre-tool-use", "prompt-submit"]).
func readBundleHookEvents(pkgDir string) []string {
	data, err := os.ReadFile(filepath.Join(pkgDir, "manifest.json"))
	if err != nil {
		return nil
	}
	var manifest struct {
		Hooks map[string]string `json:"hooks"`
	}
	if json.Unmarshal(data, &manifest) != nil {
		return nil
	}
	var events []string
	for event := range manifest.Hooks {
		events = append(events, event)
	}
	sort.Strings(events)
	return events
}

// readMCPDir scans a directory for MCP server JSON declarations.
// Each *.json file is one server; filename (minus .json) is the server name.
// Relative paths in args are resolved relative to the JSON file's directory.
func readMCPDir(dir string) []MCPServer {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var servers []MCPServer
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var s struct {
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
		}
		if json.Unmarshal(data, &s) != nil || s.Command == "" {
			continue
		}
		resolved := make([]string, len(s.Args))
		for i, arg := range s.Args {
			if !filepath.IsAbs(arg) && !strings.HasPrefix(arg, "-") {
				candidate := filepath.Join(dir, arg)
				if _, err := os.Stat(candidate); err == nil {
					resolved[i] = candidate
					continue
				}
			}
			resolved[i] = arg
		}
		name := strings.TrimSuffix(e.Name(), ".json")
		servers = append(servers, MCPServer{
			Name:    name,
			Command: s.Command,
			Args:    resolved,
			Env:     s.Env,
		})
	}
	return servers
}

// readBundleMCP reads MCP server declarations from all enabled bundles' MCP/ directories.
// Higher-priority bundles override lower-priority ones by server name.
func readBundleMCP() []MCPServer {
	mcpMap := make(map[string]MCPServer)
	for _, pkgDir := range activeBundleDirs() {
		for _, s := range readMCPDir(filepath.Join(pkgDir, "MCP")) {
			mcpMap[s.Name] = s
		}
	}
	return sortedMCP(mcpMap)
}

// sortedMCP returns a sorted slice from a name→server map.
func sortedMCP(m map[string]MCPServer) []MCPServer {
	names := sortedKeys(m)
	servers := make([]MCPServer, len(names))
	for i, name := range names {
		servers[i] = m[name]
	}
	return servers
}

// BundleInfo represents a discovered bundle on disk.
type BundleInfo struct {
	Slug    string
	Name    string
	Version string
	Dir     string // absolute path to bundle home directory
	Active  bool   // true if this is the currently active bundle
}

// discoverBundles scans the home directory for installed bundles.
// A bundle is any ~/.<name>/ directory containing a valid manifest.json.
func discoverBundles() []BundleInfo {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	activeSlugs := make(map[string]bool)
	for _, s := range readBundleSlugs() {
		activeSlugs[s] = true
	}

	entries, err := os.ReadDir(home)
	if err != nil {
		return nil
	}

	var bundles []BundleInfo
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			continue
		}
		// Follow symlinks: e.IsDir() is false for symlinks, so stat the target
		dir := filepath.Join(home, e.Name())
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
		if err != nil {
			continue
		}
		var manifest struct {
			Slug    string `json:"slug"`
			Name    string `json:"name"`
			Version string `json:"version"`
		}
		if json.Unmarshal(data, &manifest) != nil || manifest.Slug == "" {
			continue
		}
		bundles = append(bundles, BundleInfo{
			Slug:    manifest.Slug,
			Name:    manifest.Name,
			Version: manifest.Version,
			Dir:     dir,
			Active:  activeSlugs[manifest.Slug],
		})
	}

	sort.Slice(bundles, func(i, j int) bool {
		return bundles[i].Slug < bundles[j].Slug
	})
	return bundles
}

// scanAgenticDir scans a directory for rules, skills, or agents.
func scanAgenticDir(baseDir string) (rules, skills, agents map[string]*AgenticFile, err error) {
	rules = make(map[string]*AgenticFile)
	skills = make(map[string]*AgenticFile)
	agents = make(map[string]*AgenticFile)

	// Rules: baseDir/RULES/*.md
	rulesDir := filepath.Join(baseDir, "RULES")
	if entries, e := os.ReadDir(rulesDir); e == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			name := strings.TrimSuffix(entry.Name(), ".md")
			af, e := parseAgenticFile(filepath.Join(rulesDir, entry.Name()), "rule")
			if e != nil {
				fmt.Fprintf(os.Stderr, "warning: skipping rule %s: %v\n", name, e)
				continue
			}
			af.Name = name
			rules[name] = af
		}
	}

	// Skills: baseDir/SKILLS/<name>/SKILL.md (directory layout only)
	skillsDir := filepath.Join(baseDir, "SKILLS")
	if entries, e := os.ReadDir(skillsDir); e == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillDir := filepath.Join(skillsDir, entry.Name())
			skillFile := filepath.Join(skillDir, "SKILL.md")
			if _, e := os.Stat(skillFile); e != nil {
				continue
			}
			name := entry.Name()
			af, e := parseAgenticFile(skillFile, "skill")
			if e != nil {
				fmt.Fprintf(os.Stderr, "warning: skipping skill %s: %v\n", name, e)
				continue
			}
			af.Name = name
			af.SourceDir = skillDir
			skills[name] = af
		}
	}

	// Agents: baseDir/AGENTS/*.md
	agentsDir := filepath.Join(baseDir, "AGENTS")
	if entries, e := os.ReadDir(agentsDir); e == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			name := strings.TrimSuffix(entry.Name(), ".md")
			af, e := parseAgenticFile(filepath.Join(agentsDir, entry.Name()), "agent")
			if e != nil {
				fmt.Fprintf(os.Stderr, "warning: skipping agent %s: %v\n", name, e)
				continue
			}
			af.Name = name
			agents[name] = af
		}
	}

	return rules, skills, agents, nil
}

// getPolicy returns the inherit policy for an item, falling back to defaultPolicy.
func getPolicy(inheritCfg map[string]map[string]string, kind, name, defaultPolicy string) string {
	if inheritCfg != nil {
		if kindMap, ok := inheritCfg[kind]; ok {
			if policy, ok := kindMap[name]; ok {
				return policy
			}
		}
	}
	return defaultPolicy
}

// defaultForSource returns the default inherit policy for a given source layer.
// Bundle items default to "defer" (auto-included). Global items default to "off" (opt-in).
func defaultForSource(source string) string {
	if source == "bundle" {
		return "defer"
	}
	return "off"
}

// readLoreMD reads a LORE.md file and returns its trimmed content, or "" if absent/empty.
func readLoreMD(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// mergeAgenticSets merges four layers of content:
//  1. Bundle (lowest) — defaults from the active bundle
//  2. Global (~/.config/lore/) — operator preferences
//  3. Project (.lore/) — project overrides
//  4. Harness (highest) — binary-managed, clobbers everything
//
// globalDir is the global config directory (~/.config/lore/).
// projectDir is the project lore directory (<root>/.lore/).
// LORE.md is accumulated from all layers (bundle → global → project).
// Rules, skills, and agents use inherit.json policies with source-dependent
// defaults: bundle items default to "defer", global items default to "off".
func mergeAgenticSets(globalDir, projectDir string) (*MergedSet, error) {
	ms := &MergedSet{
		Rules:  make(map[string]*AgenticFile),
		Skills: make(map[string]*AgenticFile),
		Agents: make(map[string]*AgenticFile),
	}

	// Read inheritance config (.lore/inherit.json).
	projectRoot := filepath.Dir(projectDir)
	inheritCfg := readInheritConfig(projectRoot)

	nonce := readOrCreateNonce(projectRoot)

	// Accumulate LORE.md from all layers (bundle → global → project)
	var loreParts []string

	// Harness content is injected after all layers merge (see below).

	// Layer 1 (lowest): Bundle content — all enabled bundles in priority order.
	// Later bundles override earlier ones for same-named items.
	for _, pkgDir := range activeBundleDirs() {
		pkgRules, pkgSkills, pkgAgents, err := scanAgenticDir(pkgDir)
		if err == nil {
			for k, v := range pkgRules {
				if p := getPolicy(inheritCfg, "rules", k, "defer"); p == "defer" || p == "overwrite" {
					ms.Rules[k] = v
				}
			}
			for k, v := range pkgSkills {
				if p := getPolicy(inheritCfg, "skills", k, "defer"); p == "defer" || p == "overwrite" {
					ms.Skills[k] = v
				}
			}
			for k, v := range pkgAgents {
				if p := getPolicy(inheritCfg, "agents", k, "defer"); p == "defer" || p == "overwrite" {
					ms.Agents[k] = v
				}
			}
		}

		// Bundle LORE.md
		if content := readLoreMD(filepath.Join(pkgDir, "LORE.md")); content != "" {
			content = strings.ReplaceAll(content, "{{NONCE}}", nonce)
			label := "Bundle"
			if name := readBundleName(pkgDir); name != "" {
				label = name
			}
			loreParts = append(loreParts, "# "+label+"\n\n"+content)
		}
	}

	// Layer 2: Global content — default policy "off"
	if _, err := os.Stat(globalDir); err == nil {
		rules, skills, agents, err := scanAgenticDir(globalDir)
		if err != nil {
			return nil, fmt.Errorf("scan global content: %w", err)
		}
		for k, v := range rules {
			if p := getPolicy(inheritCfg, "rules", k, "off"); p == "defer" || p == "overwrite" {
				ms.Rules[k] = v
			}
		}
		for k, v := range skills {
			if p := getPolicy(inheritCfg, "skills", k, "off"); p == "defer" || p == "overwrite" {
				ms.Skills[k] = v
			}
		}
		for k, v := range agents {
			if p := getPolicy(inheritCfg, "agents", k, "off"); p == "defer" || p == "overwrite" {
				ms.Agents[k] = v
			}
		}
	}

	// Global LORE.md
	if content := readLoreMD(filepath.Join(globalDir, "LORE.md")); content != "" {
		loreParts = append(loreParts, "# Global\n\n"+content)
	}

	// Layer 3 (highest): Project content — always included,
	// except when a bundle/global item has "overwrite" policy.
	if _, err := os.Stat(projectDir); err == nil {
		rules, skills, agents, err := scanAgenticDir(projectDir)
		if err != nil {
			return nil, fmt.Errorf("scan project content: %w", err)
		}
		for k, v := range rules {
			if getPolicy(inheritCfg, "rules", k, "off") == "overwrite" {
				continue
			}
			ms.Rules[k] = v
		}
		for k, v := range skills {
			if getPolicy(inheritCfg, "skills", k, "off") == "overwrite" {
				continue
			}
			ms.Skills[k] = v
		}
		for k, v := range agents {
			if getPolicy(inheritCfg, "agents", k, "off") == "overwrite" {
				continue
			}
			ms.Agents[k] = v
		}
	}

	// Project LORE.md
	if content := readLoreMD(filepath.Join(projectDir, "LORE.md")); content != "" {
		loreParts = append(loreParts, "# Project\n\n"+content)
	}

	ms.LoreMD = strings.Join(loreParts, "\n\n")

	// MCP: three-layer merge — bundles (lowest) → global → project (highest).
	// Override by server name at each layer.
	mcpMap := make(map[string]MCPServer)
	for _, s := range readBundleMCP() {
		mcpMap[s.Name] = s
	}
	for _, s := range readMCPDir(filepath.Join(globalPath(), "MCP")) {
		mcpMap[s.Name] = s
	}
	for _, s := range readMCPDir(filepath.Join(projectDir, "MCP")) {
		mcpMap[s.Name] = s
	}
	ms.MCP = sortedMCP(mcpMap)

	// Harness content — injected last, clobbers everything.
	// Binary-managed content that no other layer can override.
	harnessDir := filepath.Join(globalDir, ".harness")
	if _, err := os.Stat(harnessDir); err == nil {
		hRules, hSkills, hAgents, _ := scanAgenticDir(harnessDir)
		for k, v := range hRules {
			ms.Rules[k] = v
		}
		for k, v := range hSkills {
			ms.Skills[k] = v
		}
		for k, v := range hAgents {
			ms.Agents[k] = v
		}
	}

	return ms, nil
}
