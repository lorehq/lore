package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/tree"
	"github.com/charmbracelet/x/ansi"
	zone "github.com/lrstanley/bubblezone"
)

// ── Styles ──────────────────────────────────────────────────────────

var (
	bold     = lipgloss.NewStyle().Bold(true)
	dimStyle = lipgloss.NewStyle().Faint(true)
	errStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))

	btnPrimary = lipgloss.NewStyle().
			Reverse(true).
			Bold(true).
			Padding(0, 3)
	btnSecondary = lipgloss.NewStyle().
			Reverse(true).
			Padding(0, 3)
	btnDisabled = lipgloss.NewStyle().
			Faint(true).
			Padding(0, 3)

	// Semantic colors for projection tree
	greenStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	yellowStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	redStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Strikethrough(true)
)

// ── Constants ───────────────────────────────────────────────────────

type viewMode int

const (
	modeWelcome   viewMode = iota // no .lore/ detected
	modeDashboard                 // inside a lore project
	modeSuccess                   // post-init success screen
)

type wizardStep int

const (
	stepChoice    wizardStep = iota // "init here" or "create new"
	stepName                        // project name input (create new only)
	stepPlatforms                   // platform selection
	stepConfirm                     // confirmation
)

type tabID int

const (
	tabProjection  tabID = iota
	tabMarketplace
)

// projItem represents an item in the catalog or project content listing.
type projItem struct {
	kind     string   // "rule", "skill", "agent"
	name     string
	desc     string
	skills   []string // agents only: declared skill deps
	source   string   // "bundle", "global" (catalog items only)
	bundleSlug string   // which bundle this item came from (bundle items only)
	// Skills only: file counts in supporting subdirectories
	numReferences int
	numAssets     int
	numScripts    int
}

// countSkillResources counts files in a skill directory's supporting subdirs.
func countSkillResources(sourceDir string) (refs, assets, scripts int) {
	for _, sub := range []struct {
		name string
		ptr  *int
	}{
		{"references", &refs},
		{"assets", &assets},
		{"scripts", &scripts},
	} {
		dir := filepath.Join(sourceDir, sub.name)
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				*sub.ptr++
			}
		}
	}
	return
}

// skillResourceBadge returns a dimmed summary like "2 refs, 1 asset" or "".
func skillResourceBadge(refs, assets, scripts int) string {
	if refs == 0 && assets == 0 && scripts == 0 {
		return ""
	}
	var parts []string
	if refs > 0 {
		parts = append(parts, fmt.Sprintf("%d ref", refs))
		if refs > 1 {
			parts[len(parts)-1] += "s"
		}
	}
	if assets > 0 {
		parts = append(parts, fmt.Sprintf("%d asset", assets))
		if assets > 1 {
			parts[len(parts)-1] += "s"
		}
	}
	if scripts > 0 {
		parts = append(parts, fmt.Sprintf("%d script", scripts))
		if scripts > 1 {
			parts[len(parts)-1] += "s"
		}
	}
	return strings.Join(parts, ", ")
}

// hookEntry pairs an event name with a behavior name.
type hookEntry struct {
	event string // e.g. "prompt-submit"
	name  string // behavior name e.g. "Ambiguity Nudge"
}

type bundleGroup struct {
	slug          string
	name          string
	collapsed     bool
	kindCollapsed [3]bool // rules/skills/agents collapsed within this bundle
	hasLoreMD     bool
	hookEntries    []hookEntry // hook event → script pairs from manifest.json
	hooksCollapsed bool        // HOOKS list collapsed
	mcpServers     []string    // MCP server names from this bundle's MCP/ dir
	mcpCollapsed   bool        // MCP list collapsed
	items          []projItem
}

// ── Bundle TUI Pages ────────────────────────────────────────────────

type bundlePage struct {
	name       string
	script     string // absolute path
	bundleSlug string
	tabID      tabID
}

type bundlePageOutput struct {
	Sections []bundlePageSection `json:"sections"`
	Status   string              `json:"status"`
}

type bundlePageSection struct {
	Name      string           `json:"name"`
	Badge     string           `json:"badge"`
	Collapsed bool             `json:"collapsed"`
	Items     []bundlePageItem `json:"items"`
}

type bundlePageItem struct {
	Label  string `json:"label"`
	Detail string `json:"detail"`
	Path   string `json:"path"`
	Badge  string `json:"badge"`
}

// ── Messages ────────────────────────────────────────────────────────

type initDoneMsg struct {
	newDir   string   // non-empty when a new project dir was created
	backedUp []string // files backed up during init-here
}

type tickMsg struct{}
type genDoneMsg struct {
	fileCount    int
	cleanedCount int
	err          error
}
type bundlePageLoadedMsg struct {
	tabID  tabID
	output *bundlePageOutput
	err    error
}

type marketplaceItem struct {
	slug        string
	name        string
	description string
	version     string
	author      string
	repo        string
	path        string
	tags        []string
	installed   bool
}

type mktLoadedMsg struct {
	installed []marketplaceItem
	available []marketplaceItem
	err       error
}

type mktOpDoneMsg struct {
	verb string
	slug string
	err  error
}

// ── Model ───────────────────────────────────────────────────────────

type tuiModel struct {
	width  int
	height int

	mode viewMode
	tab  tabID

	// context
	cwd           string
	globalExists  bool
	isLoreProject bool

	// project info
	projectName string
	platforms   map[string]bool

	// Content counts
	ruleCount  int
	skillCount int
	agentCount int

	// wizard state (welcome mode)
	wizStep      wizardStep
	wizCursor    int
	wizChoice    int // 0=init here, 1=create new
	wizNameBuf   string
	wizNameErr   string
	wizPlatforms map[int]bool
	wizBackedUp  []string // files backed up during init-here
	wizBtnFocus  int      // -1=content (text input/list), 0=Back, 1=Continue/Confirm

	// projection planner state
	projPane      int // 0=catalog, 1=project, 2=output
	projCatalog   []projItem // unified bundle + global items (bundle first, then global)
	projGlobal    []projItem // global content items (Pane 0 top)
	projBundle      []projItem // bundle content items (Pane 0 bottom)
	projProject   []projItem
	projHarness   []projItem // harness-managed items (always projected, clobber all)
	projInherit   map[string]map[string]string
	projCursor    [3]int
	projScroll    [3]int // Y offset for each pane's scroll position
	projLoaded    bool
	hasMCP        bool // true if bundle or project declares MCP servers

	// catalog sub-pane state (pane 0 has two stacked boxes)
	catalogScroll  [2]int // [0]=global scroll, [1]=bundle scroll
	catalogSub     int    // 0=global, 1=bundle (sub-pane focus within pane 0)
	catalogGlobalH int    // height of the global box in pane 0 (for mouse scroll targeting)
	colStartY      int    // Y offset where column content begins (for mouse targeting)

	// collapsible kind groups: [3]bool for rules/skills/agents collapsed state
	globalCollapsed  [3]bool // global pane kind groups
	projectCollapsed [3]bool // project pane kind groups

	// bundle state
	enabledBundles   []bundleGroup // enabled bundles in priority order
	availableBundles []BundleInfo  // installed but not enabled

	// bundle confirm dialog
	bundleConfirm       bool   // showing bundle confirm dialog
	bundleConfirmSlug   string // slug to enable/disable
	bundleConfirmName   string // display name
	bundleConfirmEnable bool   // true = enable, false = disable

	// LORE.md presence flags
	loreGlobal  bool // global LORE.md has content
	loreProject bool // project LORE.md has content

	// MCP server names per layer (for display in panes)
	mcpGlobal           []string // server names from global MCP/
	mcpProject          []string // server names from project .lore/MCP/
	mcpGlobalCollapsed  bool     // global MCP list collapsed
	mcpProjectCollapsed bool     // project MCP list collapsed

	// Hook entries per layer (event + script basename for display)
	hooksGlobal           []hookEntry // resolved hook entries at global level
	hooksProject          []hookEntry // resolved hook entries at project level
	hooksGlobalCollapsed  bool        // global HOOKS list collapsed
	hooksProjectCollapsed bool        // project HOOKS list collapsed

	// generate state
	genMessage     string // e.g. "Generated 14 files"
	genIsError     bool   // true if genMessage is an error
	genTick        int    // countdown to clear message
	genConfirm     bool   // showing confirmation dialog
	genNewFiles    []string // files that would be created
	genOverFiles   []string // files that would be overwritten
	genConfScroll  int      // scroll offset in confirmation dialog

	// cached merged names — recomputed in recomputeDiff(), shared by tree/diff/orphan
	mergedRules     []string
	mergedSkills    []string
	mergedAgents    []string
	skillSourceDirs map[string]string // skill name → source dir (for resource file enumeration)

	// clean mode — show orphan files in projections pane, delete on generate
	cleanMode   bool     // destructive mode toggle
	orphanFiles []string // files that would be deleted (computed)

	// harness visibility — hide harness-managed items from projection tree
	hideHarness bool

	// agent-disable skill picker
	agentDisableActive bool
	agentDisableName   string
	agentDisableSkills []string // skills referenced by the agent
	agentDisableKeep   map[int]bool // indices of skills to keep enabled
	agentDisableCursor int

	// skill-disable warning (skill referenced by active agents)
	skillWarnActive bool
	skillWarnName   string
	skillWarnAgents []string // agents that reference the skill

	// hint overlay
	hintPane int  // -1 = no hint, 0/1/2 = showing hint for that pane
	loreHint bool // showing LORE.md tooltip modal

	// wizard guards
	canInitHere bool // false if cwd is home dir or above

	// success screen
	successPath string

	// bundle TUI pages
	bundlePages         []bundlePage
	bundlePageData      map[tabID]*bundlePageOutput
	bundlePageScroll    map[tabID]int
	bundlePageCollapsed map[tabID]map[int]bool
	bundlePageLoading   map[tabID]bool

	// marketplace tab state
	mktLoaded             bool
	mktLoading            bool
	mktInstalled          []marketplaceItem
	mktAvailable          []marketplaceItem
	mktScroll             int
	mktSearch             string
	mktSearchActive       bool
	mktInstalledCollapsed bool
	mktAvailableCollapsed bool
	mktOpActive           bool
	mktOpSlug             string
	mktOpVerb             string
	mktConfirm            bool
	mktConfirmSlug        string
	mktConfirmVerb        string // "remove" or "install"
	mktConfirmRepo        string // repo URL for install
	mktConfirmPath        string // subpath for monorepo install
}

// isProjectSafeDir returns true if dir is a valid location for a Lore project.
// Blocks home directory and anything above it — home is not a project.
func isProjectSafeDir(dir string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return true // can't determine home, allow
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return true
	}
	home = filepath.Clean(home)
	abs = filepath.Clean(abs)
	// Block if dir IS home or home is inside dir (dir is ancestor of home)
	if abs == home {
		return false
	}
	rel, err := filepath.Rel(abs, home)
	if err != nil {
		return true
	}
	// If home is relative to abs without "..", abs is an ancestor of home
	if !strings.HasPrefix(rel, "..") {
		return false
	}
	return true
}

func initialModel() *tuiModel {
	cwd, _ := os.Getwd()
	if cwd == "" {
		cwd, _ = filepath.Abs(".")
	}

	_, err := os.Stat(filepath.Join(cwd, ".lore", "config.json"))
	isLore := err == nil

	_, globalErr := os.Stat(globalPath())
	globalExists := globalErr == nil

	m := &tuiModel{
		cwd:              cwd,
		globalExists:     globalExists,
		isLoreProject:    isLore,
		wizPlatforms:     make(map[int]bool),
		canInitHere:      isProjectSafeDir(cwd),
		hintPane:         -1,
		globalCollapsed:     [3]bool{true, true, true},
		projectCollapsed:    [3]bool{true, true, true},
		mcpGlobalCollapsed:  true,
		mcpProjectCollapsed: true,
		hideHarness:         true,
	}

	if isLore {
		m.mode = modeDashboard
		m.loadProjectInfo()
	} else {
		m.mode = modeWelcome
	}

	return m
}

func (m *tuiModel) loadProjectInfo() {
	m.projectName = filepath.Base(m.cwd)
	if m.projectName == "" || m.projectName == "." || m.projectName == "/" {
		m.projectName = m.cwd
	}

	// Ensure we read from the project dir, not process cwd
	origDir, _ := os.Getwd()
	os.Chdir(m.cwd)
	defer os.Chdir(origDir)

	platforms, err := readProjectConfig()
	if err == nil {
		m.platforms = platforms
	} else {
		m.platforms = defaultPlatforms()
	}

	// Count content: bundle + global + project
	gp := globalPath()
	projDir := filepath.Join(m.cwd, ".lore")
	m.ruleCount = countDir(filepath.Join(gp, "RULES")) +
		countDir(filepath.Join(projDir, "RULES"))
	m.skillCount = countDir(filepath.Join(gp, "SKILLS")) +
		countDir(filepath.Join(projDir, "SKILLS"))
	m.agentCount = countDir(filepath.Join(gp, "AGENTS")) +
		countDir(filepath.Join(projDir, "AGENTS"))

	// Add bundle agentic counts from all enabled bundles
	for _, pkgDir := range activeBundleDirs() {
		m.ruleCount += countDir(filepath.Join(pkgDir, "RULES"))
		m.skillCount += countDir(filepath.Join(pkgDir, "SKILLS"))
		m.agentCount += countDir(filepath.Join(pkgDir, "AGENTS"))
	}
}

func countDir(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			count++
		}
	}
	return count
}

// ── Projection Planner ──────────────────────────────────────────────

