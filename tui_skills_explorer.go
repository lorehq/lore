package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	zone "github.com/lrstanley/bubblezone"
)

// ── Explore tab (wrapper with sub-tabs) ────────────────────────────

// viewExplore renders the Explore tab with a sub-tab bar and dispatches to the active sub-tab.
func (m *tuiModel) viewExplore(maxH int) string {
	// Bundle create modal takes over the entire explore area
	if m.bundleCreateActive {
		lines := make([]string, maxH)
		for i := range lines {
			lines[i] = ""
		}
		lines = m.overlayCreateBundleDialog(lines, m.width)
		return strings.Join(lines, "\n")
	}

	subTabBar := m.renderExploreSubTabs()
	subTabH := strings.Count(subTabBar, "\n") + 1
	contentH := maxH - subTabH
	if contentH < 1 {
		contentH = 1
	}

	var content string
	switch m.exploreSub {
	case exploreSubBundles:
		content = m.viewMarketplace(contentH)
	case exploreSubSkillsSh:
		content = m.viewSkillsExplorer(contentH)
	case exploreSubSkillsMP:
		content = m.viewSkillsMP(contentH)
	case exploreSubSmithery:
		content = m.viewSmithery(contentH)
	}

	// Safety clamp: ensure total output never exceeds maxH lines
	result := subTabBar + "\n" + content
	resultLines := strings.Split(result, "\n")
	if len(resultLines) > maxH {
		resultLines = resultLines[:maxH]
	}
	return strings.Join(resultLines, "\n")
}

// renderExploreSubTabs renders the sub-tab bar within the Explore tab.
func (m *tuiModel) renderExploreSubTabs() string {
	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}

	activeStyle := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1).
		Border(lipgloss.RoundedBorder(), true, true, false, true).
		BorderForeground(lipgloss.AdaptiveColor{Light: "0", Dark: "15"})

	inactiveStyle := lipgloss.NewStyle().
		Faint(true).
		Padding(0, 1).
		Border(lipgloss.RoundedBorder(), true, true, false, true).
		BorderForeground(borderFg)

	tabs := []struct {
		label  string
		zoneID string
		id     exploreSubTab
	}{
		{"Bundles", "explore-sub-bundles", exploreSubBundles},
		{"SkillsMP", "explore-sub-skillsmp", exploreSubSkillsMP},
		{"skills.sh", "explore-sub-skillssh", exploreSubSkillsSh},
		{"Smithery", "explore-sub-smithery", exploreSubSmithery},
	}

	var parts []string
	for _, t := range tabs {
		var rendered string
		if m.exploreSub == t.id {
			rendered = activeStyle.Render(t.label)
		} else {
			rendered = inactiveStyle.Render(t.label)
		}
		parts = append(parts, zone.Mark(t.zoneID, rendered))
	}

	tabBar := lipgloss.JoinHorizontal(lipgloss.Bottom, parts...)

	// Refresh button on the right
	refreshBtn := zone.Mark("mkt-refresh", dimStyle.Render(" \u21bb "))
	barW := lipgloss.Width(tabBar)
	btnW := lipgloss.Width(refreshBtn)
	gap := m.width - barW - btnW
	if gap < 1 {
		gap = 1
	}
	filler := lipgloss.NewStyle().Foreground(borderFg).Render(strings.Repeat("\u2500", gap))

	return lipgloss.JoinHorizontal(lipgloss.Bottom, tabBar, filler, refreshBtn)
}

// handleExploreKey dispatches keyboard input to the active Explore sub-tab.
func (m *tuiModel) handleExploreKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Bundle create modal intercepts all keys
	if m.bundleCreateActive {
		switch key {
		case "esc":
			m.bundleCreateActive = false
		case "enter":
			if m.bundleCreateName != "" && m.bundleCreateErr == "" {
				return m.finishBundleCreate()
			}
		case "backspace":
			if len(m.bundleCreateName) > 0 {
				m.bundleCreateName = m.bundleCreateName[:len(m.bundleCreateName)-1]
				m.bundleCreateErr = validateBundleSlug(m.bundleCreateName)
			}
		default:
			if len(key) == 1 && key[0] >= 32 && key[0] <= 126 {
				m.bundleCreateName += key
				m.bundleCreateErr = validateBundleSlug(m.bundleCreateName)
			}
		}
		return m, nil
	}

	// Tab/shift-tab cycles sub-tabs
	if key == "tab" {
		switch m.exploreSub {
		case exploreSubBundles:
			m.exploreSub = exploreSubSkillsMP
			return m, m.ensureSkillsMPLoaded()
		case exploreSubSkillsMP:
			m.exploreSub = exploreSubSkillsSh
			return m, m.ensureSkillsLoaded()
		case exploreSubSkillsSh:
			m.exploreSub = exploreSubSmithery
			return m, m.ensureSmitheryLoaded()
		case exploreSubSmithery:
			m.exploreSub = exploreSubBundles
			return m, nil
		}
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceKey(msg)
	case exploreSubSkillsSh:
		return m.handleSkillsExplorerKey(msg)
	case exploreSubSkillsMP:
		return m.handleSkillsMPKey(msg)
	case exploreSubSmithery:
		return m.handleSmitheryKey(msg)
	}
	return m, nil
}

