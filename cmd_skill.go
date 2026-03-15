package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// discoveredSkill represents a skill found during source scanning.
type discoveredSkill struct {
	Name        string
	Description string
	Dir         string // directory containing SKILL.md
}

func cmdSkill(args []string) {
	if len(args) == 0 {
		fmt.Print(skillHelpText)
		return
	}

	sub := args[0]
	rest := args[1:]

	switch sub {
	case "add":
		cmdSkillAdd(rest)
	case "help", "--help", "-h":
		fmt.Print(skillHelpText)
	default:
		fmt.Fprintf(os.Stderr, "Unknown skill command: %s\nRun 'lore skill help' for usage.\n", sub)
		os.Exit(1)
	}
}

func cmdSkillAdd(args []string) {
	var source string
	var targetProject, targetGlobal bool
	var targetBundle string
	var skillFilter []string
	var yes bool

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--help", "-h":
			fmt.Print(skillAddHelpText)
			return
		case "--project":
			targetProject = true
		case "--global":
			targetGlobal = true
		case "--bundle":
			if i+1 >= len(args) {
				fatal("--bundle requires a value")
			}
			i++
			targetBundle = args[i]
		case "--skill":
			if i+1 >= len(args) {
				fatal("--skill requires a value")
			}
			i++
			skillFilter = append(skillFilter, args[i])
		case "-y", "--yes":
			yes = true
		default:
			if source == "" {
				source = args[i]
			}
		}
	}

	if source == "" {
		fatal("Usage: lore skill add <source> --project | --global | --bundle <slug>")
	}

	// Exactly one target required
	targets := 0
	if targetProject {
		targets++
	}
	if targetGlobal {
		targets++
	}
	if targetBundle != "" {
		targets++
	}
	if targets == 0 {
		fatal("A target flag is required: --project, --global, or --bundle <slug>")
	}
	if targets > 1 {
		fatal("Only one target allowed: --project, --global, or --bundle <slug>")
	}

	// Resolve source to a local directory
	sourceDir, cleanup, err := resolveSkillSource(source)
	if err != nil {
		fatal("Cannot resolve source: %v", err)
	}
	if cleanup != nil {
		defer cleanup()
	}

	// Discover skills
	skills := discoverImportSkills(sourceDir)
	if len(skills) == 0 {
		fatal("No skills found in %s", source)
	}

	// Apply --skill filter
	if len(skillFilter) > 0 {
		skills = filterDiscoveredSkills(skills, skillFilter)
		if len(skills) == 0 {
			fatal("No matching skills found for: %s", strings.Join(skillFilter, ", "))
		}
	}

	// Resolve target directory
	targetDir, targetLabel := resolveSkillTarget(targetProject, targetGlobal, targetBundle)

	// Source provenance label
	sourceLabel := skillSourceProvenance(source)

	// Print found skills
	fmt.Printf("\nFound %d skill%s in %s:\n", len(skills), plural(len(skills)), source)
	for _, s := range skills {
		fmt.Printf("  %s", s.Name)
		if s.Description != "" {
			fmt.Printf(" — %s", s.Description)
		}
		fmt.Println()
	}

	// Handle bundle creation if target bundle doesn't exist
	if targetBundle != "" {
		bundleDir := bundleDirForSlug(targetBundle)
		if bundleDir == "" {
			if !yes {
				fmt.Printf("\nBundle \"%s\" does not exist. Create it? [y/N] ", targetBundle)
				var answer string
				fmt.Scanln(&answer)
				if strings.ToLower(strings.TrimSpace(answer)) != "y" {
					fmt.Println("Cancelled.")
					return
				}
			}
			if err := scaffoldSkillBundle(targetBundle); err != nil {
				fatal("Cannot create bundle: %v", err)
			}
			fmt.Printf("Created bundle \"%s\"\n", targetBundle)
		}
	}

	// Check for conflicts
	var conflicts, fresh []discoveredSkill
	for _, s := range skills {
		destDir := filepath.Join(targetDir, s.Name)
		if _, err := os.Stat(destDir); err == nil {
			conflicts = append(conflicts, s)
		} else {
			fresh = append(fresh, s)
		}
	}

	// Handle conflicts
	if len(conflicts) > 0 {
		fmt.Printf("\nConflicts with existing skills in %s:\n", targetLabel)
		for _, c := range conflicts {
			prov := readSkillProvenance(filepath.Join(targetDir, c.Name))
			fmt.Printf("  %s", c.Name)
			if prov != "" {
				fmt.Printf(" (%s)", prov)
			}
			fmt.Println()
		}

		if !yes {
			fmt.Printf("\nOverwrite %d conflicting skill%s? [y/N] ", len(conflicts), plural(len(conflicts)))
			var answer string
			fmt.Scanln(&answer)
			if strings.ToLower(strings.TrimSpace(answer)) != "y" {
				skills = fresh
				conflicts = nil
				if len(skills) == 0 {
					fmt.Println("Cancelled.")
					return
				}
			}
		}
	}

	// Confirm add
	if !yes {
		fmt.Printf("Add %d skill%s to %s? [y/N] ", len(skills), plural(len(skills)), targetLabel)
		var answer string
		fmt.Scanln(&answer)
		if strings.ToLower(strings.TrimSpace(answer)) != "y" {
			fmt.Println("Cancelled.")
			return
		}
	}

	// Create target SKILLS directory
	os.MkdirAll(targetDir, 0755)

	// Install skills
	installed := 0
	today := time.Now().Format("2006-01-02")
	for _, s := range skills {
		destDir := filepath.Join(targetDir, s.Name)
		// Remove existing on overwrite
		if _, err := os.Stat(destDir); err == nil {
			os.RemoveAll(destDir)
		}
		if err := copySkillDir(s.Dir, destDir); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to copy %s: %v\n", s.Name, err)
			continue
		}
		if err := transformSkillFrontmatter(filepath.Join(destDir, "SKILL.md"), sourceLabel, today); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to transform %s: %v\n", s.Name, err)
		}
		installed++
	}

	fmt.Printf("\nAdded %d skill%s to %s\n", installed, plural(installed), targetLabel)
}