func (m *tuiModel) loadProjection() {
	gp := globalPath()

	// Ensure we read from the project dir, not process cwd
	origDir, _ := os.Getwd()
	os.Chdir(m.cwd)
	defer os.Chdir(origDir)

	// Build separate catalog slices: bundle items and global items.
	// Bundle items default to "defer", global items default to "off".
	m.projBundle = nil
	m.projGlobal = nil

	// Discover all installed bundles and split into enabled/available
	allBundles := discoverBundles()
	enabledSlugs := readBundleSlugs()
	enabledSet := make(map[string]bool)
	for _, s := range enabledSlugs {
		enabledSet[s] = true
	}

	// Preserve collapse state from previous load (default: collapsed)
	type bundleCollapseState struct {
		collapsed      bool
		kindCollapsed  [3]bool
		hooksCollapsed bool
		mcpCollapsed   bool
	}
	oldState := make(map[string]bundleCollapseState)
	for _, g := range m.enabledBundles {
		oldState[g.slug] = bundleCollapseState{
			collapsed:      g.collapsed,
			kindCollapsed:  g.kindCollapsed,
			hooksCollapsed: g.hooksCollapsed,
			mcpCollapsed:   g.mcpCollapsed,
		}
	}

	// Build enabled bundles in priority order
	m.enabledBundles = nil
	bundleBySlug := make(map[string]*BundleInfo)
	for i := range allBundles {
		bundleBySlug[allBundles[i].Slug] = &allBundles[i]
	}
	for _, slug := range enabledSlugs {
		p := bundleBySlug[slug]
		if p == nil {
			continue
		}
		dir := bundleDirForSlug(slug)
		if dir == "" {
			continue
		}
		state, seen := oldState[slug]
		group := bundleGroup{
			slug: slug,
			name: p.Name,
		}
		if seen {
			group.collapsed = state.collapsed
			group.kindCollapsed = state.kindCollapsed
			group.hooksCollapsed = state.hooksCollapsed
			group.mcpCollapsed = state.mcpCollapsed
		} else {
			group.collapsed = true
			group.kindCollapsed = [3]bool{true, true, true}
			group.hooksCollapsed = true
			group.mcpCollapsed = true
		}

		// Check LORE.md
		group.hasLoreMD = readLoreMD(filepath.Join(dir, "LORE.md")) != ""

		// Scan hook entries from manifest
		group.hookEntries = readBundleHookEntries(dir)

		// Scan MCP servers
		for _, s := range readMCPDir(filepath.Join(dir, "MCP")) {
			group.mcpServers = append(group.mcpServers, s.Name)
		}

		// Scan agentic content
		if rules, skills, agents, err := scanAgenticDir(dir); err == nil {
			for _, name := range sortedKeys(rules) {
				item := projItem{kind: "rule", name: name, desc: rules[name].Description, source: "bundle", bundleSlug: slug}
				group.items = append(group.items, item)
				m.projBundle = append(m.projBundle, item)
			}
			for _, name := range sortedKeys(skills) {
				item := projItem{kind: "skill", name: name, desc: skills[name].Description, source: "bundle", bundleSlug: slug}
				if skills[name].SourceDir != "" {
					item.numReferences, item.numAssets, item.numScripts = countSkillResources(skills[name].SourceDir)
				}
				group.items = append(group.items, item)
				m.projBundle = append(m.projBundle, item)
			}
			for _, name := range sortedKeys(agents) {
				item := projItem{kind: "agent", name: name, desc: agents[name].Description, skills: agents[name].Skills, source: "bundle", bundleSlug: slug}
				group.items = append(group.items, item)
				m.projBundle = append(m.projBundle, item)
			}
		}

		m.enabledBundles = append(m.enabledBundles, group)
	}

	// Available = installed but not enabled
	m.availableBundles = nil
	for _, p := range allBundles {
		if !enabledSet[p.Slug] {
			m.availableBundles = append(m.availableBundles, p)
		}
	}

	// Scan global content
	if rules, skills, agents, err := scanAgenticDir(gp); err == nil {
		for _, name := range sortedKeys(rules) {
			m.projGlobal = append(m.projGlobal, projItem{kind: "rule", name: name, desc: rules[name].Description, source: "global"})
		}
		for _, name := range sortedKeys(skills) {
			item := projItem{kind: "skill", name: name, desc: skills[name].Description, source: "global"}
			if skills[name].SourceDir != "" {
				item.numReferences, item.numAssets, item.numScripts = countSkillResources(skills[name].SourceDir)
			}
			m.projGlobal = append(m.projGlobal, item)
		}
		for _, name := range sortedKeys(agents) {
			m.projGlobal = append(m.projGlobal, projItem{kind: "agent", name: name, desc: agents[name].Description, skills: agents[name].Skills, source: "global"})
		}
	}

	// Unified catalog: bundle items first, then global (for toggleCatalogItem indexing)
	m.projCatalog = append(append([]projItem(nil), m.projBundle...), m.projGlobal...)

	// Scan project content
	m.projProject = nil
	if rules, skills, agents, err := scanAgenticDir(filepath.Join(m.cwd, ".lore")); err == nil {
		for _, name := range sortedKeys(rules) {
			m.projProject = append(m.projProject, projItem{kind: "rule", name: name, desc: rules[name].Description})
		}
		for _, name := range sortedKeys(skills) {
			item := projItem{kind: "skill", name: name, desc: skills[name].Description}
			if skills[name].SourceDir != "" {
				item.numReferences, item.numAssets, item.numScripts = countSkillResources(skills[name].SourceDir)
			}
			m.projProject = append(m.projProject, item)
		}
		for _, name := range sortedKeys(agents) {
			m.projProject = append(m.projProject, projItem{kind: "agent", name: name, desc: agents[name].Description, skills: agents[name].Skills})
		}
	}

	// Scan harness content (always projected, clobbers all)
	m.projHarness = nil
	harnessDir := filepath.Join(gp, ".harness")
	if rules, skills, agents, err := scanAgenticDir(harnessDir); err == nil {
		for _, name := range sortedKeys(rules) {
			m.projHarness = append(m.projHarness, projItem{kind: "rule", name: name, desc: rules[name].Description, source: "harness"})
		}
		for _, name := range sortedKeys(skills) {
			item := projItem{kind: "skill", name: name, desc: skills[name].Description, source: "harness"}
			if skills[name].SourceDir != "" {
				item.numReferences, item.numAssets, item.numScripts = countSkillResources(skills[name].SourceDir)
			}
			m.projHarness = append(m.projHarness, item)
		}
		for _, name := range sortedKeys(agents) {
			m.projHarness = append(m.projHarness, projItem{kind: "agent", name: name, desc: agents[name].Description, skills: agents[name].Skills, source: "harness"})
		}
	}

	// Check LORE.md existence (bundle LORE.md tracked per-group above)
	m.loreGlobal = readLoreMD(filepath.Join(gp, "LORE.md")) != ""
	m.loreProject = readLoreMD(filepath.Join(m.cwd, ".lore", "LORE.md")) != ""

	// Load inherit config
	m.projInherit = readInheritConfig(m.cwd)
	if m.projInherit == nil {
		m.projInherit = map[string]map[string]string{
			"rules": {}, "skills": {}, "agents": {},
		}
	}
	// Ensure all kind keys exist
	for _, k := range []string{"rules", "skills", "agents"} {
		if m.projInherit[k] == nil {
			m.projInherit[k] = map[string]string{}
		}
	}

	// Load MCP server names per layer (for pane display)
	m.mcpGlobal = nil
	for _, s := range readMCPDir(filepath.Join(gp, "MCP")) {
		m.mcpGlobal = append(m.mcpGlobal, s.Name)
	}
	m.mcpProject = nil
	for _, s := range readMCPDir(filepath.Join(m.cwd, ".lore", "MCP")) {
		m.mcpProject = append(m.mcpProject, s.Name)
	}

	// Check if any MCP servers are declared (bundle, global, or project)
	m.hasMCP = len(readBundleMCP()) > 0 || len(m.mcpGlobal) > 0 || len(m.mcpProject) > 0

	// Load hook event names per layer (for pane display)
	m.hooksGlobal = readHookEntriesFromDir(filepath.Join(gp, "HOOKS"))
	m.hooksProject = readHookEntriesFromDir(filepath.Join(m.cwd, ".lore", "HOOKS"))

	// Register bundle TUI pages
	tuiPages := readBundleTUIPages()
	m.bundlePages = nil
	for i, p := range tuiPages {
		m.bundlePages = append(m.bundlePages, bundlePage{
			name:       p.Name,
			script:     p.Script,
			bundleSlug: p.BundleSlug,
			tabID:      tabID(i + 2), // 0=tabProjection, 1=tabMarketplace
		})
	}
	if m.bundlePageData == nil {
		m.bundlePageData = make(map[tabID]*bundlePageOutput)
		m.bundlePageScroll = make(map[tabID]int)
		m.bundlePageCollapsed = make(map[tabID]map[int]bool)
		m.bundlePageLoading = make(map[tabID]bool)
	}

	m.projLoaded = true
	m.recomputeDiff()
}

// tuiGetPolicy is a convenience wrapper around the shared getPolicy function.
func (m *tuiModel) tuiGetPolicy(kind, name, defaultPolicy string) string {
	return getPolicy(m.projInherit, kind, name, defaultPolicy)
}

// setPolicy updates the inherit policy and writes inherit.json.
// Always writes explicitly — deletion would cause bundle items to
// revert to their "defer" default instead of staying "off".
func (m *tuiModel) setPolicy(kind, name, policy string) {
	if m.projInherit[kind] == nil {
		m.projInherit[kind] = map[string]string{}
	}
	m.projInherit[kind][name] = policy
	_ = writeInheritConfig(m.cwd, m.projInherit)
	m.recomputeDiff()
}

// recomputeDiff recalculates the full projection diff: new files, overwrites, and orphans.
// Called after every state change (policy toggle, platform toggle, bundle change).
// Caches merged names so buildOutputTree/computeGenDiff/computeOrphanFiles share one merge.
func (m *tuiModel) recomputeDiff() {
	m.mergedRules, m.mergedSkills, m.mergedAgents, m.skillSourceDirs = m.computeMergedNames()
	m.genNewFiles, m.genOverFiles = m.computeGenDiff()
	m.orphanFiles = m.computeOrphanFiles()
}

// cyclePolicy advances: off -> defer -> overwrite -> off.
func cyclePolicy(current string) string {
	switch current {
	case "off":
		return "defer"
	case "defer":
		return "overwrite"
	default:
		return "off"
	}
}

// policySymbol returns the display symbol for an inherit policy.
func policySymbol(policy string) string {
	switch policy {
	case "defer":
		return "◐"
	case "overwrite":
		return "●"
	default:
		return "○"
	}
}

// kindPlural maps kind to the inherit.json key.
func kindPlural(kind string) string {
	return kind + "s"
}

// toggleCatalogItem cycles the policy for a catalog item.
// For agents: referenced skills follow the agent's policy.
// Disabling an agent with active skills prompts for confirmation.
func (m *tuiModel) toggleCatalogItem(idx int) {
	item := m.projCatalog[idx]
	current := m.tuiGetPolicy(kindPlural(item.kind), item.name, defaultForSource(item.source))
	next := cyclePolicy(current)

	// Non-agent items: simple toggle (with skill-disable warning)
	if item.kind != "agent" || len(item.skills) == 0 {
		if item.kind == "skill" && next == "off" {
			refs := m.activeAgentsForSkill(item.name)
			if len(refs) > 0 {
				m.skillWarnActive = true
				m.skillWarnName = item.name
				m.skillWarnAgents = refs
				return
			}
		}
		m.setPolicy(kindPlural(item.kind), item.name, next)
		return
	}

	// Agent being enabled or changed (off->defer, defer->overwrite): set agent + sync skills
	if next != "off" {
		m.setPolicy("agents", item.name, next)
		for _, skillName := range item.skills {
			m.setPolicy("skills", skillName, next)
		}
		return
	}

	// Agent being disabled (overwrite->off): show skill picker
	m.agentDisableActive = true
	m.agentDisableName = item.name
	m.agentDisableSkills = item.skills
	m.agentDisableKeep = make(map[int]bool) // all unchecked = all will be disabled
	m.agentDisableCursor = 0
}

// applyAgentDisable disables the agent and sets skill policies based on the picker.
// Checked skills stay at their current policy; unchecked skills are set to "off".
func (m *tuiModel) applyAgentDisable() {
	m.setPolicy("agents", m.agentDisableName, "off")
	for i, skillName := range m.agentDisableSkills {
		if !m.agentDisableKeep[i] {
			m.setPolicy("skills", skillName, "off")
		}
	}
	m.agentDisableActive = false
}

// activeAgentsForSkill returns names of agents that reference the skill
// and are currently enabled (not "off").
func (m *tuiModel) activeAgentsForSkill(skillName string) []string {
	var agents []string
	for _, item := range m.projCatalog {
		if item.kind != "agent" {
			continue
		}
		policy := m.tuiGetPolicy("agents", item.name, defaultForSource(item.source))
		if policy == "off" {
			continue
		}
		for _, s := range item.skills {
			if s == skillName {
				agents = append(agents, item.name)
				break
			}
		}
	}
	return agents
}

// applySkillDisable disables the skill despite agent references.
func (m *tuiModel) applySkillDisable() {
	m.setPolicy("skills", m.skillWarnName, "off")
	m.skillWarnActive = false
}

// projCatalogCount returns the number of toggleable items in the catalog pane.
func (m *tuiModel) projCatalogCount() int {
	return len(m.projCatalog)
}

// buildPane2Items lists project-local items from .lore/ with conflict annotations.
// Only items physically on disk are shown. Inherited catalog items do NOT appear here —
// they only show up in the Projections pane via the merged names from mergeAgenticSets().
type pane2Item struct {
	kind  string
	name  string
	color string // "default", "yellow" (shadows deferred), "strike" (overwritten)
	// Skills only: resource counts
	numReferences int
	numAssets     int
	numScripts    int
}

func (m *tuiModel) buildPane2Items() []pane2Item {
	// Build catalog lookup for conflict detection
	type catalogEntry struct {
		source string
	}
	catalogByKind := map[string]map[string]catalogEntry{}
	for _, item := range m.projCatalog {
		if catalogByKind[item.kind] == nil {
			catalogByKind[item.kind] = map[string]catalogEntry{}
		}
		catalogByKind[item.kind][item.name] = catalogEntry{source: item.source}
	}

	var items []pane2Item
	for _, item := range m.projProject {
		color := "default"
		if catEntry, ok := catalogByKind[item.kind][item.name]; ok {
			policy := m.tuiGetPolicy(kindPlural(item.kind), item.name, defaultForSource(catEntry.source))
			switch policy {
			case "defer":
				color = "yellow" // project item shadows a deferred catalog item
			case "overwrite":
				color = "strike" // catalog item overrides this project item
			}
		}
		items = append(items, pane2Item{kind: item.kind, name: item.name, color: color, numReferences: item.numReferences, numAssets: item.numAssets, numScripts: item.numScripts})
	}
	return items
}

// computeMergedNames calls the canonical merge engine and extracts sorted name lists.
// Single source of truth — same merge logic used by `lore generate`.
func (m *tuiModel) computeMergedNames() (rules, skills, agents []string, skillSrcDirs map[string]string) {
	globalDir := globalPath()
	projectLoreDir := filepath.Join(m.cwd, ".lore")
	ms, err := mergeAgenticSets(globalDir, projectLoreDir)
	if err != nil {
		return nil, nil, nil, nil
	}
	srcDirs := map[string]string{}
	for name, skill := range ms.Skills {
		if skill.SourceDir != "" {
			srcDirs[name] = skill.SourceDir
		}
	}
	return sortedKeys(ms.Rules), sortedKeys(ms.Skills), sortedKeys(ms.Agents), srcDirs
}

// buildOutputTree builds a lipgloss tree showing all files that projection would create.
// Files are color-coded: green = new, yellow = overwrite, red = delete (clean mode).
func (m *tuiModel) buildOutputTree() string {
	rules, skills, agents := m.mergedRules, m.mergedSkills, m.mergedAgents

	// When hideHarness is active, exclude harness-sourced items from the tree.
	skillSrcDirs := m.skillSourceDirs
	if m.hideHarness {
		harnessNames := map[string]map[string]bool{"rule": {}, "skill": {}, "agent": {}}
		for _, item := range m.projHarness {
			harnessNames[item.kind][item.name] = true
		}
		rules = filterOut(rules, harnessNames["rule"])
		skills = filterOut(skills, harnessNames["skill"])
		agents = filterOut(agents, harnessNames["agent"])
		// Also filter skill resource dirs so harness skill resources are excluded
		filtered := make(map[string]string, len(skillSrcDirs))
		for k, v := range skillSrcDirs {
			if !harnessNames["skill"][k] {
				filtered[k] = v
			}
		}
		skillSrcDirs = filtered
	}

	// Collect all paths from all enabled platforms, deduplicated
	seen := map[string]bool{}
	var allPaths []string
	for _, p := range validPlatforms {
		if !m.platforms[p] {
			continue
		}
		for _, path := range platformOutputPaths(p, rules, skills, agents, m.hasMCP) {
			if !seen[path] {
				seen[path] = true
				allPaths = append(allPaths, path)
			}
		}
		// Include skill resource files (references/, scripts/, assets/)
		for _, path := range skillResourcePaths(p, skillSrcDirs) {
			if !seen[path] {
				seen[path] = true
				allPaths = append(allPaths, path)
			}
		}
	}

	// Collect orphan files to show as deletions
	orphanSet := map[string]bool{}
	if m.cleanMode {
		for _, f := range m.orphanFiles {
			orphanSet[f] = true
		}
	}

	if len(allPaths) == 0 && len(orphanSet) == 0 {
		return ""
	}

	// Check which files already exist on disk
	existsOnDisk := map[string]bool{}
	for _, path := range allPaths {
		clean := strings.TrimSuffix(path, "/")
		fullPath := filepath.Join(m.cwd, clean)
		if _, err := os.Stat(fullPath); err == nil {
			existsOnDisk[clean] = true
		}
	}

	// Build intermediate node structure
	type fsNode struct {
		children map[string]*fsNode
		isFile   bool
		isDelete bool   // orphan file to be deleted
		fullPath string // relative path for existence check
	}
	root := &fsNode{children: map[string]*fsNode{}}

	addPath := func(path string, isDelete bool) {
		isDir := strings.HasSuffix(path, "/")
		cleanPath := strings.TrimSuffix(path, "/")
		parts := strings.Split(cleanPath, "/")
		cur := root
		built := ""
		for i, part := range parts {
			if built == "" {
				built = part
			} else {
				built = built + "/" + part
			}
			if cur.children[part] == nil {
				cur.children[part] = &fsNode{children: map[string]*fsNode{}, fullPath: built}
			}
			if i == len(parts)-1 && !isDir {
				cur.children[part].isFile = true
				if isDelete {
					cur.children[part].isDelete = true
				}
			}
			cur = cur.children[part]
		}
	}

	for _, path := range allPaths {
		addPath(path, false)
	}
	for _, path := range m.orphanFiles {
		if orphanSet[path] {
			addPath(path, true)
		}
	}

	// Convert to lipgloss tree recursively
	newStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("2"))        // green = new
	overwriteStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("3"))  // yellow = overwrite
	deleteStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("1"))     // red = delete

	// fileStatus returns "delete", "overwrite", or "new" for a leaf node
	fileStatus := func(n *fsNode) string {
		if n.isDelete {
			return "delete"
		}
		if existsOnDisk[n.fullPath] {
			return "overwrite"
		}
		return "new"
	}

	// dirStatus returns the uniform status of all leaves under a dir,
	// or "mixed" if they differ
	var dirStatus func(n *fsNode) string
	dirStatus = func(n *fsNode) string {
		if len(n.children) == 0 {
			// Leaf directory (e.g. skills/review/) — check disk
			if n.isDelete {
				return "delete"
			}
			dirFull := filepath.Join(m.cwd, n.fullPath)
			if _, err := os.Stat(dirFull); err == nil {
				return "overwrite"
			}
			return "new"
		}
		status := ""
		for _, child := range n.children {
			var s string
			if child.isFile && len(child.children) == 0 {
				s = fileStatus(child)
			} else {
				s = dirStatus(child)
			}
			if s == "mixed" {
				return "mixed"
			}
			if status == "" {
				status = s
			} else if status != s {
				return "mixed"
			}
		}
		if status == "" {
			return "mixed"
		}
		return status
	}

	styleFor := func(status string) *lipgloss.Style {
		switch status {
		case "delete":
			return &deleteStyle
		case "new":
			return &newStyle
		case "overwrite":
			return &overwriteStyle
		}
		return nil
	}

	var convert func(n *fsNode) []any
	convert = func(n *fsNode) []any {
		var dirs, files []string
		for name, child := range n.children {
			if child.isFile && len(child.children) == 0 {
				files = append(files, name)
			} else {
				dirs = append(dirs, name)
			}
		}
		// Sort each group
		for i := 1; i < len(dirs); i++ {
			for j := i; j > 0 && dirs[j] < dirs[j-1]; j-- {
				dirs[j], dirs[j-1] = dirs[j-1], dirs[j]
			}
		}
		for i := 1; i < len(files); i++ {
			for j := i; j > 0 && files[j] < files[j-1]; j-- {
				files[j], files[j-1] = files[j-1], files[j]
			}
		}

		var items []any
		for _, name := range dirs {
			child := n.children[name]
			dirLabel := name + "/"
			if s := styleFor(dirStatus(child)); s != nil {
				dirLabel = s.Render(dirLabel)
			}
			subtree := tree.Root(dirLabel)
			subtree.Child(convert(child)...)
			items = append(items, subtree)
		}
		for _, name := range files {
			child := n.children[name]
			if s := styleFor(fileStatus(child)); s != nil {
				items = append(items, s.Render(name))
			} else {
				items = append(items, name)
			}
		}
		return items
	}

	t := tree.New().
		Enumerator(tree.RoundedEnumerator).
		EnumeratorStyle(dimStyle).
		Child(convert(root)...)

	return t.String()
}

