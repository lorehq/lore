package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
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
	subTabH := 1
	contentH := maxH - subTabH
	if contentH < 1 {
		contentH = 1
	}

	var content string
	switch m.exploreSub {
	case exploreSubBundles:
		content = m.viewMarketplace(contentH)
	case exploreSubSkills:
		content = m.viewSkillsExplorer(contentH)
	}

	return subTabBar + "\n" + content
}

// renderExploreSubTabs renders the sub-tab bar within the Explore tab.
func (m *tuiModel) renderExploreSubTabs() string {
	activeStyle := lipgloss.NewStyle().Bold(true).Underline(true).Padding(0, 1)
	inactiveStyle := lipgloss.NewStyle().Faint(true).Padding(0, 1)

	tabs := []struct {
		label  string
		zoneID string
		id     exploreSubTab
	}{
		{"Bundles", "explore-sub-bundles", exploreSubBundles},
		{"Skills", "explore-sub-skills", exploreSubSkills},
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

	return " " + strings.Join(parts, dimStyle.Render(" | "))
}

// handleExploreKey dispatches keyboard input to the active Explore sub-tab.
func (m *tuiModel) handleExploreKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Tab/shift-tab switches sub-tabs
	if key == "tab" {
		if m.exploreSub == exploreSubBundles {
			m.exploreSub = exploreSubSkills
		} else {
			m.exploreSub = exploreSubBundles
		}
		return m, nil
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceKey(msg)
	case exploreSubSkills:
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
	if zone.Get("explore-sub-skills").InBounds(msg) {
		m.exploreSub = exploreSubSkills
		return m, nil
	}

	switch m.exploreSub {
	case exploreSubBundles:
		return m.handleMarketplaceMouse(msg)
	case exploreSubSkills:
		return m.handleSkillsExplorerMouse(msg)
	}
	return m, nil
}

// ── Skills Explorer sub-tab ────────────────────────────────────────

// viewSkillsExplorer renders the skills search and results view.
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

	// Search bar
	searchBar := " "
	if m.skillsSearchActive {
		searchBar += "Search: " + m.skillsSearch + "\u2588"
	} else if m.skillsSearch != "" {
		searchBar += dimStyle.Render("search: "+m.skillsSearch) + "  " + zone.Mark("skills-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchBar += dimStyle.Render("Press / to search skills.sh (88,000+ skills)")
	}
	lines = append(lines, searchBar)
	lines = append(lines, "")

	if m.skillsLoading {
		lines = append(lines, dimStyle.Render("   Searching..."))
	} else if len(m.skillsResults) == 0 && m.skillsSearch != "" {
		lines = append(lines, dimStyle.Render("   No results"))
	} else if len(m.skillsResults) == 0 {
		lines = append(lines, "")
		lines = append(lines, dimStyle.Render("   Search the Agent Skills ecosystem to find and import skills."))
		lines = append(lines, dimStyle.Render("   Skills are imported into your project, global config, or a bundle."))
	} else {
		// Results
		for _, r := range m.skillsResults {
			addBtn := zone.Mark("skills-add-"+r.ID, greenStyle.Render("[+ Add]"))
			installs := dimStyle.Render(fmt.Sprintf("%d installs", r.Installs))
			source := dimStyle.Render(r.Source)

			nameLine := "   " + bold.Render(r.Name) + "  " + addBtn + "  " + installs
			lines = append(lines, nameLine)
			lines = append(lines, dimStyle.Render("   "+source))
			lines = append(lines, "")
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

// handleSkillsExplorerKey handles keyboard input on the skills explorer sub-tab.
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
			sourceLabel := source
			return m, doSkillImport(source, skillName, targetDir, sourceLabel)
		}
		return m, nil
	}

	// Search mode
	if m.skillsSearchActive {
		switch key {
		case "esc":
			m.skillsSearchActive = false
			m.skillsSearch = ""
		case "enter":
			m.skillsSearchActive = false
			if m.skillsSearch != "" {
				m.skillsLoading = true
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

// handleSkillsExplorerMouse handles mouse clicks on the skills explorer sub-tab.
func (m *tuiModel) handleSkillsExplorerMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Clear search
	if zone.Get("skills-clear-search").InBounds(msg) {
		m.skillsSearch = ""
		m.skillsResults = nil
		return m, nil
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

// overlaySkillsTargetPicker renders a centered target picker dialog.
func (m *tuiModel) overlaySkillsTargetPicker(maxH int) string {
	title := bold.Render(fmt.Sprintf(" Add %s to: ", m.skillsAddItem.Name))

	var targetLines []string
	for i, label := range m.skillsAddTargets {
		prefix := "  "
		if i == m.skillsAddCursor {
			prefix = "> "
		}
		line := prefix + label
		targetLines = append(targetLines, zone.Mark(fmt.Sprintf("skills-target-%d", i), line))
	}

	cancelBtn := zone.Mark("skills-target-cancel", btnSecondary.Render("Cancel"))

	dialogW := 50
	if m.width < 60 {
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

	// Project
	m.skillsAddTargets = append(m.skillsAddTargets, "Project (.lore/SKILLS/)")
	m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(".lore", "SKILLS"))

	// Global
	m.skillsAddTargets = append(m.skillsAddTargets, "Global ("+globalPath()+"/SKILLS/)")
	m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(globalPath(), "SKILLS"))

	// Installed bundles
	bundles := discoverBundles()
	for _, b := range bundles {
		m.skillsAddTargets = append(m.skillsAddTargets, fmt.Sprintf("Bundle: %s", b.Name))
		m.skillsAddPaths = append(m.skillsAddPaths, filepath.Join(b.Dir, "SKILLS"))
	}
}

// ── Async commands ─────────────────────────────────────────────────

// searchSkills fetches skill search results from skills.sh.
func searchSkills(query string) tea.Cmd {
	return func() tea.Msg {
		apiURL := fmt.Sprintf("https://skills.sh/api/search?q=%s&limit=20", url.QueryEscape(query))

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