// --- Source resolution ---

// resolveSkillSource converts a source string to a local directory path.
// Returns the path, an optional cleanup function, and any error.
func resolveSkillSource(source string) (string, func(), error) {
	// Local path
	if strings.HasPrefix(source, ".") || strings.HasPrefix(source, "/") || strings.HasPrefix(source, "~") {
		path := source
		if strings.HasPrefix(path, "~/") {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", nil, fmt.Errorf("cannot resolve home: %w", err)
			}
			path = filepath.Join(home, path[2:])
		}
		abs, err := filepath.Abs(path)
		if err != nil {
			return "", nil, err
		}
		if _, err := os.Stat(abs); err != nil {
			return "", nil, fmt.Errorf("path does not exist: %s", abs)
		}
		return abs, nil, nil
	}

	// Git URL or GitHub shorthand
	repoURL := source
	if !strings.Contains(source, "://") {
		// GitHub shorthand: owner/repo
		if !strings.Contains(source, "/") {
			return "", nil, fmt.Errorf("invalid source: %s (expected owner/repo, URL, or local path)", source)
		}
		repoURL = "https://github.com/" + source
	}

	tmpDir, err := os.MkdirTemp("", "lore-skill-*")
	if err != nil {
		return "", nil, fmt.Errorf("cannot create temp dir: %w", err)
	}
	cleanup := func() { os.RemoveAll(tmpDir) }

	fmt.Printf("Cloning %s...\n", source)
	cmd := exec.Command("git", "clone", "--depth", "1", repoURL, tmpDir)
	if out, err := cmd.CombinedOutput(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("git clone failed: %v\n%s", err, out)
	}

	return tmpDir, cleanup, nil
}

// --- Discovery ---

var skillSkipDirs = map[string]bool{
	"node_modules": true,
	".git":         true,
	"dist":         true,
	"build":        true,
}