// platformOutputPaths delegates to the projector's OutputPaths method.
func platformOutputPaths(platform string, rules, skills, agents []string, hasMCP bool) []string {
	projector, ok := projectorRegistry[platform]
	if !ok {
		return nil
	}
	return projector.OutputPaths(rules, skills, agents, hasMCP)
}

// skillResourcePaths returns the output paths for skill resource files
// (references/, scripts/, assets/) by walking source directories.
// These are projected by copySkillResources during generation.
func skillResourcePaths(platform string, skillSrcDirs map[string]string) []string {
	projector, ok := projectorRegistry[platform]
	if !ok || len(skillSrcDirs) == 0 {
		return nil
	}
	// Get the skill output base dirs from the projector.
	// Use a single dummy skill to discover the platform's skill path pattern.
	probe := projector.OutputPaths(nil, []string{"__probe__"}, nil, false)
	var prefixPattern string
	for _, p := range probe {
		if strings.Contains(p, "__probe__") && strings.HasSuffix(p, "/") {
			prefixPattern = p
			break
		}
	}
	if prefixPattern == "" {
		return nil
	}

	var paths []string
	for name, srcDir := range skillSrcDirs {
		outDir := strings.Replace(prefixPattern, "__probe__", name, 1)
		filepath.WalkDir(srcDir, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(srcDir, p)
			if rel == "." || rel == "SKILL.md" {
				return nil
			}
			paths = append(paths, outDir+filepath.ToSlash(rel))
			return nil
		})
	}
	return paths
}

// ── Commands ────────────────────────────────────────────────────────

func doInit(cwd string, platforms []string, createNew bool, projectName string) tea.Cmd {
	return func() tea.Msg {
		targetDir := cwd
		newDir := ""

		if createNew {
			targetDir = filepath.Join(cwd, projectName)
			newDir = targetDir
			os.MkdirAll(targetDir, 0755)
		}

		// Create .lore/ structure
		dirs := []string{
			filepath.Join(targetDir, ".lore", "SKILLS"),
			filepath.Join(targetDir, ".lore", "AGENTS"),
			filepath.Join(targetDir, ".lore", "RULES"),
		}
		for _, dir := range dirs {
			os.MkdirAll(dir, 0755)
		}

		// Back up existing platform files (init-here only)
		var backedUp []string
		if !createNew {
			backedUp = backupPlatformFiles(targetDir, platforms)
		}

		// Write config
		writeConfig(targetDir, filepath.Base(targetDir), platforms)
		createLocalFiles(targetDir)
		writeInheritConfig(targetDir, map[string]map[string]string{
			"rules": {}, "skills": {}, "agents": {},
		})
		ensureGitignore(targetDir)

		// Run projection in the target directory (best-effort during init)
		doProjection(targetDir, platforms)

		return initDoneMsg{newDir: newDir, backedUp: backedUp}
	}
}

func doGenerate(cwd string, platforms []string, orphansToClean []string) tea.Cmd {
	return func() tea.Msg {
		origDir, _ := os.Getwd()
		os.Chdir(cwd)
		defer os.Chdir(origDir)

		// Clean orphan files first (if clean mode)
		cleaned := 0
		for _, f := range orphansToClean {
			fullPath := filepath.Join(cwd, f)
			if err := os.Remove(fullPath); err == nil {
				cleaned++
			}
		}
		// Clean up empty directories bottom-up: collect all parent dirs,
		// sort deepest first, remove if empty
		dirSet := map[string]bool{}
		for _, f := range orphansToClean {
			dir := filepath.Dir(f)
			for dir != "." && dir != "/" {
				dirSet[dir] = true
				dir = filepath.Dir(dir)
			}
		}
		dirList := make([]string, 0, len(dirSet))
		for d := range dirSet {
			dirList = append(dirList, d)
		}
		sort.Sort(sort.Reverse(sort.StringSlice(dirList))) // deepest first
		for _, d := range dirList {
			fullDir := filepath.Join(cwd, d)
			entries, err := os.ReadDir(fullDir)
			if err == nil && len(entries) == 0 {
				os.Remove(fullDir)
			}
		}

		_, err := doProjection(cwd, platforms)
		if err != nil {
			return genDoneMsg{err: err}
		}

		// Count output files
		gp := globalPath()
		projDir := filepath.Join(cwd, ".lore")
		ms, mergeErr := mergeAgenticSets(gp, projDir)
		if mergeErr != nil {
			return genDoneMsg{err: mergeErr}
		}

		rules := make([]string, 0, len(ms.Rules))
		for k := range ms.Rules {
			rules = append(rules, k)
		}
		skills := make([]string, 0, len(ms.Skills))
		for k := range ms.Skills {
			skills = append(skills, k)
		}
		agents := make([]string, 0, len(ms.Agents))
		for k := range ms.Agents {
			agents = append(agents, k)
		}

		count := 0
		seen := map[string]bool{}
		hasMCP := len(ms.MCP) > 0
		for _, p := range platforms {
			for _, path := range platformOutputPaths(p, rules, skills, agents, hasMCP) {
				if !seen[path] {
					seen[path] = true
					count++
				}
			}
		}
		return genDoneMsg{fileCount: count, cleanedCount: cleaned}
	}
}

func invokeBundlePage(page bundlePage, project, cwd string, width, height int) tea.Cmd {
	return func() tea.Msg {
		input := map[string]interface{}{
			"project": project,
			"cwd":     cwd,
			"width":   width,
			"height":  height,
		}
		inputJSON, _ := json.Marshal(input)

		cmd := exec.Command("node", page.script)
		cmd.Dir = cwd
		cmd.Stdin = bytes.NewReader(inputJSON)

		stdout, err := cmd.Output()
		if err != nil {
			return bundlePageLoadedMsg{tabID: page.tabID, err: err}
		}

		var output bundlePageOutput
		if err := json.Unmarshal(stdout, &output); err != nil {
			return bundlePageLoadedMsg{tabID: page.tabID, err: err}
		}
		return bundlePageLoadedMsg{tabID: page.tabID, output: &output}
	}
}

// ── Marketplace Commands ────────────────────────────────────────────

func loadMarketplace() tea.Cmd {
	return func() tea.Msg {
		bundles := discoverBundles()
		registry := fetchRegistry(false)

		installed := make(map[string]bool)
		var mktInstalled []marketplaceItem
		for _, b := range bundles {
			item := marketplaceItem{
				slug:      b.Slug,
				name:      b.Name,
				version:   b.Version,
				installed: true,
			}
			// Enrich from registry if available
			if registry != nil {
				for _, e := range registry.Bundles {
					if e.Slug == b.Slug {
						item.description = e.Description
						item.author = e.Author
						item.repo = e.Repo
						item.path = e.Path
						item.tags = e.Tags
						break
					}
				}
			}
			mktInstalled = append(mktInstalled, item)
			installed[b.Slug] = true
		}

		var mktAvailable []marketplaceItem
		if registry != nil {
			for _, e := range registry.Bundles {
				if !installed[e.Slug] {
					mktAvailable = append(mktAvailable, marketplaceItem{
						slug:        e.Slug,
						name:        e.Name,
						description: e.Description,
						author:      e.Author,
						repo:        e.Repo,
						path:        e.Path,
						tags:        e.Tags,
					})
				}
			}
		}

		return mktLoadedMsg{installed: mktInstalled, available: mktAvailable}
	}
}

func doMktInstall(slug, repo, path string) tea.Cmd {
	return func() tea.Msg {
		err := installBundleFromRepo(slug, repo, path)
		return mktOpDoneMsg{verb: "install", slug: slug, err: err}
	}
}

func doMktUpdate(slug string) tea.Cmd {
	return func() tea.Msg {
		err := updateBundleInPlace(slug)
		return mktOpDoneMsg{verb: "update", slug: slug, err: err}
	}
}

func doMktRemove(slug string) tea.Cmd {
	return func() tea.Msg {
		err := removeBundleFromDisk(slug)
		return mktOpDoneMsg{verb: "remove", slug: slug, err: err}
	}
}

// ── Init ────────────────────────────────────────────────────────────

func (m *tuiModel) Init() tea.Cmd {
	return nil
}

// ── Update ──────────────────────────────────────────────────────────

func (m *tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	case initDoneMsg:
		m.isLoreProject = true
		if msg.newDir != "" {
			m.cwd = msg.newDir
		}
		m.wizBackedUp = msg.backedUp
		m.successPath = m.cwd
		m.mode = modeSuccess

	case genDoneMsg:
		if msg.err != nil {
			m.genMessage = "Error: " + msg.err.Error()
			m.genIsError = true
			m.genTick = 5
		} else {
			summary := fmt.Sprintf("Generated %d files", msg.fileCount)
			if msg.cleanedCount > 0 {
				summary += fmt.Sprintf(", removed %d", msg.cleanedCount)
			}
			m.genMessage = summary
			m.genIsError = false
			m.genTick = 3
			m.loadProjectInfo()
			m.projLoaded = false
			m.loadProjection()
		}
		return m, tea.Tick(time.Second, func(time.Time) tea.Msg { return tickMsg{} })

	case bundlePageLoadedMsg:
		m.bundlePageLoading[msg.tabID] = false
		if msg.err != nil {
			m.bundlePageData[msg.tabID] = &bundlePageOutput{
				Status: "Error: " + msg.err.Error(),
			}
		} else {
			m.bundlePageData[msg.tabID] = msg.output
			// Initialize section collapse state from script defaults
			collapsed := make(map[int]bool)
			for i, s := range msg.output.Sections {
				collapsed[i] = s.Collapsed
			}
			m.bundlePageCollapsed[msg.tabID] = collapsed
		}

	case mktLoadedMsg:
		m.mktLoading = false
		if msg.err != nil {
			m.genMessage = "Marketplace: " + msg.err.Error()
			m.genIsError = true
			m.genTick = 5
		} else {
			m.mktInstalled = msg.installed
			m.mktAvailable = msg.available
			m.mktLoaded = true
		}

	case mktOpDoneMsg:
		m.mktOpActive = false
		m.mktOpSlug = ""
		m.mktOpVerb = ""
		if msg.err != nil {
			m.genMessage = fmt.Sprintf("Failed to %s %s: %s", msg.verb, msg.slug, msg.err)
			m.genIsError = true
			m.genTick = 5
		} else {
			verbed := capitalize(msg.verb) + "ed"
			if strings.HasSuffix(msg.verb, "e") {
				verbed = capitalize(msg.verb) + "d"
			}
			m.genMessage = fmt.Sprintf("%s %s", verbed, msg.slug)
			m.genIsError = false
			m.genTick = 3
			m.mktLoaded = false  // force reload
			m.projLoaded = false // refresh projection tab
		}
		return m, tea.Batch(
			loadMarketplace(),
			tea.Tick(time.Second, func(time.Time) tea.Msg { return tickMsg{} }),
		)

	case tickMsg:
		if m.genTick > 0 {
			m.genTick--
			if m.genTick == 0 {
				m.genMessage = ""
				m.genIsError = false
			} else {
				return m, tea.Tick(time.Second, func(time.Time) tea.Msg { return tickMsg{} })
			}
		}

	case tea.MouseMsg:
		return m.handleMouse(msg)

	case tea.KeyMsg:
		return m.handleKey(msg)
	}

	return m, nil
}

// clampScroll ensures scroll offset is within valid range.
func (m *tuiModel) clampScroll(pane int, totalLines int, visibleH int) {
	maxScroll := totalLines - visibleH
	if maxScroll < 0 {
		maxScroll = 0
	}
	if m.projScroll[pane] > maxScroll {
		m.projScroll[pane] = maxScroll
	}
	if m.projScroll[pane] < 0 {
		m.projScroll[pane] = 0
	}
}

func (m *tuiModel) handleKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Global keys
	switch key {
	case "ctrl+c":
		return m, tea.Quit
	case "q":
		if m.mode == modeDashboard {
			return m, tea.Quit
		}
	}

	switch m.mode {
	case modeWelcome:
		return m.handleWelcomeKey(msg)
	case modeDashboard:
		return m.handleDashboardKey(msg)
	case modeSuccess:
		m.mode = modeDashboard
		m.loadProjectInfo()
		return m, nil
	}

	return m, nil
}

// goToWizStep transitions to a wizard step with consistent default focus.
// stepChoice: cursor on "Create new project" (0)
// stepName: focus on text input (-1)
// stepPlatforms: focus on platform list (-1), cursor 0
// stepConfirm: focus on Confirm button (1)
func (m *tuiModel) goToWizStep(step wizardStep) {
	m.wizStep = step
	switch step {
	case stepChoice:
		m.wizCursor = 0
		m.wizBtnFocus = -1
	case stepName:
		m.wizBtnFocus = -1
	case stepPlatforms:
		m.wizCursor = 0
		m.wizBtnFocus = -1
	case stepConfirm:
		m.wizCursor = 0
		m.wizBtnFocus = 1
	}
}