// handleExploreMouse dispatches mouse input to the active Explore sub-tab.
func (m *tuiModel) handleExploreMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Bundle create modal intercepts all clicks
	if m.bundleCreateActive {
		if zone.Get("bundle-create-confirm").InBounds(msg) {
			if m.bundleCreateName != "" && m.bundleCreateErr == "" {
				return m.finishBundleCreate()
			}
		}
		if zone.Get("bundle-create-cancel").InBounds(msg) {
			m.bundleCreateActive = false
		}
		return m, nil
	}

	// Refresh button — dispatches to active sub-tab
	if zone.Get("mkt-refresh").InBounds(msg) {
		switch m.exploreSub {
		case exploreSubBundles:
			m.mktLoading = true
			m.mktLoaded = false
			return m, loadMarketplace()
		case exploreSubSkillsSh:
			m.skillsResults = nil
			m.skillsLoading = true
			m.skillsScroll = 0
			m.skillsInitLoaded = true
			return m, loadSkillsLeaderboard()
		case exploreSubSkillsMP:
			if m.skillsMPAPIKey != "" {
				m.skillsMPResults = nil
				m.skillsMPLoading = true
				m.skillsMPScroll = 0
				m.skillsMPInitLoaded = true
				return m, loadSkillsMPTop(m.skillsMPAPIKey)
			}
		case exploreSubSmithery:
			m.smitheryResults = nil
			m.smitheryLoading = true
			m.smitheryScroll = 0
			m.smitheryInitLoaded = true
			return m, loadSmitheryTop()
		}
		return m, nil
	}

	// Sub-tab clicks
	if zone.Get("explore-sub-bundles").InBounds(msg) {
		m.exploreSub = exploreSubBundles
		if !m.mktLoaded && !m.mktLoading {
			m.mktLoading = true
			return m, loadMarketplace()
		}
		return m, nil
	}
	if zone.Get("explore-sub-skillssh").InBounds(msg) {
		m.exploreSub = exploreSubSkillsSh
		return m, m.ensureSkillsLoaded()
	}
	if zone.Get("explore-sub-skillsmp").InBounds(msg) {
		m.exploreSub = exploreSubSkillsMP
		return m, m.ensureSkillsMPLoaded()
	}
	if zone.Get("explore-sub-smithery").InBounds(msg) {
		m.exploreSub = exploreSubSmithery
		return m, m.ensureSmitheryLoaded()
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceMouse(msg)
	case exploreSubSkillsSh:
		return m.handleSkillsExplorerMouse(msg)
	case exploreSubSkillsMP:
		return m.handleSkillsMPMouse(msg)
	case exploreSubSmithery:
		return m.handleSmitheryMouse(msg)
	}
	return m, nil
}

// ensureSkillsLoaded triggers the initial leaderboard load if not done yet.
func (m *tuiModel) ensureSkillsLoaded() tea.Cmd {
	if m.skillsInitLoaded || m.skillsLoading {
		return nil
	}
	m.skillsInitLoaded = true
	m.skillsLoading = true
	return loadSkillsLeaderboard()
}

// ── skills.sh sub-tab ──────────────────────────────────────────────

// formatInstalls formats install counts with K/M suffixes.
func formatInstalls(n int) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	}
	return fmt.Sprintf("%d", n)
}

// skillGitHubURL returns the display text for a skill's GitHub URL.
func skillGitHubURL(r skillsResult) string {
	return "github.com/" + r.Source
}

// skillHyperlink returns an OSC 8 terminal hyperlink for a skill's repo.
// skills.sh skill names don't map 1:1 to directory paths (e.g. "vercel-react-best-practices"
// lives at skills/react-best-practices), so we link to the repo root.
func skillHyperlink(r skillsResult) string {
	display := "github.com/" + r.Source
	linkURL := "https://" + display
	return fmt.Sprintf("\033]8;;%s\033\\%s\033]8;;\033\\", linkURL, display)
}

// skillsShCardLines builds the content lines for a skills.sh skill card.
func skillsShCardLines(r skillsResult, innerW int) []string {
	var content []string

	// Row 1: name + installs + [+ Add]
	nameStr := bold.Render(r.Name)
	installs := formatInstalls(r.Installs) + " installs"
	addBtn := zone.Mark("skills-add-"+r.ID, greenStyle.Render("[+ Add]"))
	rightSide := dimStyle.Render(installs) + "  " + addBtn
	nameW := lipgloss.Width(nameStr)
	rightW := lipgloss.Width(rightSide)
	gap := innerW - nameW - rightW
	if gap < 1 {
		gap = 1
	}
	content = append(content, nameStr+strings.Repeat(" ", gap)+rightSide)

	// Row 2: author (extracted from source org/user) + source URL
	var metaParts []string
	if r.Source != "" {
		parts := strings.SplitN(r.Source, "/", 2)
		if len(parts) > 0 {
			metaParts = append(metaParts, "by "+parts[0])
		}
	}
	source := skillHyperlink(r)
	metaParts = append(metaParts, source)
	content = append(content, dimStyle.Render(strings.Join(metaParts, "  ")))

	return content
}

