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
		content = m.viewSkillsMPPlaceholder(contentH)
	}

	return subTabBar + "\n" + content
}

// renderExploreSubTabs renders the sub-tab bar within the Explore tab.
func (m *tuiModel) renderExploreSubTabs() string {
	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}

	activeStyle := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1).
		Foreground(lipgloss.Color("12")).
		Border(lipgloss.RoundedBorder(), true, true, false, true).
		BorderForeground(lipgloss.Color("12"))

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
		{"skills.sh", "explore-sub-skillssh", exploreSubSkillsSh},
		{"SkillsMP", "explore-sub-skillsmp", exploreSubSkillsMP},
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
	refreshBtn := zone.Mark("mkt-refresh", dimStyle.Render(" ↻ "))
	barW := lipgloss.Width(tabBar)
	btnW := lipgloss.Width(refreshBtn)
	gap := m.width - barW - btnW
	if gap < 1 {
		gap = 1
	}
	filler := lipgloss.NewStyle().Foreground(borderFg).Render(strings.Repeat("─", gap))

	return lipgloss.JoinHorizontal(lipgloss.Bottom, tabBar, filler, refreshBtn)
}

// handleExploreKey dispatches keyboard input to the active Explore sub-tab.
func (m *tuiModel) handleExploreKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Tab/shift-tab cycles sub-tabs
	if key == "tab" {
		switch m.exploreSub {
		case exploreSubBundles:
			m.exploreSub = exploreSubSkillsSh
			return m, m.ensureSkillsLoaded()
		case exploreSubSkillsSh:
			m.exploreSub = exploreSubSkillsMP
			return m, nil
		case exploreSubSkillsMP:
			m.exploreSub = exploreSubBundles
			return m, nil
		}
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceKey(msg)
	case exploreSubSkillsSh:
		return m.handleSkillsExplorerKey(msg)
	}
	return m, nil
}

// handleExploreMouse dispatches mouse input to the active Explore sub-tab.
func (m *tuiModel) handleExploreMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
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
		return m, nil
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceMouse(msg)
	case exploreSubSkillsSh:
		return m.handleSkillsExplorerMouse(msg)
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

// skillHyperlink returns an OSC 8 terminal hyperlink for a skill's source.
func skillHyperlink(r skillsResult) string {
	display := "github.com/" + r.Source
	url := "https://" + display
	return fmt.Sprintf("\033]8;;%s\033\\%s\033]8;;\033\\", url, display)
}