func (m *tuiModel) handleWelcomeKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	switch m.wizStep {
	case stepChoice:
		choiceCount := 2
		if !m.canInitHere {
			choiceCount = 1
		}
		switch key {
		case "left", "right", "tab", "shift+tab", "up", "down":
			if choiceCount > 1 {
				m.wizCursor = (m.wizCursor + 1) % choiceCount
			}
		case "enter", " ":
			if !m.canInitHere || m.wizCursor == 0 {
				// Create new project
				m.wizChoice = 1
				m.goToWizStep(stepName)
				m.wizNameBuf = ""
				m.wizNameErr = ""
			} else {
				// Initialize current directory
				m.wizChoice = 0
				m.goToWizStep(stepPlatforms)
			}
		}
		return m, nil

	case stepName:
		switch key {
		case "tab", "down":
			// Cycle: input -> Back -> Continue -> input
			m.wizBtnFocus = (m.wizBtnFocus + 2) % 3 - 1 // -1, 0, 1
		case "shift+tab", "up":
			m.wizBtnFocus = (m.wizBtnFocus + 3) % 3 - 1
		case "left":
			if m.wizBtnFocus > 0 {
				m.wizBtnFocus--
			}
		case "right":
			if m.wizBtnFocus >= 0 && m.wizBtnFocus < 1 {
				m.wizBtnFocus++
			}
		case "enter":
			if m.wizBtnFocus == 0 {
				m.goToWizStep(stepChoice)
			} else {
				// Continue (from input or Continue button)
				name := strings.TrimSpace(m.wizNameBuf)
				if name == "" {
					m.wizNameErr = "Name cannot be empty."
				} else if !namePattern.MatchString(name) {
					m.wizNameErr = "Invalid characters. Use letters, numbers, dots, hyphens, underscores."
				} else if _, err := os.Stat(filepath.Join(m.cwd, name)); err == nil {
					m.wizNameErr = fmt.Sprintf("%s already exists.", name)
				} else {
					m.wizNameBuf = name
					m.wizNameErr = ""
					m.goToWizStep(stepPlatforms)
				}
			}
		case "esc":
			if m.wizBtnFocus >= 0 {
				m.wizBtnFocus = -1
			} else {
				m.goToWizStep(stepChoice)
			}
		case "backspace":
			if m.wizBtnFocus == -1 && len(m.wizNameBuf) > 0 {
				m.wizNameBuf = m.wizNameBuf[:len(m.wizNameBuf)-1]
				m.wizNameErr = ""
			}
		default:
			if m.wizBtnFocus == -1 && len(key) == 1 && key[0] >= 32 && key[0] < 127 {
				m.wizNameBuf += key
				m.wizNameErr = ""
			}
		}
		return m, nil

	case stepPlatforms:
		platCount := len(validPlatforms)
		switch key {
		case "tab":
			if m.wizBtnFocus == -1 {
				// From list -> Back
				m.wizBtnFocus = 0
			} else if m.wizBtnFocus == 0 {
				// Back -> Continue
				m.wizBtnFocus = 1
			} else {
				// Continue -> list
				m.wizBtnFocus = -1
			}
		case "shift+tab":
			if m.wizBtnFocus == -1 {
				m.wizBtnFocus = 1
			} else if m.wizBtnFocus == 1 {
				m.wizBtnFocus = 0
			} else {
				m.wizBtnFocus = -1
			}
		case "up":
			if m.wizBtnFocus == -1 && m.wizCursor > 0 {
				m.wizCursor--
			}
		case "down":
			if m.wizBtnFocus == -1 && m.wizCursor < platCount-1 {
				m.wizCursor++
			}
		case "left":
			if m.wizBtnFocus > 0 {
				m.wizBtnFocus--
			}
		case "right":
			if m.wizBtnFocus >= 0 && m.wizBtnFocus < 1 {
				m.wizBtnFocus++
			}
		case " ":
			if m.wizBtnFocus == -1 {
				m.wizPlatforms[m.wizCursor] = !m.wizPlatforms[m.wizCursor]
			}
		case "enter":
			if m.wizBtnFocus == 0 {
				// Back
				if m.wizChoice == 1 {
					m.goToWizStep(stepName)
				} else {
					m.goToWizStep(stepChoice)
				}
			} else if m.wizBtnFocus == 1 {
				// Continue
				if m.selectedPlatformCount() > 0 {
					m.goToWizStep(stepConfirm)
				}
			} else {
				// On list -- toggle
				m.wizPlatforms[m.wizCursor] = !m.wizPlatforms[m.wizCursor]
			}
		case "esc":
			if m.wizBtnFocus >= 0 {
				m.wizBtnFocus = -1
			} else if m.wizChoice == 1 {
				m.goToWizStep(stepName)
			} else {
				m.goToWizStep(stepChoice)
			}
		}
		return m, nil

	case stepConfirm:
		switch key {
		case "tab", "right", "down":
			m.wizBtnFocus = (m.wizBtnFocus + 2) % 3 - 1
		case "shift+tab", "left", "up":
			m.wizBtnFocus = (m.wizBtnFocus + 3) % 3 - 1
		case "enter":
			if m.wizBtnFocus == 0 {
				m.goToWizStep(stepPlatforms)
			} else {
				// Confirm (default or focused)
				createNew := m.wizChoice == 1
				return m, doInit(m.cwd, m.selectedPlatformList(), createNew, m.wizNameBuf)
			}
		case "esc":
			m.goToWizStep(stepPlatforms)
		}
		return m, nil
	}

	return m, nil
}

func (m *tuiModel) handleDashboardKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Number keys switch tabs: 1=Projections, 2=Marketplace, 3+=bundle pages
	if len(key) == 1 && key[0] >= '1' && key[0] <= '9' {
		idx := int(key[0] - '1') // 0-indexed
		if idx == 0 {
			m.tab = tabProjection
			return m, nil
		}
		if idx == 1 {
			m.tab = tabMarketplace
			if !m.mktLoaded && !m.mktLoading {
				m.mktLoading = true
				return m, loadMarketplace()
			}
			return m, nil
		}
		pageIdx := idx - 2
		if pageIdx < len(m.bundlePages) {
			page := m.bundlePages[pageIdx]
			m.tab = page.tabID
			// Load page data on first view
			if m.bundlePageData[page.tabID] == nil && !m.bundlePageLoading[page.tabID] {
				m.bundlePageLoading[page.tabID] = true
				return m, invokeBundlePage(page, projectSlug(), m.cwd, m.width, m.height)
			}
			return m, nil
		}
	}

	switch m.tab {
	case tabProjection:
		return m.handleProjectionKey(msg)
	case tabMarketplace:
		return m.handleMarketplaceKey(msg)
	default:
		return m.handleBundlePageKey(msg)
	}
}

func (m *tuiModel) handleProjectionKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Generate confirmation dialog intercepts all keys
	if m.genConfirm {
		switch key {
		case "esc":
			m.genConfirm = false
		case "enter":
			m.genConfirm = false
			m.genMessage = "Generating..."
			var orphans []string
			if m.cleanMode {
				orphans = m.orphanFiles
			}
			return m, doGenerate(m.cwd, m.enabledPlatformList(), orphans)
		case "j", "down":
			m.genConfScroll++
		case "k", "up":
			m.genConfScroll--
			if m.genConfScroll < 0 {
				m.genConfScroll = 0
			}
		}
		return m, nil
	}

	// Bundle confirm dialog intercepts all keys
	if m.bundleConfirm {
		switch key {
		case "esc":
			m.bundleConfirm = false
		case "enter":
			m.bundleConfirm = false
			var err error
			if m.bundleConfirmEnable {
				err = enableBundle(m.cwd, m.bundleConfirmSlug)
			} else {
				err = disableBundle(m.cwd, m.bundleConfirmSlug)
			}
			if err != nil {
				m.genMessage = "Bundle error: " + err.Error()
				m.genIsError = true
				m.genTick = 5
			} else {
				m.loadProjection()
			}
		}
		return m, nil
	}

	// Agent-disable skill picker intercepts all keys
	if m.agentDisableActive {
		switch key {
		case "esc":
			m.agentDisableActive = false
		case "up", "k":
			if m.agentDisableCursor > 0 {
				m.agentDisableCursor--
			}
		case "down", "j":
			if m.agentDisableCursor < len(m.agentDisableSkills)-1 {
				m.agentDisableCursor++
			}
		case " ", "x":
			m.agentDisableKeep[m.agentDisableCursor] = !m.agentDisableKeep[m.agentDisableCursor]
		case "enter":
			m.applyAgentDisable()
		}
		return m, nil
	}

	// Skill-disable warning intercepts all keys
	if m.skillWarnActive {
		switch key {
		case "esc":
			m.skillWarnActive = false
		case "enter":
			m.applySkillDisable()
		}
		return m, nil
	}

	// Dismiss hints on any key
	if m.hintPane >= 0 {
		m.hintPane = -1
		return m, nil
	}
	if m.loreHint {
		m.loreHint = false
		return m, nil
	}

	switch key {
	case "tab":
		m.projPane = (m.projPane + 1) % 3
		return m, nil
	case "shift+tab":
		m.projPane = (m.projPane + 2) % 3
		return m, nil
	case "r":
		m.projLoaded = false
		m.loadProjection()
		m.loadProjectInfo()
		return m, nil
	case "g":
		m.genConfirm = true
		m.genConfScroll = 0
		return m, nil
	}

	// Scroll with j/k for all panes
	switch key {
	case "j", "down":
		if m.projPane == 0 {
			m.catalogScroll[m.catalogSub]++
		} else {
			m.projScroll[m.projPane]++
		}
		return m, nil
	case "k", "up":
		if m.projPane == 0 {
			m.catalogScroll[m.catalogSub]--
		} else {
			m.projScroll[m.projPane]--
		}
		return m, nil
	}

	// Action keys only apply to catalog pane (pane 0) with a selected item
	if m.projPane == 0 && m.projCursor[0] < len(m.projCatalog) {
		switch key {
		case " ", "enter":
			m.toggleCatalogItem(m.projCursor[0])
		case "d":
			item := m.projCatalog[m.projCursor[0]]
			m.setPolicy(kindPlural(item.kind), item.name, "defer")
		case "o":
			item := m.projCatalog[m.projCursor[0]]
			m.setPolicy(kindPlural(item.kind), item.name, "overwrite")
		case "x":
			item := m.projCatalog[m.projCursor[0]]
			m.setPolicy(kindPlural(item.kind), item.name, "off")
		}
	}

	return m, nil
}

func (m *tuiModel) handleBundlePageKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	switch key {
	case "r":
		// Reload current bundle page
		for _, page := range m.bundlePages {
			if page.tabID == m.tab {
				m.bundlePageLoading[m.tab] = true
				m.bundlePageData[m.tab] = nil
				return m, invokeBundlePage(page, projectSlug(), m.cwd, m.width, m.height)
			}
		}
	case "j", "down":
		m.bundlePageScroll[m.tab]++
	case "k", "up":
		scroll := m.bundlePageScroll[m.tab]
		if scroll > 0 {
			m.bundlePageScroll[m.tab] = scroll - 1
		}
	case "enter", " ":
		// Toggle section collapse at current position
		m.toggleBundlePageSection()
	}

	return m, nil
}

func (m *tuiModel) toggleBundlePageSection() {
	output := m.bundlePageData[m.tab]
	if output == nil {
		return
	}
	collapsed := m.bundlePageCollapsed[m.tab]
	if collapsed == nil {
		return
	}

	// Find section under cursor by counting visible lines
	scroll := m.bundlePageScroll[m.tab]
	lineIdx := 0
	for i, section := range output.Sections {
		if lineIdx-scroll == 0 || lineIdx == scroll {
			// This is approximate — toggle the first visible section header
			if lineIdx >= scroll {
				collapsed[i] = !collapsed[i]
				return
			}
		}
		lineIdx++ // section header
		if !collapsed[i] {
			lineIdx += len(section.Items)
		}
	}
}

func (m *tuiModel) enabledPlatformList() []string {
	var result []string
	for _, p := range validPlatforms {
		if m.platforms[p] {
			result = append(result, p)
		}
	}
	return result
}