// viewSkillsExplorer renders the skills.sh leaderboard view.
func (m *tuiModel) viewSkillsExplorer(maxH int) string {
	// Target picker overlay
	if m.skillsAddActive {
		return m.overlaySkillsTargetPicker(maxH)
	}

	var lines []string

	// Header
	lines = append(lines, " "+bold.Render("SKILLS LEADERBOARD")+"  "+dimStyle.Render("skills.sh"))
	lines = append(lines, "")

	// Search bar
	var searchContent string
	if m.skillsSearchActive {
		searchContent = " \U0001f50d  " + m.skillsSearch + "\u2588"
	} else if m.skillsSearch != "" {
		searchContent = " \U0001f50d  " + m.skillsSearch + "  " + zone.Mark("skills-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchContent = dimStyle.Render(" \U0001f50d  Search skills ...")
	}
	searchBox := zone.Mark("skills-search-bar", searchContent)

	slashHint := dimStyle.Render("/")
	searchGap := m.width - lipgloss.Width(searchContent) - lipgloss.Width(slashHint) - 2
	if searchGap < 1 {
		searchGap = 1
	}
	lines = append(lines, " "+searchBox+strings.Repeat(" ", searchGap)+slashHint+" ")

	// Separator
	lines = append(lines, dimStyle.Render(" "+strings.Repeat("\u2500", m.width-2)))
	lines = append(lines, "")

	// Table content
	if m.skillsLoading {
		lines = append(lines, dimStyle.Render("  Loading..."))
	} else if len(m.skillsResults) == 0 && m.skillsSearch != "" {
		lines = append(lines, dimStyle.Render(fmt.Sprintf("  No results for \"%s\"", m.skillsSearch)))
	} else if len(m.skillsResults) == 0 {
		lines = append(lines, dimStyle.Render("  Loading leaderboard..."))
	} else {
		// Card inner width: fullWidth - 4 (margin) - 2 (border) - 2 (padding)
		innerW := m.width - 8
		if innerW < 20 {
			innerW = 20
		}

		for _, r := range m.skillsResults {
			cardContent := skillsShCardLines(r, innerW)
			cardLines := renderCard(cardContent, m.width)
			lines = append(lines, cardLines...)
		}
	}

	// Apply scroll
	scroll := m.skillsScroll
	if scroll > len(lines) {
		scroll = len(lines)
		m.skillsScroll = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.skillsScroll = 0
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
	for len(visible) < maxH {
		visible = append(visible, "")
	}
	for i, line := range visible {
		if lipgloss.Width(line) > m.width {
			visible[i] = ansi.Truncate(line, m.width, "\u2026")
		}
	}

	return strings.Join(visible, "\n")
}

// handleSkillsExplorerKey handles keyboard input on the skills.sh sub-tab.
func (m *tuiModel) handleSkillsExplorerKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Target picker intercepts
	if m.skillsAddActive {
		switch key {
		case "esc":
			m.skillsAddActive = false
		case "j", "down":
			if m.skillsAddCursor < len(m.skillsAddTargets)-1 {
				m.skillsAddCursor++
			}
		case "k", "up":
			if m.skillsAddCursor > 0 {
				m.skillsAddCursor--
			}
		case "enter":
			targetDir := m.skillsAddPaths[m.skillsAddCursor]
			if targetDir == createNewBundleSentinel {
				m.bundleCreateActive = true
				m.bundleCreateName = ""
				m.bundleCreateErr = ""
				m.bundleCreateCallback = "skills"
				m.bundleCreateKind = "SKILLS"
				return m, nil
			}
			m.skillsAddActive = false
			m.skillsImporting = true
			m.skillsImportName = m.skillsAddItem.Name
			m.notify("Importing "+m.skillsAddItem.Name+"...", "info")
			source := m.skillsAddItem.Source
			skillName := m.skillsAddItem.Name
			return m, doSkillImport(source, skillName, targetDir, source)
		}
		return m, nil
	}

	// Search mode
	if m.skillsSearchActive {
		switch key {
		case "esc":
			m.skillsSearchActive = false
		case "enter":
			m.skillsSearchActive = false
			if m.skillsSearch != "" {
				m.skillsLoading = true
				m.skillsScroll = 0
				return m, searchSkills(m.skillsSearch)
			}
		case "backspace":
			if len(m.skillsSearch) > 0 {
				m.skillsSearch = m.skillsSearch[:len(m.skillsSearch)-1]
			}
		default:
			if len(key) == 1 && key[0] >= 32 && key[0] <= 126 {
				m.skillsSearch += key
			}
		}
		return m, nil
	}

	switch key {
	case "/":
		m.skillsSearchActive = true
		m.skillsSearch = ""
	case "esc":
		if m.skillsSearch != "" {
			m.skillsSearch = ""
			m.skillsResults = nil
			m.skillsLoading = true
			m.skillsScroll = 0
			return m, loadSkillsLeaderboard()
		}
	case "j", "down":
		m.skillsScroll++
	case "k", "up":
		if m.skillsScroll > 0 {
			m.skillsScroll--
		}
	}

	return m, nil
}

// handleSkillsExplorerMouse handles mouse clicks on the skills.sh sub-tab.
func (m *tuiModel) handleSkillsExplorerMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Search bar click
	if zone.Get("skills-search-bar").InBounds(msg) {
		m.skillsSearchActive = true
		m.skillsSearch = ""
		return m, nil
	}

	// Clear search
	if zone.Get("skills-clear-search").InBounds(msg) {
		m.skillsSearch = ""
		m.skillsSearchActive = false
		m.skillsResults = nil
		m.skillsLoading = true
		m.skillsScroll = 0
		return m, loadSkillsLeaderboard()
	}

	// Target picker clicks
	if m.skillsAddActive {
		for i := range m.skillsAddTargets {
			if zone.Get(fmt.Sprintf("skills-target-%d", i)).InBounds(msg) {
				targetDir := m.skillsAddPaths[i]
				if targetDir == createNewBundleSentinel {
					m.bundleCreateActive = true
					m.bundleCreateName = ""
					m.bundleCreateErr = ""
					m.bundleCreateCallback = "skills"
					m.bundleCreateKind = "SKILLS"
					return m, nil
				}
				m.skillsAddActive = false
				m.skillsImporting = true
				m.skillsImportName = m.skillsAddItem.Name
				source := m.skillsAddItem.Source
				skillName := m.skillsAddItem.Name
				return m, doSkillImport(source, skillName, targetDir, source)
			}
		}
		if zone.Get("skills-target-cancel").InBounds(msg) {
			m.skillsAddActive = false
			return m, nil
		}
		return m, nil
	}

	// Add buttons
	for _, r := range m.skillsResults {
		if zone.Get("skills-add-"+r.ID).InBounds(msg) {
			m.skillsAddActive = true
			m.skillsAddItem = r
			m.skillsAddCursor = 0
			m.buildSkillTargets()
			return m, nil
		}
	}

	return m, nil
}

// ── SkillsMP sub-tab ────────────────────────────────────────────────