// viewSkillsExplorer renders the skills.sh leaderboard view.
func (m *tuiModel) viewSkillsExplorer(maxH int) string {
	// Target picker overlay
	if m.skillsAddActive {
		return m.overlaySkillsTargetPicker(maxH)
	}

	// Importing overlay
	if m.skillsImporting {
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render(fmt.Sprintf("Importing %s...", m.skillsImportName))
	}

	var lines []string

	// Header
	lines = append(lines, " "+bold.Render("SKILLS LEADERBOARD")+"  "+dimStyle.Render("skills.sh"))
	lines = append(lines, "")

	// Search bar
	var searchContent string
	if m.skillsSearchActive {
		searchContent = " 🔍  " + m.skillsSearch + "\u2588"
	} else if m.skillsSearch != "" {
		searchContent = " 🔍  " + m.skillsSearch + "  " + zone.Mark("skills-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchContent = dimStyle.Render(" 🔍  Search skills ...")
	}
	searchBox := zone.Mark("skills-search-bar", searchContent)

	slashHint := dimStyle.Render("/")
	searchGap := m.width - lipgloss.Width(searchContent) - lipgloss.Width(slashHint) - 2
	if searchGap < 1 {
		searchGap = 1
	}
	lines = append(lines, " "+searchBox+strings.Repeat(" ", searchGap)+slashHint+" ")

	// Separator
	lines = append(lines, dimStyle.Render(" "+strings.Repeat("─", m.width-2)))
	lines = append(lines, "")

	// Table content
	if m.skillsLoading {
		lines = append(lines, dimStyle.Render("  Loading..."))
	} else if len(m.skillsResults) == 0 && m.skillsSearch != "" {
		lines = append(lines, dimStyle.Render(fmt.Sprintf("  No results for \"%s\"", m.skillsSearch)))
	} else if len(m.skillsResults) == 0 {
		lines = append(lines, dimStyle.Render("  Loading leaderboard..."))
	} else {
		// Column header
		colHeader := dimStyle.Render(fmt.Sprintf(" %-5s %-30s %*s",
			"#", "SKILL", m.width-42, "INSTALLS"))
		lines = append(lines, colHeader)
		lines = append(lines, "")

		// Skill rows
		for i, r := range m.skillsResults {
			rank := fmt.Sprintf("%-5d", i+1)
			installs := formatInstalls(r.Installs)
			source := dimStyle.Render(skillHyperlink(r))
			addBtn := zone.Mark("skills-add-"+r.ID, greenStyle.Render("[+ Add]"))

			// Row 1: rank + bold name + installs + add button
			nameStr := bold.Render(r.Name)
			rightSide := installs + "  " + addBtn
			rightW := lipgloss.Width(rightSide)
			nameW := lipgloss.Width(nameStr)
			gap := m.width - 7 - nameW - rightW
			if gap < 1 {
				gap = 1
			}
			row := " " + dimStyle.Render(rank) + " " + nameStr + strings.Repeat(" ", gap) + rightSide
			lines = append(lines, row)

			// Row 2: source URL (indented under name)
			lines = append(lines, "       "+source)
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
			visible[i] = ansi.Truncate(line, m.width, "…")
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
			m.skillsAddActive = false
			m.skillsImporting = true
			m.skillsImportName = m.skillsAddItem.Name
			targetDir := m.skillsAddPaths[m.skillsAddCursor]
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
				m.skillsAddActive = false
				m.skillsImporting = true
				m.skillsImportName = m.skillsAddItem.Name
				targetDir := m.skillsAddPaths[i]
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

// ── SkillsMP placeholder sub-tab ───────────────────────────────────

func (m *tuiModel) viewSkillsMPPlaceholder(maxH int) string {
	var lines []string
	lines = append(lines, " "+bold.Render("SkillsMP")+"  "+dimStyle.Render("skillsmp.com"))
	lines = append(lines, "")
	lines = append(lines, dimStyle.Render("  400,000+ agent skills with category filtering and semantic search."))
	lines = append(lines, dimStyle.Render("  Requires API key — integration coming soon."))
	lines = append(lines, "")
	lines = append(lines, dimStyle.Render("  Visit https://skillsmp.com to browse skills."))

	for len(lines) < maxH {
		lines = append(lines, "")
	}
	if len(lines) > maxH {
		lines = lines[:maxH]
	}

	return strings.Join(lines, "\n")
}

// ── Target picker ──────────────────────────────────────────────────

// overlaySkillsTargetPicker renders a centered target picker dialog.
func (m *tuiModel) overlaySkillsTargetPicker(maxH int) string {
	title := bold.Render(fmt.Sprintf("Add %s to:", m.skillsAddItem.Name))

	selectedStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))

	var targetLines []string
	for i, label := range m.skillsAddTargets {
		icon := m.skillsAddIcons[i]
		if i == m.skillsAddCursor {
			line := selectedStyle.Render("▸ " + icon + "  " + label)
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("skills-target-%d", i), line))
		} else {
			line := "  " + icon + "  " + label
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
	m.skillsAddIcons = append(m.skillsAddIcons, "📁")

	m.skillsAddTargets = append(m.skillsAddTargets, "Global")
	m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(globalPath(), "SKILLS"))
	m.skillsAddIcons = append(m.skillsAddIcons, "🌐")

	// Only show user-created bundles (no .git = not installed from registry)
	bundles := discoverBundles()
	for _, b := range bundles {
		gitDir := filepath.Join(b.Dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			continue // skip registry-installed bundles
		}
		m.skillsAddTargets = append(m.skillsAddTargets, b.Name)
		m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(b.Dir, "SKILLS"))
		m.skillsAddIcons = append(m.skillsAddIcons, "📦")
	}
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