// discoverImportSkills scans a directory for SKILL.md files following ecosystem conventions.
func discoverImportSkills(root string) []discoveredSkill {
	var skills []discoveredSkill
	seen := make(map[string]bool)

	addSkill := func(dir string) {
		s := parseImportSkillFrontmatter(filepath.Join(dir, "SKILL.md"))
		if s == nil {
			return
		}
		if seen[s.Name] {
			return
		}
		s.Dir = dir
		seen[s.Name] = true
		skills = append(skills, *s)
	}

	// Check root SKILL.md
	if _, err := os.Stat(filepath.Join(root, "SKILL.md")); err == nil {
		addSkill(root)
	}

	// Priority paths
	priorityDirs := []string{
		filepath.Join(root, "skills"),
		filepath.Join(root, ".agents", "skills"),
		filepath.Join(root, ".claude", "skills"),
		filepath.Join(root, ".cursor", "skills"),
		filepath.Join(root, ".codex", "skills"),
		filepath.Join(root, ".goose", "skills"),
		filepath.Join(root, ".windsurf", "skills"),
		filepath.Join(root, ".opencode", "skills"),
	}

	for _, dir := range priorityDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			skillDir := filepath.Join(dir, e.Name())
			if _, err := os.Stat(filepath.Join(skillDir, "SKILL.md")); err == nil {
				addSkill(skillDir)
			}
		}
	}

	// Fallback: recursive search up to 5 levels deep
	if len(skills) == 0 {
		recursiveSkillDiscover(root, 0, 5, seen, &skills)
	}

	return skills
}

func recursiveSkillDiscover(dir string, depth, maxDepth int, seen map[string]bool, skills *[]discoveredSkill) {
	if depth > maxDepth {
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if skillSkipDirs[name] {
			continue
		}
		subDir := filepath.Join(dir, name)
		if _, err := os.Stat(filepath.Join(subDir, "SKILL.md")); err == nil {
			s := parseImportSkillFrontmatter(filepath.Join(subDir, "SKILL.md"))
			if s != nil && !seen[s.Name] {
				s.Dir = subDir
				seen[s.Name] = true
				*skills = append(*skills, *s)
			}
		}
		recursiveSkillDiscover(subDir, depth+1, maxDepth, seen, skills)
	}
}

// parseImportSkillFrontmatter reads a SKILL.md and extracts name and description.
func parseImportSkillFrontmatter(path string) *discoveredSkill {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	content := strings.ReplaceAll(string(data), "\r\n", "\n")
	if !strings.HasPrefix(content, "---\n") {
		return nil
	}
	end := strings.Index(content[4:], "\n---")
	if end < 0 {
		return nil
	}

	var fm struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	if yaml.Unmarshal([]byte(content[4:4+end]), &fm) != nil {
		return nil
	}
	if fm.Name == "" {
		return nil
	}
	return &discoveredSkill{
		Name:        fm.Name,
		Description: fm.Description,
	}
}

// filterDiscoveredSkills filters skills by name (case-insensitive).
func filterDiscoveredSkills(skills []discoveredSkill, names []string) []discoveredSkill {
	nameSet := make(map[string]bool)
	for _, n := range names {
		nameSet[strings.ToLower(n)] = true
	}
	var result []discoveredSkill
	for _, s := range skills {
		if nameSet[strings.ToLower(s.Name)] {
			result = append(result, s)
		}
	}
	return result
}

// --- Target resolution ---

// resolveSkillTarget determines the target SKILLS directory and display label.
func resolveSkillTarget(project, global bool, bundle string) (string, string) {
	if project {
		return filepath.Join(".lore", "SKILLS"), ".lore/SKILLS/"
	}
	if global {
		return filepath.Join(globalPath(), "SKILLS"), globalPath() + "/SKILLS/"
	}
	// Bundle
	bundleDir := bundleDirForSlug(bundle)
	if bundleDir != "" {
		return filepath.Join(bundleDir, "SKILLS"), fmt.Sprintf("\"%s\"", bundle)
	}
	// Bundle doesn't exist yet — path for after creation
	return filepath.Join(bundlesPath(), bundle, "SKILLS"), fmt.Sprintf("\"%s\"", bundle)
}