// resolveSkillsMPKey checks env var then global config for the API key.
func resolveSkillsMPKey() string {
	if key := os.Getenv("SKILLSMP_API_KEY"); key != "" {
		return key
	}
	configPath := filepath.Join(globalPath(), "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return ""
	}
	data = stripJSONComments(data)
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ""
	}
	if key, ok := cfg["skillsmp_api_key"].(string); ok {
		return key
	}
	return ""
}

// saveSkillsMPKey writes the API key to global config.
func saveSkillsMPKey(key string) tea.Cmd {
	return func() tea.Msg {
		configPath := filepath.Join(globalPath(), "config.json")

		var cfg map[string]interface{}

		data, err := os.ReadFile(configPath)
		if err == nil {
			data = stripJSONComments(data)
			if err := json.Unmarshal(data, &cfg); err != nil {
				cfg = make(map[string]interface{})
			}
		} else {
			cfg = make(map[string]interface{})
		}

		// Strip brackets/whitespace that may be copied from the website
		key = strings.TrimSpace(key)
		key = strings.Trim(key, "[]")
		cfg["skillsmp_api_key"] = key

		out, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return skillsMPKeySavedMsg{err: err}
		}
		if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
			return skillsMPKeySavedMsg{err: err}
		}
		if err := os.WriteFile(configPath, out, 0644); err != nil {
			return skillsMPKeySavedMsg{err: err}
		}
		return skillsMPKeySavedMsg{}
	}
}

// ensureSkillsMPLoaded resolves the API key and triggers initial load on first access.
func (m *tuiModel) ensureSkillsMPLoaded() tea.Cmd {
	if m.skillsMPAPIKey == "" {
		m.skillsMPAPIKey = resolveSkillsMPKey()
	}
	if m.skillsMPAPIKey == "" {
		return nil // no key, show auth screen
	}
	if m.skillsMPInitLoaded || m.skillsMPLoading {
		return nil
	}
	m.skillsMPInitLoaded = true
	m.skillsMPLoading = true
	return loadSkillsMPTop(m.skillsMPAPIKey)
}

// skillsMPHyperlink returns an OSC 8 terminal hyperlink.
func skillsMPHyperlink(url, display string) string {
	return fmt.Sprintf("\033]8;;%s\033\\%s\033]8;;\033\\", url, display)
}

// skillsMPCardLines builds the content lines for a SkillsMP skill card.
func skillsMPCardLines(r skillsMPResult, innerW int) []string {
	var content []string

	// Row 1: name + stars + [+ Add]
	nameStr := bold.Render(r.Name)
	stars := formatStars(r.Stars)
	addBtn := zone.Mark("smp-add-"+r.Name, greenStyle.Render("[+ Add]"))
	rightSide := dimStyle.Render(stars) + "  " + addBtn
	nameW := lipgloss.Width(nameStr)
	rightW := lipgloss.Width(rightSide)
	gap := innerW - nameW - rightW
	if gap < 1 {
		gap = 1
	}
	content = append(content, nameStr+strings.Repeat(" ", gap)+rightSide)

	// Row 2: description (truncated)
	if r.Description != "" {
		desc := strings.ReplaceAll(strings.ReplaceAll(r.Description, "\n", " "), "\r", "")
		if len(desc) > innerW {
			desc = desc[:innerW-1] + "\u2026"
		}
		content = append(content, dimStyle.Render(desc))
	}

	// Row 3: author + source link
	var metaParts []string
	if r.Author != "" {
		metaParts = append(metaParts, "by "+r.Author)
	}
	if r.GithubURL != "" {
		display := r.GithubURL
		if strings.HasPrefix(display, "https://") {
			display = display[8:]
		}
		metaParts = append(metaParts, skillsMPHyperlink(r.GithubURL, display))
	}
	if len(metaParts) > 0 {
		content = append(content, dimStyle.Render(strings.Join(metaParts, "  ")))
	}

	return content
}

// viewSkillsMP renders the SkillsMP sub-tab.
func (m *tuiModel) viewSkillsMP(maxH int) string {
	if m.skillsMPAPIKey == "" {
		return m.viewSkillsMPAuth(maxH)
	}
	return m.viewSkillsMPSearch(maxH)
}

// viewSkillsMPAuth renders the API key setup screen.
func (m *tuiModel) viewSkillsMPAuth(maxH int) string {
	var lines []string
	lines = append(lines, "")
	lines = append(lines, " "+bold.Render("SkillsMP")+"   "+dimStyle.Render("skillsmp.com"))
	lines = append(lines, "")
	lines = append(lines, dimStyle.Render("  API key required to search 66,500+ agent skills."))
	lines = append(lines, "")

	// Clickable hyperlink
	linkURL := "https://skillsmp.com/docs/api"
	linkDisplay := "Get your free key"
	hyperlink := skillsMPHyperlink(linkURL, linkDisplay)
	lines = append(lines, "  "+hyperlink+" \u2192 "+dimStyle.Render(linkURL))
	lines = append(lines, "")

	// Key input (always focused on auth screen)
	displayed := m.skillsMPKeyBuf
	if len(displayed) > 12 {
		displayed = displayed[:12] + strings.Repeat("*", len(displayed)-12)
	}
	inputLine := "  Paste key: " + displayed + "\u2588"
	lines = append(lines, inputLine)
	lines = append(lines, "")

	// Save button
	var saveBtn string
	if m.skillsMPKeyBuf != "" {
		saveBtn = zone.Mark("smp-key-save", btnPrimary.Render(" Save "))
	} else {
		saveBtn = btnDisabled.Render(" Save ")
	}
	lines = append(lines, strings.Repeat(" ", 40)+saveBtn)

	for len(lines) < maxH {
		lines = append(lines, "")
	}
	if len(lines) > maxH {
		lines = lines[:maxH]
	}

	return strings.Join(lines, "\n")
}