func (m *tuiModel) handleMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Mouse wheel scrolling
	if msg.Button == tea.MouseButtonWheelUp || msg.Button == tea.MouseButtonWheelDown {
		delta := 1
		if msg.Button == tea.MouseButtonWheelUp {
			delta = -1
		}

		// Dialog scrolling takes priority
		if m.genConfirm {
			m.genConfScroll += delta
			if m.genConfScroll < 0 {
				m.genConfScroll = 0
			}
			return m, nil
		}
		// Column scrolling
		if m.mode == modeDashboard && m.projLoaded {
			if m.tab == tabMarketplace {
				m.mktScroll += delta
				if m.mktScroll < 0 {
					m.mktScroll = 0
				}
				return m, nil
			}
			if m.tab != tabProjection {
				// Bundle page scroll
				m.bundlePageScroll[m.tab] += delta
				return m, nil
			}
			colW := m.width / 3
			pane := msg.X / colW
			if pane > 2 {
				pane = 2
			}
			if pane == 0 {
				// Pane 0 has two stacked sub-boxes; scroll based on mouse Y position.
				colContentY := msg.Y - m.colStartY
				sub := 0
				if m.catalogGlobalH > 0 && colContentY >= m.catalogGlobalH {
					sub = 1
				}
				m.catalogScroll[sub] += delta
			} else {
				m.projScroll[pane] += delta
			}
			return m, nil
		}
	}

	if msg.Button != tea.MouseButtonLeft || msg.Action != tea.MouseActionPress {
		return m, nil
	}

	// Success screen -- any click advances to dashboard
	if m.mode == modeSuccess {
		m.mode = modeDashboard
		m.loadProjectInfo()
		return m, nil
	}

	// Agent-disable skill picker intercepts all clicks
	if m.agentDisableActive {
		for i := range m.agentDisableSkills {
			if zone.Get(fmt.Sprintf("adskill-%d", i)).InBounds(msg) {
				m.agentDisableKeep[i] = !m.agentDisableKeep[i]
				return m, nil
			}
		}
		if zone.Get("ad-confirm").InBounds(msg) {
			m.applyAgentDisable()
			return m, nil
		}
		if zone.Get("ad-cancel").InBounds(msg) {
			m.agentDisableActive = false
			return m, nil
		}
		return m, nil
	}

	// Skill-disable warning clicks
	if m.skillWarnActive {
		if zone.Get("sw-confirm").InBounds(msg) {
			m.applySkillDisable()
			return m, nil
		}
		if zone.Get("sw-cancel").InBounds(msg) {
			m.skillWarnActive = false
			return m, nil
		}
		return m, nil
	}

	// Bundle confirm dialog clicks
	if m.bundleConfirm {
		if zone.Get("bundle-confirm").InBounds(msg) {
			m.bundleConfirm = false
			var err error
			if m.bundleConfirmEnable {
				err = enableBundle(m.cwd, m.bundleConfirmSlug)
			} else {
				err = disableBundle(m.cwd, m.bundleConfirmSlug)
			}
			if err != nil {
				m.genMessage = "Bundle error: " + err.Error()
				m.genIsError = true
				m.genTick = 5
			} else {
				m.loadProjection()
			}
			return m, nil
		}
		if zone.Get("bundle-cancel").InBounds(msg) {
			m.bundleConfirm = false
			return m, nil
		}
		return m, nil
	}

	// Marketplace confirm dialog clicks
	if m.mktConfirm {
		if zone.Get("mkt-confirm").InBounds(msg) {
			m.mktConfirm = false
			m.mktOpActive = true
			m.mktOpSlug = m.mktConfirmSlug
			m.mktOpVerb = m.mktConfirmVerb
			if m.mktConfirmVerb == "remove" {
				return m, doMktRemove(m.mktConfirmSlug)
			}
			return m, doMktInstall(m.mktConfirmSlug, m.mktConfirmRepo, m.mktConfirmPath)
		}
		if zone.Get("mkt-cancel").InBounds(msg) {
			m.mktConfirm = false
			return m, nil
		}
		return m, nil
	}

	// Tab clicks
	if m.mode == modeDashboard {
		if zone.Get("tab-projection").InBounds(msg) {
			m.tab = tabProjection
			return m, nil
		}
		if zone.Get("tab-marketplace").InBounds(msg) {
			m.tab = tabMarketplace
			if !m.mktLoaded && !m.mktLoading {
				m.mktLoading = true
				return m, loadMarketplace()
			}
			return m, nil
		}
		for _, page := range m.bundlePages {
			zoneID := fmt.Sprintf("tab-bundle-%d", page.tabID)
			if zone.Get(zoneID).InBounds(msg) {
				m.tab = page.tabID
				// Load on first click
				if m.bundlePageData[page.tabID] == nil && !m.bundlePageLoading[page.tabID] {
					m.bundlePageLoading[page.tabID] = true
					return m, invokeBundlePage(page, projectSlug(), m.cwd, m.width, m.height)
				}
				return m, nil
			}
		}

		// Marketplace item clicks
		if m.tab == tabMarketplace {
			return m.handleMarketplaceMouse(msg)
		}

		// Section collapse clicks on bundle pages
		if m.tab != tabProjection && m.tab != tabMarketplace {
			output := m.bundlePageData[m.tab]
			if output != nil {
				for i := range output.Sections {
					if zone.Get(fmt.Sprintf("bp-section-%d-%d", m.tab, i)).InBounds(msg) {
						collapsed := m.bundlePageCollapsed[m.tab]
						if collapsed != nil {
							collapsed[i] = !collapsed[i]
						}
						return m, nil
					}
				}
			}
		}
	}

	// Projection planner clicks
	if m.mode == modeDashboard && m.projLoaded {
		// Platform toggles
		for i, p := range validPlatforms {
			if zone.Get(fmt.Sprintf("plat-%d", i)).InBounds(msg) {
				m.platforms[p] = !m.platforms[p]
				_ = writeProjectConfig(m.cwd, m.platforms)
				m.recomputeDiff()
				return m, nil
			}
		}

		// Generate button — show confirmation
		if zone.Get("gen-btn").InBounds(msg) {
			m.genConfirm = true
			m.genConfScroll = 0
			return m, nil
		}

		// Clean mode toggle
		if zone.Get("clean-toggle").InBounds(msg) {
			m.cleanMode = !m.cleanMode
			return m, nil
		}

		// Harness visibility toggle
		if zone.Get("harness-toggle").InBounds(msg) {
			m.hideHarness = !m.hideHarness
			return m, nil
		}

		// Confirmation dialog buttons
		if m.genConfirm {
			if zone.Get("gen-confirm").InBounds(msg) {
				m.genConfirm = false
				m.genMessage = "Generating..."
				var orphans []string
				if m.cleanMode {
					orphans = m.orphanFiles
				}
				return m, doGenerate(m.cwd, m.enabledPlatformList(), orphans)
			}
			if zone.Get("gen-cancel").InBounds(msg) {
				m.genConfirm = false
				return m, nil
			}
			return m, nil
		}

		// Hint dialog — close button or any click dismisses
		if m.hintPane >= 0 {
			m.hintPane = -1
			return m, nil
		}
		if m.loreHint {
			m.loreHint = false
			return m, nil
		}

		// Hint button clicks (open hint)
		for pane := 0; pane < 3; pane++ {
			if zone.Get(fmt.Sprintf("hint-%d", pane)).InBounds(msg) {
				m.hintPane = pane
				return m, nil
			}
		}

		// Row title clicks to switch pane
		for pane := 0; pane < 3; pane++ {
			if zone.Get(fmt.Sprintf("row-%d", pane)).InBounds(msg) {
				m.projPane = pane
				if pane == 0 {
					m.catalogSub = 0
				}
				return m, nil
			}
		}
		// Bundle disable clicks (x buttons on enabled bundles)
		for i, g := range m.enabledBundles {
			if zone.Get(fmt.Sprintf("bundle-disable-%d", i)).InBounds(msg) {
				m.bundleConfirm = true
				m.bundleConfirmSlug = g.slug
				m.bundleConfirmName = g.name
				m.bundleConfirmEnable = false
				return m, nil
			}
		}

		// Bundle toggle collapse clicks
		for i := range m.enabledBundles {
			if zone.Get(fmt.Sprintf("bundle-toggle-%d", i)).InBounds(msg) {
				m.enabledBundles[i].collapsed = !m.enabledBundles[i].collapsed
				m.projPane = 0
				m.catalogSub = 1
				return m, nil
			}
		}

		// Bundle kind group collapse toggles
		for gi := range m.enabledBundles {
			for ki := 0; ki < 3; ki++ {
				if zone.Get(fmt.Sprintf("bundle-kind-%d-%d", gi, ki)).InBounds(msg) {
					m.enabledBundles[gi].kindCollapsed[ki] = !m.enabledBundles[gi].kindCollapsed[ki]
					m.projPane = 0
					m.catalogSub = 1
					return m, nil
				}
			}
		}

		// Bundle HOOKS collapse toggles
		for gi := range m.enabledBundles {
			if zone.Get(fmt.Sprintf("hooks-bundle-%d", gi)).InBounds(msg) {
				m.enabledBundles[gi].hooksCollapsed = !m.enabledBundles[gi].hooksCollapsed
				m.projPane = 0
				m.catalogSub = 1
				return m, nil
			}
		}

		// Bundle MCP collapse toggles
		for gi := range m.enabledBundles {
			if zone.Get(fmt.Sprintf("mcp-bundle-%d", gi)).InBounds(msg) {
				m.enabledBundles[gi].mcpCollapsed = !m.enabledBundles[gi].mcpCollapsed
				m.projPane = 0
				m.catalogSub = 1
				return m, nil
			}
		}

		// Bundle box title click
		if zone.Get("row-0p").InBounds(msg) {
			m.projPane = 0
			m.catalogSub = 1
			return m, nil
		}

		// Global kind group collapse toggles
		for i := 0; i < 3; i++ {
			if zone.Get(fmt.Sprintf("global-kind-%d", i)).InBounds(msg) {
				m.globalCollapsed[i] = !m.globalCollapsed[i]
				m.projPane = 0
				m.catalogSub = 0
				return m, nil
			}
		}

		// Global HOOKS collapse toggle
		if zone.Get("hooks-global").InBounds(msg) {
			m.hooksGlobalCollapsed = !m.hooksGlobalCollapsed
			m.projPane = 0
			m.catalogSub = 0
			return m, nil
		}

		// Global MCP collapse toggle
		if zone.Get("mcp-global").InBounds(msg) {
			m.mcpGlobalCollapsed = !m.mcpGlobalCollapsed
			m.projPane = 0
			m.catalogSub = 0
			return m, nil
		}

		// Global catalog leaf clicks
		for i := 0; i < len(m.projGlobal); i++ {
			if zone.Get(fmt.Sprintf("leaf-g-%d", i)).InBounds(msg) {
				m.projPane = 0
				m.catalogSub = 0
				catIdx := len(m.projBundle) + i
				m.projCursor[0] = catIdx
				m.toggleCatalogItem(catIdx)
				return m, nil
			}
		}

		// Bundle catalog leaf clicks
		for i := 0; i < len(m.projBundle); i++ {
			if zone.Get(fmt.Sprintf("leaf-p-%d", i)).InBounds(msg) {
				m.projPane = 0
				m.catalogSub = 1
				m.projCursor[0] = i
				m.toggleCatalogItem(i)
				return m, nil
			}
		}

		// Bundle enable clicks (available bundles)
		for i, p := range m.availableBundles {
			if zone.Get(fmt.Sprintf("bundle-enable-%d", i)).InBounds(msg) {
				m.bundleConfirm = true
				m.bundleConfirmSlug = p.Slug
				m.bundleConfirmName = p.Name
				m.bundleConfirmEnable = true
				return m, nil
			}
		}

		// LORE.md clicks — open tooltip modal
		loreClicked := zone.Get("lore-global").InBounds(msg) || zone.Get("lore-project").InBounds(msg)
		if !loreClicked {
			for i := range m.enabledBundles {
				if zone.Get(fmt.Sprintf("lore-bundle-%d", i)).InBounds(msg) {
					loreClicked = true
					break
				}
			}
		}
		if loreClicked {
			m.loreHint = true
			return m, nil
		}

		// Project kind group collapse toggles
		for i := 0; i < 3; i++ {
			if zone.Get(fmt.Sprintf("project-kind-%d", i)).InBounds(msg) {
				m.projectCollapsed[i] = !m.projectCollapsed[i]
				m.projPane = 1
				return m, nil
			}
		}

		// Project HOOKS collapse toggle
		if zone.Get("hooks-project").InBounds(msg) {
			m.hooksProjectCollapsed = !m.hooksProjectCollapsed
			m.projPane = 1
			return m, nil
		}

		// Project MCP collapse toggle
		if zone.Get("mcp-project").InBounds(msg) {
			m.mcpProjectCollapsed = !m.mcpProjectCollapsed
			m.projPane = 1
			return m, nil
		}

		// Project leaf clicks
		items := m.buildPane2Items()
		for i := 0; i < len(items); i++ {
			if zone.Get(fmt.Sprintf("leaf-1-%d", i)).InBounds(msg) {
				m.projPane = 1
				m.projCursor[1] = i
				return m, nil
			}
		}
	}

	// Welcome wizard clicks
	if m.mode == modeWelcome {
		m.wizBtnFocus = -1 // mouse click resets keyboard focus

		// Back button (shared across steps)
		if zone.Get("wiz-back").InBounds(msg) {
			switch m.wizStep {
			case stepName:
				m.goToWizStep(stepChoice)
			case stepPlatforms:
				if m.wizChoice == 1 {
					m.goToWizStep(stepName)
				} else {
					m.goToWizStep(stepChoice)
				}
			case stepConfirm:
				m.goToWizStep(stepPlatforms)
			}
			return m, nil
		}

		switch m.wizStep {
		case stepChoice:
			if zone.Get("wiz-choice-0").InBounds(msg) && m.canInitHere {
				m.wizChoice = 0
				m.goToWizStep(stepPlatforms)
				return m, nil
			}
			if zone.Get("wiz-choice-1").InBounds(msg) {
				m.wizChoice = 1
				m.goToWizStep(stepName)
				m.wizNameBuf = ""
				m.wizNameErr = ""
				return m, nil
			}
			return m, nil
		case stepName:
			if zone.Get("wiz-name-continue").InBounds(msg) {
				name := strings.TrimSpace(m.wizNameBuf)
				if name == "" {
					m.wizNameErr = "Name cannot be empty."
				} else if !namePattern.MatchString(name) {
					m.wizNameErr = "Invalid characters. Use letters, numbers, dots, hyphens, underscores."
				} else if _, err := os.Stat(filepath.Join(m.cwd, name)); err == nil {
					m.wizNameErr = fmt.Sprintf("%s already exists.", name)
				} else {
					m.wizNameBuf = name
					m.wizNameErr = ""
					m.goToWizStep(stepPlatforms)
				}
				return m, nil
			}
			return m, nil
		case stepPlatforms:
			for i := 0; i < len(validPlatforms); i++ {
				if zone.Get(fmt.Sprintf("wiz-plat-%d", i)).InBounds(msg) {
					m.wizCursor = i
					m.wizPlatforms[i] = !m.wizPlatforms[i]
					return m, nil
				}
			}
			if zone.Get("wiz-plat-continue").InBounds(msg) && m.selectedPlatformCount() > 0 {
				m.goToWizStep(stepConfirm)
				return m, nil
			}
			return m, nil
		case stepConfirm:
			if zone.Get("wiz-confirm").InBounds(msg) {
				createNew := m.wizChoice == 1
				return m, doInit(m.cwd, m.selectedPlatformList(), createNew, m.wizNameBuf)
			}
			return m, nil
		}
		return m, nil
	}

	return m, nil
}

// ── View ────────────────────────────────────────────────────────────

func (m *tuiModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Initializing..."
	}

	switch m.mode {
	case modeWelcome:
		return zone.Scan(m.viewWelcome())
	case modeSuccess:
		return m.viewSuccess()
	case modeDashboard:
		return zone.Scan(m.viewDashboardShell())
	}

	return ""
}

func (m *tuiModel) viewSuccess() string {
	var b strings.Builder
	b.WriteString("\n")
	b.WriteString(bold.Render(loreLogo))
	b.WriteString("\n\n")

	checkStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Bold(true)
	b.WriteString("  " + checkStyle.Render("✓") + bold.Render(" Project created") + "\n\n")
	b.WriteString("  " + m.successPath + "\n\n")

	if len(m.wizBackedUp) > 0 {
		b.WriteString(dimStyle.Render("  Backed up existing files:") + "\n")
		for _, f := range m.wizBackedUp {
			clean := strings.TrimSuffix(f, "/")
			b.WriteString(dimStyle.Render(fmt.Sprintf("    %s → %s.pre-lore", f, clean)) + "\n")
		}
		b.WriteString("\n")
	}

	b.WriteString(dimStyle.Render("  Press any key to continue"))
	return b.String()
}

// ── Welcome View (no .lore/) ────────────────────────────────────────

const loreLogo = `   _
  | |
  | | ___  _ __ ___
  | |/ _ \| '__/ _ \
  | | (_) | | |  __/
  |_|\___/|_|  \___|`

func (m *tuiModel) viewWelcome() string {
	var b strings.Builder

	// Logo
	logo := bold.Render(loreLogo)
	b.WriteString("\n")
	b.WriteString(logo)
	b.WriteString("\n\n")

	if !m.globalExists {
		b.WriteString(dimStyle.Render("  First-time setup"))
		b.WriteString("\n")
	}
	b.WriteString("\n")

	switch m.wizStep {
	case stepChoice:
		if m.canInitHere {
			createBtn := btnSecondary.Render("Create new project directory →")
			initBtn := btnSecondary.Render("Initialize current directory →")
			if m.wizCursor == 0 {
				createBtn = btnPrimary.Render("Create new project directory →")
			} else {
				initBtn = btnPrimary.Render("Initialize current directory →")
			}
			b.WriteString("  ")
			b.WriteString(zone.Mark("wiz-choice-1", createBtn))
			b.WriteString("\n\n  ")
			b.WriteString(zone.Mark("wiz-choice-0", initBtn))
		} else {
			b.WriteString("  ")
			b.WriteString(zone.Mark("wiz-choice-1", btnPrimary.Render("Create new project directory →")))
		}

	case stepName:
		b.WriteString(dimStyle.Render("  Letters, numbers, dots, hyphens, underscores."))
		b.WriteString("\n\n")

		b.WriteString(bold.Render("  Project name: "))
		b.WriteString(m.wizNameBuf)
		if m.wizBtnFocus == -1 {
			b.WriteString(bold.Render("_"))
		} else {
			b.WriteString(dimStyle.Render("_"))
		}
		b.WriteString("\n\n")

		if m.wizNameErr != "" {
			b.WriteString("  " + errStyle.Render(m.wizNameErr))
			b.WriteString("\n\n")
		}

		b.WriteString(dimStyle.Render("  " + filepath.Join(m.cwd, m.wizNameBuf+"/")))
		b.WriteString("\n\n")
		b.WriteString("  ")
		backBtn := btnSecondary.Render("Back")
		if m.wizBtnFocus == 0 {
			backBtn = btnPrimary.Render("Back")
		}
		contBtn := btnPrimary.Render("Continue")
		if m.wizBtnFocus == 0 {
			contBtn = btnSecondary.Render("Continue")
		}
		b.WriteString(zone.Mark("wiz-back", backBtn))
		b.WriteString("  ")
		b.WriteString(zone.Mark("wiz-name-continue", contBtn))

	case stepPlatforms:
		if m.wizChoice == 0 {
			b.WriteString(bold.Render("  Initialize Lore in: "))
			b.WriteString(m.cwd)
		} else {
			b.WriteString(bold.Render("  Create project: "))
			b.WriteString(m.wizNameBuf)
		}
		b.WriteString("\n\n")

		b.WriteString(bold.Render("  Select platforms"))
		b.WriteString(dimStyle.Render("  (click or Space to toggle)"))
		b.WriteString("\n\n")

		for i, p := range validPlatforms {
			cursor := "  "
			if m.wizCursor == i {
				cursor = bold.Render("> ")
			}
			check := "[ ]"
			if m.wizPlatforms[i] {
				check = bold.Render("[x]")
			}
			line := fmt.Sprintf("  %s%s %s", cursor, check, p)
			b.WriteString(zone.Mark(fmt.Sprintf("wiz-plat-%d", i), line) + "\n")
		}

		b.WriteString("\n")
		count := m.selectedPlatformCount()
		if count == 0 {
			b.WriteString(dimStyle.Render("  Select at least one platform to continue"))
		} else {
			b.WriteString(dimStyle.Render(fmt.Sprintf("  %d platform(s) selected", count)))
		}
		b.WriteString("\n\n  ")
		platBackBtn := btnSecondary.Render("Back")
		if m.wizBtnFocus == 0 {
			platBackBtn = btnPrimary.Render("Back")
		}
		b.WriteString(zone.Mark("wiz-back", platBackBtn))
		b.WriteString("  ")
		if count > 0 {
			platContBtn := btnPrimary.Render("Continue")
			if m.wizBtnFocus != 1 {
				platContBtn = btnSecondary.Render("Continue")
			}
			b.WriteString(zone.Mark("wiz-plat-continue", platContBtn))
		} else {
			b.WriteString(btnDisabled.Render("Continue"))
		}

	case stepConfirm:
		var projectPath string
		if m.wizChoice == 0 {
			projectPath = m.cwd
		} else {
			projectPath = filepath.Join(m.cwd, m.wizNameBuf)
		}
		platforms := strings.Join(m.selectedPlatformList(), ", ")

		b.WriteString(bold.Render("  Confirm"))
		b.WriteString("\n\n")
		b.WriteString("  " + projectPath + "\n")
		b.WriteString("  " + dimStyle.Render(platforms) + "\n")
		b.WriteString("\n")

		b.WriteString("  ")
		confBackBtn := btnSecondary.Render("Back")
		if m.wizBtnFocus == 0 {
			confBackBtn = btnPrimary.Render("Back")
		}
		confBtn := btnPrimary.Render("Confirm")
		if m.wizBtnFocus == 0 {
			confBtn = btnSecondary.Render("Confirm")
		}
		b.WriteString(zone.Mark("wiz-back", confBackBtn))
		b.WriteString("  ")
		b.WriteString(zone.Mark("wiz-confirm", confBtn))
	}

	return b.String()
}