// --- Provenance ---

// skillSourceProvenance returns a provenance label for the source.
func skillSourceProvenance(source string) string {
	// Full URL
	if strings.Contains(source, "://") {
		s := strings.TrimPrefix(source, "https://")
		s = strings.TrimPrefix(s, "http://")
		s = strings.TrimSuffix(s, ".git")
		return s
	}
	// GitHub shorthand
	if strings.Contains(source, "/") && !strings.HasPrefix(source, ".") && !strings.HasPrefix(source, "/") {
		return "github.com/" + source
	}
	// Local path
	return source
}

// readSkillProvenance reads provenance metadata from an existing SKILL.md.
func readSkillProvenance(skillDir string) string {
	data, err := os.ReadFile(filepath.Join(skillDir, "SKILL.md"))
	if err != nil {
		return ""
	}
	content := strings.ReplaceAll(string(data), "\r\n", "\n")
	if !strings.HasPrefix(content, "---\n") {
		return ""
	}
	end := strings.Index(content[4:], "\n---")
	if end < 0 {
		return ""
	}

	var fm struct {
		Metadata map[string]interface{} `yaml:"metadata"`
	}
	if yaml.Unmarshal([]byte(content[4:4+end]), &fm) != nil {
		return ""
	}
	if fm.Metadata == nil {
		return ""
	}
	var parts []string
	if s, ok := fm.Metadata["source"].(string); ok {
		parts = append(parts, "source: "+s)
	}
	if s, ok := fm.Metadata["imported"].(string); ok {
		parts = append(parts, "imported: "+s)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ")
}

// --- Bundle scaffolding ---

// scaffoldSkillBundle creates a new bundle with a minimal manifest.
func scaffoldSkillBundle(slug string) error {
	bp := bundlesPath()
	os.MkdirAll(bp, 0755)
	bundleDir := filepath.Join(bp, slug)
	if err := os.MkdirAll(bundleDir, 0755); err != nil {
		return err
	}

	manifest := map[string]interface{}{
		"manifest_version": 1,
		"slug":             slug,
		"name":             slug,
		"version":          "0.1.0",
		"description":      "User-curated skill bundle",
		"hooks":            map[string]interface{}{},
		"content":          []string{"SKILLS"},
	}

	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(bundleDir, "manifest.json"), append(data, '\n'), 0644)
}

// --- Skill copy and transform ---

// copySkillDir copies an entire skill directory (deep skills support).
func copySkillDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(src, path)
		if rel == "." {
			return os.MkdirAll(dst, 0755)
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		return os.WriteFile(target, data, 0644)
	})
}