// viewSkillsMPSearch renders the search view with results.
func (m *tuiModel) viewSkillsMPSearch(maxH int) string {
	// Target picker overlay
	if m.skillsMPAddActive {
		return m.overlaySkillsMPTargetPicker(maxH)
	}

	var lines []string

	// Header
	lines = append(lines, " "+bold.Render("SKILLSMP SEARCH")+"  "+dimStyle.Render("skillsmp.com"))
	lines = append(lines, "")

	// Search bar
	var searchContent string
	if m.skillsMPSearchMode {
		searchContent = " /  " + m.skillsMPSearchBuf + "\u2588"
	} else if m.skillsMPQuery != "" {
		searchContent = " /  " + m.skillsMPQuery + "  " + zone.Mark("smp-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchContent = dimStyle.Render(" /  Press / to search skills")
	}
	searchBox := zone.Mark("smp-search-bar", searchContent)

	slashHint := dimStyle.Render("/")
	searchGap := m.width - lipgloss.Width(searchContent) - lipgloss.Width(slashHint) - 2
	if searchGap < 1 {
		searchGap = 1
	}
	lines = append(lines, " "+searchBox+strings.Repeat(" ", searchGap)+slashHint+" ")

	// Separator
	lines = append(lines, dimStyle.Render(" "+strings.Repeat("\u2500", m.width-2)))
	lines = append(lines, "")

	// Category chips (shown above results when no active search query)
	if m.skillsMPQuery == "" && len(m.skillsMPResults) > 0 {
		categories := []struct{ name, query string }{
			{"Tools", "tools"},
			{"Development", "development"},
			{"Business", "business"},
			{"Data & AI", "data ai"},
			{"DevOps", "devops"},
			{"Test & Security", "testing security"},
			{"Documentation", "documentation"},
			{"Content & Media", "content media"},
		}
		chipStyle := lipgloss.NewStyle().Padding(0, 1).Border(lipgloss.NormalBorder(), false, true, false, true).BorderForeground(lipgloss.AdaptiveColor{Light: "236", Dark: "248"})

		var row []string
		rowW := 2
		for i, cat := range categories {
			chip := zone.Mark(fmt.Sprintf("smp-cat-%d", i), chipStyle.Render(cat.name))
			chipW := lipgloss.Width(chip) + 1
			if rowW+chipW > m.width-2 && len(row) > 0 {
				lines = append(lines, "  "+strings.Join(row, " "))
				row = nil
				rowW = 2
			}
			row = append(row, chip)
			rowW += chipW
		}
		if len(row) > 0 {
			lines = append(lines, "  "+strings.Join(row, " "))
		}
		lines = append(lines, "")
	}

	// Content
	if m.skillsMPLoading {
		lines = append(lines, dimStyle.Render("  Loading..."))
	} else if m.skillsMPError != "" {
		lines = append(lines, errStyle.Render("  Error: "+m.skillsMPError))
	} else if len(m.skillsMPResults) == 0 && m.skillsMPQuery != "" {
		lines = append(lines, dimStyle.Render(fmt.Sprintf("  No results for \"%s\"", m.skillsMPQuery)))
	} else if len(m.skillsMPResults) == 0 {
		// No API key loaded yet or initial load hasn't started — show category chips as landing
		categories := []struct{ name, query string }{
			{"Tools", "tools"},
			{"Development", "development"},
			{"Business", "business"},
			{"Data & AI", "data ai"},
			{"DevOps", "devops"},
			{"Test & Security", "testing security"},
			{"Documentation", "documentation"},
			{"Content & Media", "content media"},
		}
		chipStyle := lipgloss.NewStyle().Padding(0, 1).Border(lipgloss.NormalBorder(), false, true, false, true).BorderForeground(lipgloss.AdaptiveColor{Light: "236", Dark: "248"})
		lines = append(lines, dimStyle.Render("  Browse by category"))
		lines = append(lines, "")

		var row []string
		rowW := 2
		for i, cat := range categories {
			chip := zone.Mark(fmt.Sprintf("smp-cat-%d", i), chipStyle.Render(cat.name))
			chipW := lipgloss.Width(chip) + 1
			if rowW+chipW > m.width-2 && len(row) > 0 {
				lines = append(lines, "  "+strings.Join(row, " "))
				row = nil
				rowW = 2
			}
			row = append(row, chip)
			rowW += chipW
		}
		if len(row) > 0 {
			lines = append(lines, "  "+strings.Join(row, " "))
		}
		lines = append(lines, "")
		lines = append(lines, dimStyle.Render("  400,000+ agent skills  \u2022  Press / to search"))
	} else {
		// Card inner width: fullWidth - 4 (margin) - 2 (border) - 2 (padding)
		innerW := m.width - 8
		if innerW < 20 {
			innerW = 20
		}

		for _, r := range m.skillsMPResults {
			cardContent := skillsMPCardLines(r, innerW)
			cardLines := renderCard(cardContent, m.width)
			lines = append(lines, cardLines...)
		}
	}

	// Apply scroll
	scroll := m.skillsMPScroll
	if scroll > len(lines) {
		scroll = len(lines)
		m.skillsMPScroll = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.skillsMPScroll = 0
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
	for len(visible) < maxH {
		visible = append(visible, "")
	}
	for i, line := range visible {
		if lipgloss.Width(line) > m.width {
			visible[i] = ansi.Truncate(line, m.width, "\u2026")
		}
	}

	return strings.Join(visible, "\n")
}

// formatStars formats star counts with K/M suffixes.
func formatStars(n int) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM \u2605", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%.1fK \u2605", float64(n)/1_000)
	}
	return fmt.Sprintf("%d \u2605", n)
}