// ── Dashboard View ──────────────────────────────────────────────────

func (m *tuiModel) viewDashboardShell() string {
	hasDialog := m.genConfirm || m.agentDisableActive || m.skillWarnActive || m.bundleConfirm || m.mktConfirm

	// When a dialog is open, give it the entire screen
	if hasDialog {
		if m.mktConfirm {
			return m.viewMarketplace(m.height)
		}
		return m.viewProjectionPlanner(m.height)
	}

	headerBar := m.renderHeaderBar()
	tabBar := m.renderTabBar()
	statusBar := m.renderStatusBar()

	// Measure chrome lines (the \n between sections are line breaks, not extra lines)
	headerH := strings.Count(headerBar, "\n") + 1
	tabH := strings.Count(tabBar, "\n") + 1
	statusH := 1

	contentH := m.height - headerH - tabH - statusH
	if contentH < 1 {
		contentH = 1
	}

	var content string
	switch m.tab {
	case tabProjection:
		// Compute Y offset where columns begin (for mouse scroll targeting)
		platBar := m.renderPlatformBar()
		platBarH := strings.Count(platBar, "\n") + 1
		m.colStartY = headerH + tabH + platBarH
		content = m.viewProjectionPlanner(contentH)
	case tabMarketplace:
		content = m.viewMarketplace(contentH)
	default:
		content = m.viewBundlePage(contentH)
	}

	// Assemble and pad to exact terminal height
	var b strings.Builder
	b.WriteString(headerBar)
	b.WriteString("\n")
	b.WriteString(tabBar)
	b.WriteString("\n")
	b.WriteString(content)
	b.WriteString("\n")
	b.WriteString(statusBar)

	return b.String()
}

func (m *tuiModel) renderHeaderBar() string {
	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}

	left := bold.Render(m.projectName)
	right := dimStyle.Render(m.cwd)

	boxInnerW := m.width - 4 // border + padding
	gap := boxInnerW - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		gap = 1
	}
	content := left + strings.Repeat(" ", gap) + right

	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(0, 1).
		Render(content)
}

func (m *tuiModel) renderTabBar() string {
	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}

	activeTabStyle := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 2).
		Foreground(lipgloss.Color("12")).
		Border(lipgloss.RoundedBorder(), true, true, false, true).
		BorderForeground(lipgloss.Color("12"))

	inactiveTabStyle := lipgloss.NewStyle().
		Faint(true).
		Padding(0, 2).
		Border(lipgloss.RoundedBorder(), true, true, false, true).
		BorderForeground(borderFg)

	tabs := []struct {
		label  string
		zoneID string
		id     tabID
	}{
		{"Projections", "tab-projection", tabProjection},
		{"Marketplace", "tab-marketplace", tabMarketplace},
	}
	for _, page := range m.bundlePages {
		tabs = append(tabs, struct {
			label  string
			zoneID string
			id     tabID
		}{page.name, fmt.Sprintf("tab-bundle-%d", page.tabID), page.tabID})
	}

	var parts []string
	for _, t := range tabs {
		var rendered string
		if m.tab == t.id {
			rendered = activeTabStyle.Render(t.label)
		} else {
			rendered = inactiveTabStyle.Render(t.label)
		}
		parts = append(parts, zone.Mark(t.zoneID, rendered))
	}

	tabBar := lipgloss.JoinHorizontal(lipgloss.Bottom, parts...)

	// Fill the rest of the line with a bottom border
	barW := lipgloss.Width(tabBar)
	remaining := m.width - barW
	if remaining > 0 {
		filler := lipgloss.NewStyle().Foreground(borderFg).Render(strings.Repeat("─", remaining))
		tabBar = lipgloss.JoinHorizontal(lipgloss.Bottom, tabBar, filler)
	}

	return tabBar
}

func (m *tuiModel) renderStatusBar() string {
	var left string
	if m.tab == tabMarketplace {
		left = dimStyle.Render(" Marketplace: install and manage bundles")
	} else {
		left = dimStyle.Render(" Inheritance: ○ off  ◐ defer  ● overwrite")
	}
	right := dimStyle.Render(fmt.Sprintf("lore v%s ", version))
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}
	return left + strings.Repeat(" ", gap) + right
}

// computeGenDiff computes which files are new vs overwrite.
func (m *tuiModel) computeGenDiff() (newFiles, overFiles []string) {
	rules, skills, agents := m.mergedRules, m.mergedSkills, m.mergedAgents
	seen := map[string]bool{}
	for _, p := range validPlatforms {
		if !m.platforms[p] {
			continue
		}
		for _, path := range platformOutputPaths(p, rules, skills, agents, m.hasMCP) {
			clean := strings.TrimSuffix(path, "/")
			if seen[clean] || strings.HasSuffix(path, "/") {
				continue
			}
			seen[clean] = true
			fullPath := filepath.Join(m.cwd, clean)
			if _, err := os.Stat(fullPath); err == nil {
				overFiles = append(overFiles, clean)
			} else {
				newFiles = append(newFiles, clean)
			}
		}
	}
	return
}

// computeOrphanFiles finds files on disk inside Lore-owned directories that
// would not be generated by the current projection. Simple diff: expected vs actual.
func (m *tuiModel) computeOrphanFiles() []string {
	rules, skills, agents := m.mergedRules, m.mergedSkills, m.mergedAgents

	// Build the set of files that WOULD be generated.
	// Track directory entries separately — any file under an expected skill
	// directory is expected (skill resources: references/, scripts/, assets/).
	expected := map[string]bool{}
	expectedDirs := []string{} // directory prefixes (e.g., ".claude/skills/lore-repair/")
	for _, p := range validPlatforms {
		if !m.platforms[p] {
			continue
		}
		for _, path := range platformOutputPaths(p, rules, skills, agents, m.hasMCP) {
			if strings.HasSuffix(path, "/") {
				expectedDirs = append(expectedDirs, path)
			}
			expected[strings.TrimSuffix(path, "/")] = true
		}
	}

	// Walk Lore-owned directories on disk, find anything not in the expected set
	ownedDirs := m.loreOwnedDirs()
	seen := map[string]bool{}
	var orphans []string
	for _, dir := range ownedDirs {
		dirFull := filepath.Join(m.cwd, dir)
		filepath.Walk(dirFull, func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(m.cwd, p)
			rel = filepath.ToSlash(rel)
			if expected[rel] || seen[rel] {
				return nil
			}
			// Check if file is under an expected directory (skill resources)
			underExpectedDir := false
			for _, prefix := range expectedDirs {
				if strings.HasPrefix(rel, prefix) {
					underExpectedDir = true
					break
				}
			}
			if !underExpectedDir {
				seen[rel] = true
				orphans = append(orphans, rel)
			}
			return nil
		})
	}

	// Also check root-level generated files (CLAUDE.md, AGENTS.md, etc.)
	rootFiles := []string{
		"CLAUDE.md", "AGENTS.md", "GEMINI.md", ".windsurfrules",
		".github/copilot-instructions.md",
	}
	for _, f := range rootFiles {
		if expected[f] || seen[f] {
			continue
		}
		fullPath := filepath.Join(m.cwd, f)
		if _, err := os.Stat(fullPath); err == nil {
			orphans = append(orphans, f)
		}
	}

	return orphans
}

// loreOwnedDirs returns the platform output directories that Lore fully owns.
func (m *tuiModel) loreOwnedDirs() []string {
	dirs := map[string]bool{}
	// Every enabled platform's output directories
	for _, p := range validPlatforms {
		if !m.platforms[p] {
			continue
		}
		// Use empty names to get just the structural dirs (settings, hooks)
		// then also get the content dirs from the projector
		for _, path := range platformOutputPaths(p, nil, nil, nil, false) {
			clean := strings.TrimSuffix(path, "/")
			dir := filepath.Dir(clean)
			if dir != "." {
				dirs[dir] = true
			}
		}
	}
	// Also include disabled platforms' dirs (their files are orphans)
	for _, p := range validPlatforms {
		if m.platforms[p] {
			continue
		}
		for _, path := range platformOutputPaths(p, nil, nil, nil, false) {
			clean := strings.TrimSuffix(path, "/")
			dir := filepath.Dir(clean)
			if dir != "." {
				dirs[dir] = true
			}
		}
	}
	var result []string
	for d := range dirs {
		result = append(result, d)
	}
	return result
}

func (m *tuiModel) renderPlatformBar() string {
	var parts []string
	for i, p := range validPlatforms {
		sym := "○"
		style := dimStyle
		if m.platforms[p] {
			sym = "●"
			style = lipgloss.NewStyle()
		}
		label := style.Render(sym + " " + p)
		parts = append(parts, zone.Mark(fmt.Sprintf("plat-%d", i), label))
	}

	content := strings.Join(parts, " ")

	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}
	barStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(0, 0)

	return barStyle.Render(content)
}

func (m *tuiModel) renderActionBar() string {
	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}
	boxInnerW := m.width - 4 // border + padding

	var content string
	if m.genMessage != "" {
		var msgStyle lipgloss.Style
		if m.genIsError {
			msgStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Bold(true)
		} else {
			msgStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Bold(true)
		}
		msg := msgStyle.Render(m.genMessage)
		pad := boxInnerW - lipgloss.Width(msg)
		if pad < 0 {
			pad = 0
		}
		content = strings.Repeat(" ", pad) + msg
	} else {
		// Left side: clean mode toggle + harness visibility toggle
		var cleanToggle string
		if m.cleanMode {
			cleanToggle = zone.Mark("clean-toggle", lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("● Clean orphans"))
		} else {
			cleanToggle = zone.Mark("clean-toggle", dimStyle.Render("○ Clean orphans"))
		}

		var harnessToggle string
		if m.hideHarness {
			harnessToggle = zone.Mark("harness-toggle", dimStyle.Render("◉ Hide harness"))
		} else {
			harnessToggle = zone.Mark("harness-toggle", dimStyle.Render("◎ Hide harness"))
		}

		leftSide := cleanToggle + "  " + harnessToggle

		// Right side: generate
		genBtn := zone.Mark("gen-btn", btnPrimary.Render("▶ Generate"))

		leftW := lipgloss.Width(leftSide)
		rightW := lipgloss.Width(genBtn)
		gap := boxInnerW - leftW - rightW
		if gap < 1 {
			gap = 1
		}
		content = leftSide + strings.Repeat(" ", gap) + genBtn
	}

	barStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(0, 1)

	return barStyle.Render(content)
}

func (m *tuiModel) viewProjectionPlanner(maxH int) string {
	if !m.projLoaded {
		m.loadProjection()
	}

	if m.width < 40 {
		return "  (widen terminal for projection planner)"
	}

	w := m.width
	hasDialog := m.genConfirm || m.agentDisableActive || m.skillWarnActive || m.bundleConfirm || m.hintPane >= 0 || m.loreHint

	// When a dialog is open, give the full space to the overlay
	if hasDialog {
		lines := make([]string, maxH)
		for i := range lines {
			lines[i] = ""
		}
		if m.genConfirm {
			lines = m.overlayGenConfirmDialog(lines, w)
		} else if m.bundleConfirm {
			lines = m.overlayBundleConfirmDialog(lines, w)
		} else if m.agentDisableActive {
			lines = m.overlayAgentDisableDialog(lines, w)
		} else if m.skillWarnActive {
			lines = m.overlaySkillWarnDialog(lines, w)
		} else if m.hintPane >= 0 {
			lines = m.overlayHint(lines, w, 0, m.hintPane)
		} else if m.loreHint {
			lines = m.overlayLoreHint(lines, w)
		}
		return strings.Join(lines, "\n")
	}

	// Platform bar at top
	platBar := m.renderPlatformBar()
	platBarH := strings.Count(platBar, "\n") + 1

	// Action bar at bottom
	actionBar := m.renderActionBar()
	actionBarH := strings.Count(actionBar, "\n") + 1

	// Columns fill the remaining space
	colMaxH := maxH - platBarH - actionBarH
	if colMaxH < 5 {
		colMaxH = 5
	}

	colW := w / 3
	innerW := colW - 2 // 2 border chars

	// Build pane 0 (catalog) as two stacked boxes
	pane0 := m.renderCatalogColumn(innerW, colMaxH, false, false)

	// Build panes 1 and 2 as single boxes
	visibleH := colMaxH - 2 // title + bottom border
	if visibleH < 3 {
		visibleH = 3
	}

	paneContents := [2]string{
		m.renderProjectList(innerW),
		m.renderOutputContent(innerW),
	}

	// Clamp scroll offsets for panes 1 and 2
	for i := 0; i < 2; i++ {
		paneIdx := i + 1
		totalLines := strings.Count(paneContents[i], "\n") + 1
		if paneContents[i] == "" {
			totalLines = 0
		}
		m.clampScroll(paneIdx, totalLines, visibleH)
	}

	titles := [2]string{"Project", "Projections"}
	var cols []string
	cols = append(cols, pane0)

	for i := 0; i < 2; i++ {
		paneIdx := i + 1
		allLines := strings.Split(paneContents[i], "\n")
		if paneContents[i] == "" {
			allLines = nil
		}
		totalLines := len(allLines)

		start := m.projScroll[paneIdx]
		if start > totalLines {
			start = totalLines
		}
		end := start + visibleH
		if end > totalLines {
			end = totalLines
		}
		visible := allLines[start:end]
		for len(visible) < visibleH {
			visible = append(visible, "")
		}

		var box []string
		box = append(box, m.renderBoxTitle(titles[i], innerW, paneIdx))
		for _, vl := range visible {
			lineW := lipgloss.Width(vl)
			if lineW > innerW {
				vl = ansi.Truncate(vl, innerW, "")
				lineW = lipgloss.Width(vl)
			}
			pad := innerW - lineW
			if pad < 0 {
				pad = 0
			}
			box = append(box, dimStyle.Render("│")+vl+strings.Repeat(" ", pad)+dimStyle.Render("│"))
		}
		box = append(box, m.renderBoxBottom(innerW, paneIdx, visibleH, totalLines))
		cols = append(cols, strings.Join(box, "\n"))
	}

	columnsStr := lipgloss.JoinHorizontal(lipgloss.Top, cols...)

	// Pad/trim columns to colMaxH
	lines := strings.Split(columnsStr, "\n")
	for len(lines) < colMaxH {
		lines = append(lines, "")
	}
	if len(lines) > colMaxH {
		lines = lines[:colMaxH]
	}

	return platBar + "\n" + strings.Join(lines, "\n") + "\n" + actionBar
}