// transformSkillFrontmatter adds user-invocable and provenance metadata to a SKILL.md.
// Uses yaml.Node to preserve existing field order.
func transformSkillFrontmatter(path, source, today string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	content := strings.ReplaceAll(string(data), "\r\n", "\n")

	if !strings.HasPrefix(content, "---\n") {
		return nil
	}
	end := strings.Index(content[4:], "\n---")
	if end < 0 {
		return nil
	}

	fmData := content[4 : 4+end]
	body := content[4+end+4:] // everything after closing ---

	// Parse into node tree to preserve key order
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(fmData), &doc); err != nil {
		return fmt.Errorf("parse frontmatter: %w", err)
	}

	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil
	}
	mapping := doc.Content[0]
	if mapping.Kind != yaml.MappingNode {
		return nil
	}

	// Scan existing fields
	hasUserInvocable := false
	metadataIdx := -1
	for i := 0; i < len(mapping.Content)-1; i += 2 {
		key := mapping.Content[i].Value
		if key == "user-invocable" {
			hasUserInvocable = true
		}
		if key == "metadata" {
			metadataIdx = i
		}
	}

	// Add user-invocable: true if missing — imported skills are user-invocable by default.
	// Authors can set user-invocable: false in their SKILL.md if it's agent-only.
	if !hasUserInvocable {
		mapping.Content = append(mapping.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "user-invocable"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: "true", Tag: "!!bool"},
		)
	}

	// Handle metadata.source and metadata.imported
	if metadataIdx >= 0 {
		metaNode := mapping.Content[metadataIdx+1]
		if metaNode.Kind == yaml.MappingNode {
			hasSource := false
			hasImported := false
			for i := 0; i < len(metaNode.Content)-1; i += 2 {
				k := metaNode.Content[i].Value
				if k == "source" {
					hasSource = true
				}
				if k == "imported" {
					hasImported = true
				}
			}
			if !hasSource {
				metaNode.Content = append(metaNode.Content,
					&yaml.Node{Kind: yaml.ScalarNode, Value: "source"},
					&yaml.Node{Kind: yaml.ScalarNode, Value: source},
				)
			}
			if !hasImported {
				metaNode.Content = append(metaNode.Content,
					&yaml.Node{Kind: yaml.ScalarNode, Value: "imported"},
					&yaml.Node{Kind: yaml.ScalarNode, Value: today, Style: yaml.DoubleQuotedStyle},
				)
			}
		}
	} else {
		metaMap := &yaml.Node{Kind: yaml.MappingNode, Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "source"},
			{Kind: yaml.ScalarNode, Value: source},
			{Kind: yaml.ScalarNode, Value: "imported"},
			{Kind: yaml.ScalarNode, Value: today, Style: yaml.DoubleQuotedStyle},
		}}
		mapping.Content = append(mapping.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "metadata"},
			metaMap,
		)
	}

	// Marshal the mapping node back to YAML
	fmBytes, err := yaml.Marshal(mapping)
	if err != nil {
		return fmt.Errorf("marshal frontmatter: %w", err)
	}

	newContent := "---\n" + string(fmBytes) + "---" + body
	return os.WriteFile(path, []byte(newContent), 0644)
}

// --- Helpers ---

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// importSkillToTarget imports a single skill from a source repo into a target SKILLS directory.
// Used by both CLI (cmdSkillAdd) and TUI (skills explorer).
func importSkillToTarget(source, skillName, targetDir, sourceLabel string) error {
	sourceDir, cleanup, err := resolveSkillSource(source)
	if err != nil {
		return err
	}
	if cleanup != nil {
		defer cleanup()
	}

	skills := discoverImportSkills(sourceDir)

	var skill *discoveredSkill
	for _, s := range skills {
		if strings.EqualFold(s.Name, skillName) {
			skill = &s
			break
		}
	}
	if skill == nil {
		return fmt.Errorf("skill %s not found in %s", skillName, source)
	}

	os.MkdirAll(targetDir, 0755)
	destDir := filepath.Join(targetDir, skill.Name)
	os.RemoveAll(destDir) // overwrite if exists

	if err := copySkillDir(skill.Dir, destDir); err != nil {
		return err
	}

	today := time.Now().Format("2006-01-02")
	return transformSkillFrontmatter(filepath.Join(destDir, "SKILL.md"), sourceLabel, today)
}

// --- Help text ---

const skillHelpText = `Import skills from the Agent Skills ecosystem.

Usage: lore skill <command> [args]

Commands:
  add <source>      Import skills from a repo or local path

Run 'lore skill add --help' for details.
`

const skillAddHelpText = `Import skills from the Agent Skills ecosystem into a Lore layer.

Usage: lore skill add <source> --project | --global | --bundle <slug>

Source formats:
  owner/repo                    GitHub shorthand
  https://github.com/user/repo  Full URL
  ./path/to/repo                Local path

A target flag is required:
  --project              Import into .lore/SKILLS/
  --global               Import into ~/.config/lore/SKILLS/
  --bundle <slug>        Import into bundle's SKILLS/ (creates bundle if needed)

Options:
  --skill <name>         Import only the named skill (repeatable)
  -y, --yes              Skip confirmation prompts

Examples:
  lore skill add vercel-labs/agent-skills --bundle my-toolkit
  lore skill add vercel-labs/agent-skills --bundle my-toolkit --skill pr-review
  lore skill add ./local-skills --project
  lore skill add https://github.com/user/repo --global -y
`