// handleSkillsMPKey handles keyboard input on the SkillsMP sub-tab.
func (m *tuiModel) handleSkillsMPKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Auth screen: key input is always focused (nothing else to do here)
	if m.skillsMPAPIKey == "" {
		if !m.skillsMPKeyFocus {
			m.skillsMPKeyFocus = true
		}
		switch key {
		case "esc":
			m.skillsMPKeyFocus = false
		case "enter":
			if m.skillsMPKeyBuf != "" {
				m.skillsMPAPIKey = m.skillsMPKeyBuf
				m.skillsMPKeyFocus = false
				return m, saveSkillsMPKey(m.skillsMPKeyBuf)
			}
		case "backspace":
			if len(m.skillsMPKeyBuf) > 0 {
				m.skillsMPKeyBuf = m.skillsMPKeyBuf[:len(m.skillsMPKeyBuf)-1]
			}
		default:
			// Accept all printable characters (supports paste)
			for _, r := range key {
				if r >= 32 && r < 127 {
					m.skillsMPKeyBuf += string(r)
				}
			}
		}
		return m, nil
	}

	// Target picker intercepts
	if m.skillsMPAddActive {
		switch key {
		case "esc":
			m.skillsMPAddActive = false
		case "j", "down":
			if m.skillsMPAddCursor < len(m.skillsMPAddTargets)-1 {
				m.skillsMPAddCursor++
			}
		case "k", "up":
			if m.skillsMPAddCursor > 0 {
				m.skillsMPAddCursor--
			}
		case "enter":
			targetDir := m.skillsMPAddPaths[m.skillsMPAddCursor]
			if targetDir == createNewBundleSentinel {
				m.bundleCreateActive = true
				m.bundleCreateName = ""
				m.bundleCreateErr = ""
				m.bundleCreateCallback = "skillsmp"
				m.bundleCreateKind = "SKILLS"
				return m, nil
			}
			m.skillsMPAddActive = false
			m.skillsMPImporting = true
			m.skillsMPImportName = m.skillsMPAddItem.Name
			source := m.skillsMPAddItem.GithubURL
			if source == "" {
				source = m.skillsMPAddItem.SkillURL
			}
			skillName := m.skillsMPAddItem.Name
			return m, doSkillsMPImport(source, skillName, targetDir)
		}
		return m, nil
	}

	// Search mode
	if m.skillsMPSearchMode {
		switch key {
		case "esc":
			m.skillsMPSearchMode = false
		case "enter":
			m.skillsMPSearchMode = false
			if m.skillsMPSearchBuf != "" {
				m.skillsMPQuery = m.skillsMPSearchBuf
				m.skillsMPLoading = true
				m.skillsMPScroll = 0
				return m, searchSkillsMP(m.skillsMPQuery, m.skillsMPAPIKey)
			}
		case "backspace":
			if len(m.skillsMPSearchBuf) > 0 {
				m.skillsMPSearchBuf = m.skillsMPSearchBuf[:len(m.skillsMPSearchBuf)-1]
			}
		default:
			if len(key) == 1 && key[0] >= 32 && key[0] <= 126 {
				m.skillsMPSearchBuf += key
			}
		}
		return m, nil
	}

	switch key {
	case "/":
		m.skillsMPSearchMode = true
		m.skillsMPSearchBuf = ""
	case "esc":
		if m.skillsMPQuery != "" {
			m.skillsMPQuery = ""
			m.skillsMPResults = nil
			m.skillsMPScroll = 0
			// Reload top 100
			m.skillsMPLoading = true
			return m, loadSkillsMPTop(m.skillsMPAPIKey)
		}
	case "j", "down":
		m.skillsMPScroll++
	case "k", "up":
		if m.skillsMPScroll > 0 {
			m.skillsMPScroll--
		}
	}

	return m, nil
}

// handleSkillsMPMouse handles mouse clicks on the SkillsMP sub-tab.
func (m *tuiModel) handleSkillsMPMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Auth screen clicks
	if m.skillsMPAPIKey == "" {
		if zone.Get("smp-key-input").InBounds(msg) {
			m.skillsMPKeyFocus = true
			m.skillsMPKeyBuf = ""
			return m, nil
		}
		if zone.Get("smp-key-save").InBounds(msg) && m.skillsMPKeyBuf != "" {
			m.skillsMPAPIKey = m.skillsMPKeyBuf
			m.skillsMPKeyFocus = false
			return m, saveSkillsMPKey(m.skillsMPKeyBuf)
		}
		return m, nil
	}

	// Search bar click
	if zone.Get("smp-search-bar").InBounds(msg) {
		m.skillsMPSearchMode = true
		m.skillsMPSearchBuf = ""
		return m, nil
	}

	// Clear search
	if zone.Get("smp-clear-search").InBounds(msg) {
		m.skillsMPQuery = ""
		m.skillsMPSearchMode = false
		m.skillsMPResults = nil
		m.skillsMPScroll = 0
		// Reload top 100
		m.skillsMPLoading = true
		return m, loadSkillsMPTop(m.skillsMPAPIKey)
	}

	// Category chip clicks
	categoryQueries := []string{"tools", "development", "business", "data ai", "devops", "testing security", "documentation", "content media"}
	for i, q := range categoryQueries {
		if zone.Get(fmt.Sprintf("smp-cat-%d", i)).InBounds(msg) {
			m.skillsMPQuery = q
			m.skillsMPSearchMode = false
			m.skillsMPScroll = 0
			m.skillsMPLoading = true
			m.skillsMPResults = nil
			return m, searchSkillsMP(q, m.skillsMPAPIKey)
		}
	}

	// Target picker clicks
	if m.skillsMPAddActive {
		for i := range m.skillsMPAddTargets {
			if zone.Get(fmt.Sprintf("smp-target-%d", i)).InBounds(msg) {
				targetDir := m.skillsMPAddPaths[i]
				if targetDir == createNewBundleSentinel {
					m.bundleCreateActive = true
					m.bundleCreateName = ""
					m.bundleCreateErr = ""
					m.bundleCreateCallback = "skillsmp"
					m.bundleCreateKind = "SKILLS"
					return m, nil
				}
				m.skillsMPAddActive = false
				m.skillsMPImporting = true
				m.skillsMPImportName = m.skillsMPAddItem.Name
				source := m.skillsMPAddItem.GithubURL
				if source == "" {
					source = m.skillsMPAddItem.SkillURL
				}
				skillName := m.skillsMPAddItem.Name
				return m, doSkillsMPImport(source, skillName, targetDir)
			}
		}
		if zone.Get("smp-target-cancel").InBounds(msg) {
			m.skillsMPAddActive = false
			return m, nil
		}
		return m, nil
	}

	// Add buttons
	for _, r := range m.skillsMPResults {
		if zone.Get("smp-add-"+r.Name).InBounds(msg) {
			m.skillsMPAddActive = true
			m.skillsMPAddItem = r
			m.skillsMPAddCursor = 0
			m.buildSkillsMPTargets()
			return m, nil
		}
	}

	return m, nil
}