// renderBoxTitle renders a section title bar with rounded corners and a hint button.
func (m *tuiModel) renderBoxTitle(label string, innerW int, pane int) string {
	var styledLabel string
	if m.projPane == pane {
		styledLabel = bold.Render(" " + label + " ")
	} else {
		styledLabel = dimStyle.Render(" " + label + " ")
	}

	hint := zone.Mark(fmt.Sprintf("hint-%d", pane), dimStyle.Render(" ? "))
	hintW := 3 // " ? "

	labelW := lipgloss.Width(styledLabel)
	fill := innerW - labelW - hintW - 1 // -1 for the dash after left corner
	if fill < 0 {
		fill = 0
	}

	var borderFmt lipgloss.Style
	if m.projPane == pane {
		borderFmt = lipgloss.NewStyle().Bold(true)
	} else {
		borderFmt = dimStyle
	}
	title := borderFmt.Render("╭─") + styledLabel + dimStyle.Render(strings.Repeat("─", fill)) + hint + dimStyle.Render("╮")
	return zone.Mark(fmt.Sprintf("row-%d", pane), title)
}

// renderBoxBottom renders a bottom border with scroll indicators.
func (m *tuiModel) renderBoxBottom(innerW int, pane int, visibleH int, totalLines int) string {
	fill := strings.Repeat("─", innerW)

	if totalLines <= visibleH {
		return dimStyle.Render("╰" + fill + "╯")
	}

	hasAbove := m.projScroll[pane] > 0
	hasBelow := m.projScroll[pane]+visibleH < totalLines

	indicator := ""
	if hasAbove && hasBelow {
		indicator = " ▲▼ "
	} else if hasAbove {
		indicator = " ▲ "
	} else if hasBelow {
		indicator = " ▼ "
	}
	if indicator != "" {
		indW := lipgloss.Width(indicator)
		fillW := innerW - indW
		if fillW < 0 {
			fillW = 0
		}
		return dimStyle.Render("╰"+strings.Repeat("─", fillW)) + dimStyle.Render(indicator) + dimStyle.Render("╯")
	}
	return dimStyle.Render("╰" + fill + "╯")
}

var hintTexts = [3][]string{
	{ // Global (pane 0)
		"Rules, skills, and agents from the",
		"global directory and active bundle.",
		"",
		"Click items to cycle inheritance policy:",
		"  ○ off       — excluded from projection",
		"  ◐ defer     — included, project can override",
		"  ● overwrite — included, overrides project",
		"",
		"LORE.md — prose instructions accumulated",
		"from all layers. Edit the file directly.",
	},
	{ // Project (pane 1)
		"Your project-local agentic content",
		"from .lore/.",
		"",
		"Only items on disk are shown here.",
		"Conflict indicators:",
		"  yellow — shadows a deferred global item",
		"  struck — overridden by global ● overwrite",
	},
	{ // Projections (pane 2)
		"File tree preview of what lore generate",
		"will produce for the selected platforms.",
		"",
		"  green  — new file (does not exist yet)",
		"  yellow — overwrites an existing file",
		"  red    — orphan to delete (clean mode)",
	},
}

