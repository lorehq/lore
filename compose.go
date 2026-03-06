package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// AgenticFile represents a parsed AGENTIC file (rule, skill, or agent).
type AgenticFile struct {
	Kind string // "rule", "skill", "agent"
	Name string // derived from filename/dirname
	Path string // source path on disk

	// Frontmatter fields (passthrough — each projector uses what it needs)
	Description string   `yaml:"description"`
	Paths       []string `yaml:"paths"`  // rules: path/glob scoping
	Model       string   `yaml:"model"`  // agents: model preference
	Tools       []string `yaml:"tools"`  // agents: tool allowlist

	// Body is everything after the frontmatter
	Body string
}

// MergedSet holds the result of merging global + project AGENTIC content.
// Rules, skills, and agents are independent peers — no ownership hierarchy.
type MergedSet struct {
	Rules  map[string]*AgenticFile
	Skills map[string]*AgenticFile
	Agents map[string]*AgenticFile
	LoreMD string // operator instructions from .lore/LORE.md
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

	content := string(data)

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
				return nil, nil, nil, e
			}
			af.Name = name
			rules[name] = af
		}
	}

	// Skills: baseDir/SKILLS/<name>/SKILL.md
	skillsDir := filepath.Join(baseDir, "SKILLS")
	if entries, e := os.ReadDir(skillsDir); e == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillFile := filepath.Join(skillsDir, entry.Name(), "SKILL.md")
			if _, e := os.Stat(skillFile); e != nil {
				continue
			}
			name := entry.Name()
			af, e := parseAgenticFile(skillFile, "skill")
			if e != nil {
				return nil, nil, nil, e
			}
			af.Name = name
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
				return nil, nil, nil, e
			}
			af.Name = name
			agents[name] = af
		}
	}

	return rules, skills, agents, nil
}

// mergeAgenticSets merges three layers of AGENTIC content:
//  1. Harness skills (~/.lore/.harness/SKILLS/) — system, always wins for lore-*
//  2. Global (~/.lore/AGENTIC/) — user's global content
//  3. Project (.lore/AGENTIC/) — project overrides (wins for non-lore-* names)
func mergeAgenticSets(globalDir, projectDir string) (*MergedSet, error) {
	ms := &MergedSet{
		Rules:  make(map[string]*AgenticFile),
		Skills: make(map[string]*AgenticFile),
		Agents: make(map[string]*AgenticFile),
	}

	// Layer 1a: Harness skills (system — lore-* prefix, highest priority)
	harnessDir := harnessSkillsDir()
	if _, err := os.Stat(harnessDir); err == nil {
		entries, _ := os.ReadDir(harnessDir)
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillFile := filepath.Join(harnessDir, entry.Name(), "SKILL.md")
			if _, e := os.Stat(skillFile); e != nil {
				continue
			}
			af, e := parseAgenticFile(skillFile, "skill")
			if e != nil {
				continue
			}
			af.Name = entry.Name()
			ms.Skills[entry.Name()] = af
		}
	}

	// Layer 1b: Harness agents (system — lore-* prefix, highest priority)
	harnessAgDir := harnessAgentsDir()
	if _, err := os.Stat(harnessAgDir); err == nil {
		entries, _ := os.ReadDir(harnessAgDir)
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			name := strings.TrimSuffix(entry.Name(), ".md")
			af, e := parseAgenticFile(filepath.Join(harnessAgDir, entry.Name()), "agent")
			if e != nil {
				continue
			}
			af.Name = name
			ms.Agents[name] = af
		}
	}

	// Layer 2: Global AGENTIC
	if _, err := os.Stat(globalDir); err == nil {
		rules, skills, agents, err := scanAgenticDir(globalDir)
		if err != nil {
			return nil, fmt.Errorf("scan global AGENTIC: %w", err)
		}
		for k, v := range rules {
			ms.Rules[k] = v
		}
		for k, v := range skills {
			if strings.HasPrefix(k, "lore-") {
				continue // harness wins for lore-*
			}
			ms.Skills[k] = v
		}
		for k, v := range agents {
			ms.Agents[k] = v
		}
	}

	// Layer 3: Project AGENTIC — wins for non-lore-* names
	if _, err := os.Stat(projectDir); err == nil {
		rules, skills, agents, err := scanAgenticDir(projectDir)
		if err != nil {
			return nil, fmt.Errorf("scan project AGENTIC: %w", err)
		}
		for k, v := range rules {
			if strings.HasPrefix(k, "lore-") {
				continue // system — harness/global wins
			}
			ms.Rules[k] = v
		}
		for k, v := range skills {
			if strings.HasPrefix(k, "lore-") {
				continue
			}
			ms.Skills[k] = v
		}
		for k, v := range agents {
			if strings.HasPrefix(k, "lore-") {
				continue
			}
			ms.Agents[k] = v
		}
	}

	// Read operator instructions (.lore/LORE.md)
	loreMDPath := filepath.Join(filepath.Dir(projectDir), "LORE.md")
	if data, err := os.ReadFile(loreMDPath); err == nil {
		ms.LoreMD = strings.TrimSpace(string(data))
	}

	return ms, nil
}