// overlaySkillsMPTargetPicker renders a centered target picker dialog for SkillsMP.
func (m *tuiModel) overlaySkillsMPTargetPicker(maxH int) string {
	title := bold.Render(fmt.Sprintf("Add %s to:", m.skillsMPAddItem.Name))

	selectedStyle := lipgloss.NewStyle().Bold(true).Reverse(true)

	var targetLines []string
	for i, label := range m.skillsMPAddTargets {
		if i == m.skillsMPAddCursor {
			line := selectedStyle.Render("\u25b8 " + label)
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("smp-target-%d", i), line))
		} else {
			line := "  " + label
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("smp-target-%d", i), line))
		}
	}

	cancelBtn := zone.Mark("smp-target-cancel", btnSecondary.Render(" Cancel "))

	dialogW := 44
	if m.width < 54 {
		dialogW = m.width - 6
	}

	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}
	dialogBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(1, 2).
		Width(dialogW)

	content := title + "\n\n" + strings.Join(targetLines, "\n") + "\n\n" + cancelBtn
	rendered := dialogBox.Render(content)

	return lipgloss.NewStyle().
		Width(m.width).
		Height(maxH).
		Align(lipgloss.Center, lipgloss.Center).
		Render(rendered)
}

// buildSkillsMPTargets populates the target picker with available destinations.
func (m *tuiModel) buildSkillsMPTargets() {
	m.skillsMPAddTargets = nil
	m.skillsMPAddPaths = nil
	m.skillsMPAddIcons = nil

	m.skillsMPAddTargets = append(m.skillsMPAddTargets, "Project")
	m.skillsMPAddPaths = append(m.skillsMPAddPaths, filepath.Join(".lore", "SKILLS"))
	m.skillsMPAddIcons = append(m.skillsMPAddIcons, "")

	m.skillsMPAddTargets = append(m.skillsMPAddTargets, "Global")
	m.skillsMPAddPaths = append(m.skillsMPAddPaths, filepath.Join(globalPath(), "SKILLS"))
	m.skillsMPAddIcons = append(m.skillsMPAddIcons, "")

	bundles := discoverBundles()
	for _, b := range bundles {
		gitDir := filepath.Join(b.Dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			continue
		}
		m.skillsMPAddTargets = append(m.skillsMPAddTargets, b.Name)
		m.skillsMPAddPaths = append(m.skillsMPAddPaths, filepath.Join(b.Dir, "SKILLS"))
		m.skillsMPAddIcons = append(m.skillsMPAddIcons, "")
	}

	m.skillsMPAddTargets = append(m.skillsMPAddTargets, "Create new bundle...")
	m.skillsMPAddPaths = append(m.skillsMPAddPaths, createNewBundleSentinel)
	m.skillsMPAddIcons = append(m.skillsMPAddIcons, "")
}

// ── SkillsMP async commands ─────────────────────────────────────────

// loadSkillsMPTop fires multiple broad queries to approximate a top-100 leaderboard.
func loadSkillsMPTop(apiKey string) tea.Cmd {
	return func() tea.Msg {
		queries := []string{"tools", "development", "devops", "testing", "security", "data", "api", "business", "documentation", "content"}
		seen := map[string]bool{}
		var all []skillsMPResult

		client := &http.Client{Timeout: 10 * time.Second}

		for _, q := range queries {
			apiURL := fmt.Sprintf("https://skillsmp.com/api/v1/skills/search?q=%s&limit=30&sortBy=stars",
				url.QueryEscape(q))

			req, err := http.NewRequest("GET", apiURL, nil)
			if err != nil {
				continue
			}
			req.Header.Set("Authorization", "Bearer "+apiKey)
			req.Header.Set("Accept", "application/json")

			resp, err := client.Do(req)
			if err != nil {
				continue
			}
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != 200 || err != nil {
				continue
			}

			var result struct {
				Data struct {
					Skills []skillsMPResult `json:"skills"`
				} `json:"data"`
			}
			if err := json.Unmarshal(body, &result); err != nil {
				continue
			}
			for _, s := range result.Data.Skills {
				if !seen[s.Name] {
					seen[s.Name] = true
					all = append(all, s)
				}
			}
		}

		sort.Slice(all, func(i, j int) bool {
			return all[i].Stars > all[j].Stars
		})

		if len(all) > 100 {
			all = all[:100]
		}

		return skillsMPSearchMsg{results: all}
	}
}