// overlayHint renders a centered full-screen hint dialog for the given pane.
func (m *tuiModel) overlayHint(lines []string, w int, _ int, pane int) []string {
	titles := [3]string{"Global Catalog", "Project Agentics", "Projection Preview"}
	title := bold.Render(titles[pane])

	inner := title + "\n\n" + strings.Join(hintTexts[pane], "\n") + "\n\n" +
		zone.Mark("hint-close", btnSecondary.Render("Close"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}

// overlayLoreHint renders a centered modal explaining LORE.md accumulation.
func (m *tuiModel) overlayLoreHint(lines []string, w int) []string {
	title := bold.Render("LORE.md")

	body := []string{
		"Prose instructions projected into each",
		"platform's mandate file (CLAUDE.md, etc.).",
		"",
		"Three layers, accumulated in order:",
		"  1. Bundle   — behavioral defaults",
		"  2. Global   — operator preferences",
		"  3. Project  — project-specific context",
		"",
		"All layers are always included.",
		"Edit each file directly — no toggles.",
		"",
		"  🖹 = has content   🗋 = empty stub",
	}

	inner := title + "\n\n" + strings.Join(body, "\n") + "\n\n" +
		zone.Mark("hint-close", btnSecondary.Render("Close"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}

// ── Pane Content Renderers ──────────────────────────────────────────

// renderCatalogColumn renders the full pane 0 column with two stacked boxes (Global + Bundle).
func (m *tuiModel) renderCatalogColumn(innerW int, colMaxH int, hasBundle bool, hasDiscovery bool) string {
	// Always show bundle box (it shows enabled + available bundles)
	showBottom := len(m.enabledBundles) > 0 || len(m.availableBundles) > 0
	var globalH, pkgH int
	if showBottom {
		globalH = colMaxH / 2
		pkgH = colMaxH - globalH
		if globalH < 5 {
			globalH = 5
		}
		if pkgH < 5 {
			pkgH = 5
		}
	} else {
		globalH = colMaxH
		pkgH = 0
	}

	globalVisH := globalH - 2 // title + bottom border
	if globalVisH < 3 {
		globalVisH = 3
	}

	// Render global content
	globalContent := m.renderGlobalList(innerW)
	globalLines := strings.Split(globalContent, "\n")
	if globalContent == "" {
		globalLines = nil
	}
	globalTotal := len(globalLines)

	// Clamp global scroll
	m.clampCatalogScroll(0, globalTotal, globalVisH)

	gStart := m.catalogScroll[0]
	if gStart > globalTotal {
		gStart = globalTotal
	}
	gEnd := gStart + globalVisH
	if gEnd > globalTotal {
		gEnd = globalTotal
	}
	gVisible := globalLines[gStart:gEnd]
	for len(gVisible) < globalVisH {
		gVisible = append(gVisible, "")
	}

	var box []string
	box = append(box, m.renderCatalogBoxTitle("Global", innerW, 0, true))
	for _, vl := range gVisible {
		lineW := lipgloss.Width(vl)
		if lineW > innerW {
			vl = ansi.Truncate(vl, innerW, "")
			lineW = lipgloss.Width(vl)
		}
		pad := innerW - lineW
		if pad < 0 {
			pad = 0
		}
		box = append(box, dimStyle.Render("│")+vl+strings.Repeat(" ", pad)+dimStyle.Render("│"))
	}
	box = append(box, m.renderCatalogBoxBottom(innerW, 0, globalVisH, globalTotal))

	// Record global box height for mouse scroll targeting
	m.catalogGlobalH = globalH

	if showBottom {
		pkgVisH := pkgH - 2
		if pkgVisH < 3 {
			pkgVisH = 3
		}

		pkgContent := m.renderBundleContent(innerW)
		pkgLines := strings.Split(pkgContent, "\n")
		if pkgContent == "" {
			pkgLines = nil
		}
		pkgTotal := len(pkgLines)

		m.clampCatalogScroll(1, pkgTotal, pkgVisH)

		pStart := m.catalogScroll[1]
		if pStart > pkgTotal {
			pStart = pkgTotal
		}
		pEnd := pStart + pkgVisH
		if pEnd > pkgTotal {
			pEnd = pkgTotal
		}
		pVisible := pkgLines[pStart:pEnd]
		for len(pVisible) < pkgVisH {
			pVisible = append(pVisible, "")
		}

		box = append(box, m.renderCatalogBoxTitle("Bundles", innerW, 1, false))
		for _, vl := range pVisible {
			lineW := lipgloss.Width(vl)
			if lineW > innerW {
				vl = ansi.Truncate(vl, innerW, "")
				lineW = lipgloss.Width(vl)
			}
			pad := innerW - lineW
			if pad < 0 {
				pad = 0
			}
			box = append(box, dimStyle.Render("│")+vl+strings.Repeat(" ", pad)+dimStyle.Render("│"))
		}
		box = append(box, m.renderCatalogBoxBottom(innerW, 1, pkgVisH, pkgTotal))
	}

	return strings.Join(box, "\n")
}

// renderCatalogBoxTitle renders a title bar for a catalog sub-box.
// sub: 0=global, 1=bundle. showHint: whether to show the ? button.
func (m *tuiModel) renderCatalogBoxTitle(label string, innerW int, sub int, showHint bool) string {
	isFocused := m.projPane == 0 && m.catalogSub == sub

	var styledLabel string
	if isFocused {
		styledLabel = bold.Render(" " + label + " ")
	} else {
		styledLabel = dimStyle.Render(" " + label + " ")
	}

	// Right-side widget: hint (?) for global box
	var rightWidget string
	rightW := 0
	if showHint {
		rightWidget = zone.Mark("hint-0", dimStyle.Render(" ? "))
		rightW = 3
	}

	labelW := lipgloss.Width(styledLabel)
	fill := innerW - labelW - rightW - 1
	if fill < 0 {
		fill = 0
	}

	var borderFmt lipgloss.Style
	if isFocused {
		borderFmt = lipgloss.NewStyle().Bold(true)
	} else {
		borderFmt = dimStyle
	}

	var title string
	if rightW > 0 {
		title = borderFmt.Render("╭─") + styledLabel + dimStyle.Render(strings.Repeat("─", fill)) + rightWidget + dimStyle.Render("╮")
	} else {
		title = borderFmt.Render("╭─") + styledLabel + dimStyle.Render(strings.Repeat("─", fill)) + dimStyle.Render("╮")
	}

	zoneID := "row-0"
	if sub == 1 {
		zoneID = "row-0p"
	}
	return zone.Mark(zoneID, title)
}

// renderCatalogBoxBottom renders a bottom border with scroll indicators for a catalog sub-box.
func (m *tuiModel) renderCatalogBoxBottom(innerW int, sub int, visibleH int, totalLines int) string {
	fill := strings.Repeat("─", innerW)

	if totalLines <= visibleH {
		return dimStyle.Render("╰" + fill + "╯")
	}

	hasAbove := m.catalogScroll[sub] > 0
	hasBelow := m.catalogScroll[sub]+visibleH < totalLines

	indicator := ""
	if hasAbove && hasBelow {
		indicator = " ▲▼ "
	} else if hasAbove {
		indicator = " ▲ "
	} else if hasBelow {
		indicator = " ▼ "
	}
	if indicator != "" {
		indW := lipgloss.Width(indicator)
		fillW := innerW - indW
		if fillW < 0 {
			fillW = 0
		}
		return dimStyle.Render("╰"+strings.Repeat("─", fillW)) + dimStyle.Render(indicator) + dimStyle.Render("╯")
	}
	return dimStyle.Render("╰" + fill + "╯")
}

// clampCatalogScroll ensures catalog sub-box scroll offset is within valid range.
func (m *tuiModel) clampCatalogScroll(sub int, totalLines int, visibleH int) {
	maxScroll := totalLines - visibleH
	if maxScroll < 0 {
		maxScroll = 0
	}
	if m.catalogScroll[sub] > maxScroll {
		m.catalogScroll[sub] = maxScroll
	}
	if m.catalogScroll[sub] < 0 {
		m.catalogScroll[sub] = 0
	}
}

// renderGlobalList renders global catalog items with collapsible kind groups.
func (m *tuiModel) renderGlobalList(w int) string {
	var lines []string

	// LORE.md row
	if m.loreGlobal {
		lines = append(lines, zone.Mark("lore-global", " 🖹 LORE.md"))
	} else {
		lines = append(lines, zone.Mark("lore-global", dimStyle.Render(" 🗋 LORE.md")))
	}

	// HOOKS row (collapsible, only shown if non-empty)
	if len(m.hooksGlobal) > 0 {
		arrow := "▾"
		if m.hooksGlobalCollapsed {
			arrow = "▸"
		}
		header := " " + arrow + " HOOKS"
		if m.hooksGlobalCollapsed {
			header += dimStyle.Render(fmt.Sprintf(" (%d)", len(m.hooksGlobal)))
		}
		lines = append(lines, zone.Mark("hooks-global", header))
		if !m.hooksGlobalCollapsed {
			for _, h := range m.hooksGlobal {
				lines = append(lines, "  ⚡ "+h.event+dimStyle.Render(" > "+h.name))
			}
		}
	}

	// MCP row (collapsible, always shown)
	if len(m.mcpGlobal) > 0 {
		arrow := "▾"
		if m.mcpGlobalCollapsed {
			arrow = "▸"
		}
		header := " " + arrow + " MCP"
		if m.mcpGlobalCollapsed {
			header += dimStyle.Render(fmt.Sprintf(" (%d)", len(m.mcpGlobal)))
		}
		lines = append(lines, zone.Mark("mcp-global", header))
		if !m.mcpGlobalCollapsed {
			for _, name := range m.mcpGlobal {
				lines = append(lines, "  ⚡ "+name)
			}
		}
	} else {
		lines = append(lines, dimStyle.Render(" MCP (0)"))
	}

	if len(m.projGlobal) == 0 {
		return strings.Join(lines, "\n")
	}

	lastKind := ""
	kindIdx := -1 // 0=rules, 1=skills, 2=agents
	for i, item := range m.projGlobal {
		if item.kind != lastKind {
			lastKind = item.kind
			kindIdx = kindIndex(item.kind)
			collapsed := kindIdx >= 0 && m.globalCollapsed[kindIdx]
			arrow := "▾"
			if collapsed {
				arrow = "▸"
			}
			count := m.countKindItems(m.projGlobal, item.kind)
			header := " " + arrow + " " + strings.ToUpper(item.kind) + "S"
			if collapsed {
				header += dimStyle.Render(fmt.Sprintf(" (%d)", count))
			}
			lines = append(lines, zone.Mark(fmt.Sprintf("global-kind-%d", kindIdx), bold.Render(header)))
		}
		if kindIdx >= 0 && m.globalCollapsed[kindIdx] {
			continue
		}
		policy := m.tuiGetPolicy(kindPlural(item.kind), item.name, defaultForSource(item.source))
		sym := policySymbol(policy)
		line := "  " + sym + " " + item.name
		line = zone.Mark(fmt.Sprintf("leaf-g-%d", i), line)
		lines = append(lines, line)
		if item.kind == "skill" {
			if badge := skillResourceBadge(item.numReferences, item.numAssets, item.numScripts); badge != "" {
				lines = append(lines, dimStyle.Render("      "+badge))
			}
		}
	}
	return strings.Join(lines, "\n")
}

// kindIndex returns 0 for rules, 1 for skills, 2 for agents.
func kindIndex(kind string) int {
	switch kind {
	case "rule":
		return 0
	case "skill":
		return 1
	case "agent":
		return 2
	}
	return -1
}

// countKindItems counts items of a given kind in a slice.
func (m *tuiModel) countKindItems(items []projItem, kind string) int {
	n := 0
	for _, item := range items {
		if item.kind == kind {
			n++
		}
	}
	return n
}

// renderBundleContent renders the bundle pane with enabled bundles (collapsible)
// and available bundles.
func (m *tuiModel) renderBundleContent(w int) string {
	var lines []string

	// Enabled bundles section
	if len(m.enabledBundles) > 0 {
		if len(m.availableBundles) > 0 {
			lines = append(lines, bold.Render(" ENABLED"))
		}
		// Build a flat index offset for projBundle items
		flatIdx := 0
		for gi, group := range m.enabledBundles {
			// Bundle header: ▾/▸ name                    ×
			arrow := "▾"
			if group.collapsed {
				arrow = "▸"
			}
			nameLabel := zone.Mark(fmt.Sprintf("bundle-toggle-%d", gi), " "+arrow+" "+group.name)
			disableBtn := zone.Mark(fmt.Sprintf("bundle-disable-%d", gi),
				lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("×"))
			nameW := lipgloss.Width(nameLabel)
			btnW := 1
			gap := w - nameW - btnW
			if gap < 1 {
				gap = 1
			}
			lines = append(lines, nameLabel+strings.Repeat(" ", gap)+disableBtn)

			if !group.collapsed {
				// LORE.md row
				if group.hasLoreMD {
					lines = append(lines, zone.Mark(fmt.Sprintf("lore-bundle-%d", gi), "   🖹 LORE.md"))
				}

				// HOOKS row (collapsible, only shown if non-empty)
				if len(group.hookEntries) > 0 {
					arrow := "▾"
					if m.enabledBundles[gi].hooksCollapsed {
						arrow = "▸"
					}
					header := "   " + arrow + " HOOKS"
					if m.enabledBundles[gi].hooksCollapsed {
						header += dimStyle.Render(fmt.Sprintf(" (%d)", len(group.hookEntries)))
					}
					lines = append(lines, zone.Mark(fmt.Sprintf("hooks-bundle-%d", gi), header))
					if !m.enabledBundles[gi].hooksCollapsed {
						for _, h := range group.hookEntries {
							lines = append(lines, "    ⚡ "+h.event+dimStyle.Render(" > "+h.name))
						}
					}
				}

				// MCP row (collapsible, always shown)
				if len(group.mcpServers) > 0 {
					arrow := "▾"
					if m.enabledBundles[gi].mcpCollapsed {
						arrow = "▸"
					}
					header := "   " + arrow + " MCP"
					if m.enabledBundles[gi].mcpCollapsed {
						header += dimStyle.Render(fmt.Sprintf(" (%d)", len(group.mcpServers)))
					}
					lines = append(lines, zone.Mark(fmt.Sprintf("mcp-bundle-%d", gi), header))
					if !m.enabledBundles[gi].mcpCollapsed {
						for _, name := range group.mcpServers {
							lines = append(lines, "    ⚡ "+name)
						}
					}
				} else {
					lines = append(lines, dimStyle.Render("   MCP (0)"))
				}

				// Items grouped by kind, each kind collapsible
				lastKind := ""
				ki := -1
				for _, item := range group.items {
					if item.kind != lastKind {
						lastKind = item.kind
						ki = kindIndex(item.kind)
						collapsed := ki >= 0 && m.enabledBundles[gi].kindCollapsed[ki]
						arrow := "▾"
						if collapsed {
							arrow = "▸"
						}
						header := "   " + arrow + " " + strings.ToUpper(item.kind) + "S"
						if collapsed {
							count := m.countKindItems(group.items, item.kind)
							header += dimStyle.Render(fmt.Sprintf(" (%d)", count))
						}
						lines = append(lines, zone.Mark(fmt.Sprintf("bundle-kind-%d-%d", gi, ki), bold.Render(header)))
					}
					if ki >= 0 && m.enabledBundles[gi].kindCollapsed[ki] {
						flatIdx++
						continue
					}
					policy := m.tuiGetPolicy(kindPlural(item.kind), item.name, defaultForSource(item.source))
					sym := policySymbol(policy)
					line := "    " + sym + " " + item.name
					line = zone.Mark(fmt.Sprintf("leaf-p-%d", flatIdx), line)
					lines = append(lines, line)
					if item.kind == "skill" {
						if badge := skillResourceBadge(item.numReferences, item.numAssets, item.numScripts); badge != "" {
							lines = append(lines, dimStyle.Render("        "+badge))
						}
					}
					flatIdx++
				}
			} else {
				flatIdx += len(group.items)
			}
		}
	}

	// Available bundles section
	if len(m.availableBundles) > 0 {
		if len(m.enabledBundles) > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, bold.Render(" AVAILABLE"))
		for i, p := range m.availableBundles {
			label := " + " + p.Name
			if p.Version != "" {
				label += " v" + p.Version
			}
			label = dimStyle.Render(label)
			lines = append(lines, zone.Mark(fmt.Sprintf("bundle-enable-%d", i), label))
		}
	}

	// Nothing at all
	if len(m.enabledBundles) == 0 && len(m.availableBundles) == 0 {
		lines = append(lines, dimStyle.Render(" No bundles installed"))
	}

	return strings.Join(lines, "\n")
}

// renderProjectList renders the project pane with collapsible kind groups.
func (m *tuiModel) renderProjectList(w int) string {
	var lines []string

	// LORE.md row
	if m.loreProject {
		lines = append(lines, zone.Mark("lore-project", " 🖹 LORE.md"))
	} else {
		lines = append(lines, zone.Mark("lore-project", dimStyle.Render(" 🗋 LORE.md")))
	}

	// HOOKS row (collapsible, only shown if non-empty)
	if len(m.hooksProject) > 0 {
		arrow := "▾"
		if m.hooksProjectCollapsed {
			arrow = "▸"
		}
		header := " " + arrow + " HOOKS"
		if m.hooksProjectCollapsed {
			header += dimStyle.Render(fmt.Sprintf(" (%d)", len(m.hooksProject)))
		}
		lines = append(lines, zone.Mark("hooks-project", header))
		if !m.hooksProjectCollapsed {
			for _, h := range m.hooksProject {
				lines = append(lines, "  ⚡ "+h.event+dimStyle.Render(" > "+h.name))
			}
		}
	}

	// MCP row (collapsible, always shown)
	if len(m.mcpProject) > 0 {
		arrow := "▾"
		if m.mcpProjectCollapsed {
			arrow = "▸"
		}
		header := " " + arrow + " MCP"
		if m.mcpProjectCollapsed {
			header += dimStyle.Render(fmt.Sprintf(" (%d)", len(m.mcpProject)))
		}
		lines = append(lines, zone.Mark("mcp-project", header))
		if !m.mcpProjectCollapsed {
			for _, name := range m.mcpProject {
				lines = append(lines, "  ⚡ "+name)
			}
		}
	} else {
		lines = append(lines, dimStyle.Render(" MCP (0)"))
	}

	items := m.buildPane2Items()
	if len(items) == 0 {
		lines = append(lines, dimStyle.Render(" RULES"), dimStyle.Render(" SKILLS"), dimStyle.Render(" AGENTS"))
		return strings.Join(lines, "\n")
	}

	lastKind := ""
	kindIdx := -1
	for _, item := range items {
		if item.kind != lastKind {
			lastKind = item.kind
			kindIdx = kindIndex(item.kind)
			collapsed := kindIdx >= 0 && m.projectCollapsed[kindIdx]
			arrow := "▾"
			if collapsed {
				arrow = "▸"
			}
			count := countPane2Kind(items, item.kind)
			header := " " + arrow + " " + strings.ToUpper(item.kind) + "S"
			if collapsed {
				header += dimStyle.Render(fmt.Sprintf(" (%d)", count))
			}
			lines = append(lines, zone.Mark(fmt.Sprintf("project-kind-%d", kindIdx), bold.Render(header)))
		}
		if kindIdx >= 0 && m.projectCollapsed[kindIdx] {
			continue
		}
		label := item.name
		switch item.color {
		case "green":
			label = greenStyle.Render(label)
		case "yellow":
			label = yellowStyle.Render(label)
		case "strike":
			label = redStyle.Render(label)
		}
		lines = append(lines, "   "+label)
		if item.kind == "skill" {
			if badge := skillResourceBadge(item.numReferences, item.numAssets, item.numScripts); badge != "" {
				lines = append(lines, dimStyle.Render("     "+badge))
			}
		}
	}
	return strings.Join(lines, "\n")
}

// countPane2Kind counts items of a given kind in pane2 items.
func countPane2Kind(items []pane2Item, kind string) int {
	n := 0
	for _, item := range items {
		if item.kind == kind {
			n++
		}
	}
	return n
}

// renderOutputContent renders the projection output as a file tree.
func (m *tuiModel) renderOutputContent(w int) string {
	treeStr := m.buildOutputTree()
	if treeStr == "" {
		return dimStyle.Render(" (no output)")
	}
	lines := strings.Split(treeStr, "\n")
	for i, l := range lines {
		lines[i] = " " + l
	}
	return strings.Join(lines, "\n")
}

// overlayAgentDisableDialog renders a centered dialog for choosing which skills
// to keep when disabling an agent.
func (m *tuiModel) overlayAgentDisableDialog(lines []string, w int) []string {
	title := bold.Render(fmt.Sprintf("Disable agent %q", m.agentDisableName))
	subtitle := dimStyle.Render("Select skills to keep enabled:")

	var skillLines []string
	for i, s := range m.agentDisableSkills {
		cursor := "  "
		if m.agentDisableCursor == i {
			cursor = "> "
		}
		check := "[ ]"
		if m.agentDisableKeep[i] {
			check = "[x]"
		}
		line := zone.Mark(fmt.Sprintf("adskill-%d", i), cursor+check+" "+s)
		skillLines = append(skillLines, line)
	}

	confirmBtn := zone.Mark("ad-confirm", btnPrimary.Render("Confirm"))
	cancelBtn := zone.Mark("ad-cancel", btnSecondary.Render("Cancel"))

	inner := title + "\n" + subtitle + "\n\n" + strings.Join(skillLines, "\n") + "\n\n" + confirmBtn + "   " + cancelBtn

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}

// overlaySkillWarnDialog warns that disabling a skill will affect active agents.
func (m *tuiModel) overlaySkillWarnDialog(lines []string, w int) []string {
	warnStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	title := bold.Render(fmt.Sprintf("Disable skill %q", m.skillWarnName))
	subtitle := warnStyle.Render("Referenced by active agents:")

	var agentLines []string
	for _, a := range m.skillWarnAgents {
		agentLines = append(agentLines, "  • "+a)
	}

	confirmBtn := zone.Mark("sw-confirm", btnPrimary.Render("Disable anyway"))
	cancelBtn := zone.Mark("sw-cancel", btnSecondary.Render("Cancel"))

	inner := title + "\n" + subtitle + "\n\n" + strings.Join(agentLines, "\n") + "\n\n" + confirmBtn + "   " + cancelBtn

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}

// overlayGenConfirmDialog renders a centered confirmation dialog showing new/overwrite files.
func (m *tuiModel) overlayGenConfirmDialog(lines []string, w int) []string {
	title := bold.Render("Generate Projection")

	newStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	overStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("3"))

	var fileLines []string
	if len(m.genNewFiles) > 0 {
		fileLines = append(fileLines, newStyle.Render(fmt.Sprintf("  %d new files:", len(m.genNewFiles))))
		for _, f := range m.genNewFiles {
			fileLines = append(fileLines, newStyle.Render("    + "+f))
		}
	}
	if len(m.genOverFiles) > 0 {
		if len(fileLines) > 0 {
			fileLines = append(fileLines, "")
		}
		fileLines = append(fileLines, overStyle.Render(fmt.Sprintf("  %d overwrites:", len(m.genOverFiles))))
		for _, f := range m.genOverFiles {
			fileLines = append(fileLines, overStyle.Render("    ~ "+f))
		}
	}
	// Orphan deletions (clean mode)
	if m.cleanMode && len(m.orphanFiles) > 0 {
		delStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
		if len(fileLines) > 0 {
			fileLines = append(fileLines, "")
		}
		fileLines = append(fileLines, delStyle.Render(fmt.Sprintf("  %d deletions:", len(m.orphanFiles))))
		for _, f := range m.orphanFiles {
			fileLines = append(fileLines, delStyle.Render("    - "+f))
		}
	}

	if len(fileLines) == 0 {
		fileLines = append(fileLines, dimStyle.Render("  No files to generate."))
	}

	confirmBtn := zone.Mark("gen-confirm", btnPrimary.Render("▶ Confirm"))
	cancelBtn := zone.Mark("gen-cancel", btnSecondary.Render("Cancel"))
	buttons := confirmBtn + "   " + cancelBtn

	// Fixed chrome: border(2) + padding(2) + title(1) + blank(1) + blank(1) + buttons(1) = 8
	maxFileLines := len(lines) - 8
	if maxFileLines < 3 {
		maxFileLines = 3
	}

	totalFileLines := len(fileLines)
	if m.genConfScroll > totalFileLines-maxFileLines {
		m.genConfScroll = totalFileLines - maxFileLines
	}
	if m.genConfScroll < 0 {
		m.genConfScroll = 0
	}
	end := m.genConfScroll + maxFileLines
	if end > totalFileLines {
		end = totalFileLines
	}
	visibleFiles := fileLines[m.genConfScroll:end]
	if totalFileLines > maxFileLines {
		scrollHint := dimStyle.Render(fmt.Sprintf("  ↕ scroll (%d/%d)", m.genConfScroll+1, totalFileLines-maxFileLines+1))
		visibleFiles = append(visibleFiles, scrollHint)
	}

	inner := title + "\n\n" + strings.Join(visibleFiles, "\n") + "\n\n" + buttons

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}


// ── Helpers ─────────────────────────────────────────────────────────

func (m *tuiModel) selectedPlatformCount() int {
	count := 0
	for _, selected := range m.wizPlatforms {
		if selected {
			count++
		}
	}
	return count
}

func (m *tuiModel) selectedPlatformList() []string {
	var result []string
	for i, p := range validPlatforms {
		if m.wizPlatforms[i] {
			result = append(result, p)
		}
	}
	return result
}

// overlayBundleConfirmDialog renders a centered confirmation dialog for bundle activate/deactivate.
func (m *tuiModel) overlayBundleConfirmDialog(lines []string, w int) []string {
	var title string
	var body string
	if m.bundleConfirmEnable {
		title = bold.Render("Enable Bundle")
		body = "Enable " + bold.Render(m.bundleConfirmName) + "?\n\nHook scripts and agentic content from this\nbundle will be included on next generate."
	} else {
		title = bold.Render("Disable Bundle")
		body = "Disable " + bold.Render(m.bundleConfirmName) + "?\n\nHook scripts will stop firing. Agentic content\nfrom this bundle will no longer be included."
	}

	confirmBtn := zone.Mark("bundle-confirm", btnPrimary.Render("▶ Confirm"))
	cancelBtn := zone.Mark("bundle-cancel", btnSecondary.Render("Cancel"))
	buttons := confirmBtn + "   " + cancelBtn

	inner := title + "\n\n" + body + "\n\n" + buttons

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1, 2).
		Render(inner)

	boxLines := strings.Split(box, "\n")
	boxH := len(boxLines)

	startY := len(lines)/2 - boxH/2
	if startY < 0 {
		startY = 0
	}

	for i, bl := range boxLines {
		row := startY + i
		if row < len(lines) {
			blW := lipgloss.Width(bl)
			pad := (w - blW) / 2
			if pad < 0 {
				pad = 0
			}
			lines[row] = strings.Repeat(" ", pad) + bl
		}
	}

	return lines
}

// ── Bundle Page Renderer ────────────────────────────────────────────

func (m *tuiModel) viewBundlePage(maxH int) string {
	output := m.bundlePageData[m.tab]

	if m.bundlePageLoading[m.tab] {
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render("Loading...")
	}

	if output == nil {
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render("Press r to load")
	}

	collapsed := m.bundlePageCollapsed[m.tab]
	if collapsed == nil {
		collapsed = make(map[int]bool)
		m.bundlePageCollapsed[m.tab] = collapsed
	}

	var lines []string

	for i, section := range output.Sections {
		arrow := "▾"
		if collapsed[i] {
			arrow = "▸"
		}

		header := fmt.Sprintf(" %s %s", arrow, bold.Render(section.Name))
		if section.Badge != "" {
			header += " " + dimStyle.Render("("+section.Badge+")")
		}
		lines = append(lines, zone.Mark(fmt.Sprintf("bp-section-%d-%d", m.tab, i), header))

		if !collapsed[i] {
			for _, item := range section.Items {
				line := "   " + item.Label
				if item.Detail != "" {
					line += "  " + dimStyle.Render(item.Detail)
				}
				if item.Badge != "" {
					line += "  " + item.Badge
				}
				lines = append(lines, line)
			}
		}

		lines = append(lines, "") // spacer between sections
	}

	// Status line at bottom
	if output.Status != "" {
		lines = append(lines, dimStyle.Render(" "+output.Status))
	}

	// Apply scroll
	scroll := m.bundlePageScroll[m.tab]
	if scroll > len(lines) {
		scroll = len(lines)
		m.bundlePageScroll[m.tab] = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.bundlePageScroll[m.tab] = 0
	}

	visible := lines
	if scroll < len(visible) {
		visible = visible[scroll:]
	} else {
		visible = nil
	}
	if len(visible) > maxH {
		visible = visible[:maxH]
	}

	// Pad to fill height
	for len(visible) < maxH {
		visible = append(visible, "")
	}

	// Truncate lines to terminal width
	for i, line := range visible {
		if lipgloss.Width(line) > m.width {
			visible[i] = ansi.Truncate(line, m.width, "…")
		}
	}

	return strings.Join(visible, "\n")
}

// ── Entry Point ─────────────────────────────────────────────────────

func runTUI() {
	zone.NewGlobal()
	p := tea.NewProgram(initialModel(), tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