// searchSkillsMP fetches skill search results from the SkillsMP API.
func searchSkillsMP(query, apiKey string) tea.Cmd {
	return func() tea.Msg {
		apiURL := fmt.Sprintf("https://skillsmp.com/api/v1/skills/search?q=%s&limit=20&sortBy=stars",
			url.QueryEscape(query))

		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return skillsMPSearchMsg{err: fmt.Errorf("request failed: %w", err)}
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Accept", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return skillsMPSearchMsg{err: fmt.Errorf("search failed: %w", err)}
		}
		defer resp.Body.Close()

		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return skillsMPSearchMsg{err: fmt.Errorf("invalid API key (HTTP %d)", resp.StatusCode)}
		}
		if resp.StatusCode != 200 {
			return skillsMPSearchMsg{err: fmt.Errorf("search returned HTTP %d", resp.StatusCode)}
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return skillsMPSearchMsg{err: err}
		}

		var result struct {
			Data struct {
				Skills []skillsMPResult `json:"skills"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return skillsMPSearchMsg{err: fmt.Errorf("invalid response: %w", err)}
		}

		return skillsMPSearchMsg{results: result.Data.Skills}
	}
}

// doSkillsMPImport runs a skill import for a SkillsMP skill.
func doSkillsMPImport(source, skillName, targetDir string) tea.Cmd {
	return func() tea.Msg {
		err := importSkillToTarget(source, skillName, targetDir, source)
		return skillsImportDoneMsg{skill: skillName, err: err}
	}
}

// ── Target picker ──────────────────────────────────────────────────

// overlaySkillsTargetPicker renders a centered target picker dialog.
func (m *tuiModel) overlaySkillsTargetPicker(maxH int) string {
	title := bold.Render(fmt.Sprintf("Add %s to:", m.skillsAddItem.Name))

	selectedStyle := lipgloss.NewStyle().Bold(true).Reverse(true)

	var targetLines []string
	for i, label := range m.skillsAddTargets {
		if i == m.skillsAddCursor {
			line := selectedStyle.Render("\u25b8 " + label)
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("skills-target-%d", i), line))
		} else {
			line := "  " + label
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("skills-target-%d", i), line))
		}
	}

	cancelBtn := zone.Mark("skills-target-cancel", btnSecondary.Render(" Cancel "))

	dialogW := 44
	if m.width < 54 {
		dialogW = m.width - 6
	}

	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}
	dialogBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(1, 2).
		Width(dialogW)

	content := title + "\n\n" + strings.Join(targetLines, "\n") + "\n\n" + cancelBtn
	rendered := dialogBox.Render(content)

	return lipgloss.NewStyle().
		Width(m.width).
		Height(maxH).
		Align(lipgloss.Center, lipgloss.Center).
		Render(rendered)
}

// buildSkillTargets populates the target picker with available destinations.
func (m *tuiModel) buildSkillTargets() {
	m.skillsAddTargets = nil
	m.skillsAddPaths = nil
	m.skillsAddIcons = nil

	m.skillsAddTargets = append(m.skillsAddTargets, "Project")
	m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(".lore", "SKILLS"))
	m.skillsAddIcons = append(m.skillsAddIcons, "")

	m.skillsAddTargets = append(m.skillsAddTargets, "Global")
	m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(globalPath(), "SKILLS"))
	m.skillsAddIcons = append(m.skillsAddIcons, "")

	// Only show user-created bundles (no .git = not installed from registry)
	bundles := discoverBundles()
	for _, b := range bundles {
		gitDir := filepath.Join(b.Dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			continue // skip registry-installed bundles
		}
		m.skillsAddTargets = append(m.skillsAddTargets, b.Name)
		m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(b.Dir, "SKILLS"))
		m.skillsAddIcons = append(m.skillsAddIcons, "")
	}

	m.skillsAddTargets = append(m.skillsAddTargets, "Create new bundle...")
	m.skillsAddPaths = append(m.skillsAddPaths, createNewBundleSentinel)
	m.skillsAddIcons = append(m.skillsAddIcons, "")
}

// ── Async commands ─────────────────────────────────────────────────

// loadSkillsLeaderboard fires multiple broad queries to approximate the leaderboard.
func loadSkillsLeaderboard() tea.Cmd {
	return func() tea.Msg {
		queries := []string{"best-practices", "design", "testing", "security", "agent", "database", "react", "api", "mobile", "devops"}
		seen := map[string]bool{}
		var all []skillsResult

		client := &http.Client{Timeout: 10 * time.Second}

		for _, q := range queries {
			apiURL := fmt.Sprintf("https://skills.sh/api/search?q=%s&limit=30", url.QueryEscape(q))
			resp, err := client.Get(apiURL)
			if err != nil {
				continue
			}
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != 200 || err != nil {
				continue
			}

			var result struct {
				Skills []skillsResult `json:"skills"`
			}
			if err := json.Unmarshal(body, &result); err != nil {
				continue
			}
			for _, s := range result.Skills {
				if !seen[s.ID] {
					seen[s.ID] = true
					all = append(all, s)
				}
			}
		}

		sort.Slice(all, func(i, j int) bool {
			return all[i].Installs > all[j].Installs
		})

		if len(all) > 100 {
			all = all[:100]
		}

		return skillsSearchMsg{results: all}
	}
}

// searchSkills fetches skill search results from skills.sh.
func searchSkills(query string) tea.Cmd {
	return func() tea.Msg {
		apiURL := fmt.Sprintf("https://skills.sh/api/search?q=%s&limit=50", url.QueryEscape(query))

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(apiURL)
		if err != nil {
			return skillsSearchMsg{err: fmt.Errorf("search failed: %w", err)}
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return skillsSearchMsg{err: fmt.Errorf("search returned %d", resp.StatusCode)}
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return skillsSearchMsg{err: err}
		}

		var result struct {
			Skills []skillsResult `json:"skills"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return skillsSearchMsg{err: fmt.Errorf("invalid response: %w", err)}
		}

		sort.Slice(result.Skills, func(i, j int) bool {
			return result.Skills[i].Installs > result.Skills[j].Installs
		})

		return skillsSearchMsg{results: result.Skills}
	}
}

// doSkillImport runs a skill import asynchronously.
func doSkillImport(source, skillName, targetDir, sourceLabel string) tea.Cmd {
	return func() tea.Msg {
		err := importSkillToTarget(source, skillName, targetDir, sourceLabel)
		return skillsImportDoneMsg{skill: skillName, err: err}
	}
}
