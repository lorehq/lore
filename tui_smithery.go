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

// ── Smithery sub-tab (MCP servers) ─────────────────────────────────

// ensureSmitheryLoaded triggers the initial top servers load if not done yet.
func (m *tuiModel) ensureSmitheryLoaded() tea.Cmd {
	if m.smitheryInitLoaded || m.smitheryLoading {
		return nil
	}
	m.smitheryInitLoaded = true
	m.smitheryLoading = true
	return loadSmitheryTop()
}

// smitheryCardLines builds the content lines for a Smithery MCP server card.
func smitheryCardLines(r smitheryResult, innerW int) []string {
	var content []string

	// Row 1: name + uses + [+ Add]
	nameStr := bold.Render(r.DisplayName)
	if r.Verified {
		nameStr += "  " + dimStyle.Render("\u2713 verified")
	}
	uses := formatInstalls(r.UseCount) + " uses"
	addBtn := zone.Mark("smithery-add-"+r.QualifiedName, greenStyle.Render("[+ Add]"))
	rightSide := dimStyle.Render(uses) + "  " + addBtn
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

	// Row 3: homepage link
	if r.Homepage != "" {
		display := r.Homepage
		if strings.HasPrefix(display, "https://") {
			display = display[8:]
		}
		link := fmt.Sprintf("\033]8;;%s\033\\%s\033]8;;\033\\", r.Homepage, display)
		content = append(content, dimStyle.Render(link))
	}

	return content
}

// viewSmithery renders the Smithery MCP servers sub-tab.
func (m *tuiModel) viewSmithery(maxH int) string {
	// Target picker overlay
	if m.smitheryAddActive {
		return m.overlaySmitheryTargetPicker(maxH)
	}

	var lines []string

	// Header
	lines = append(lines, " "+bold.Render("SMITHERY")+"  "+dimStyle.Render("MCP server registry"))
	lines = append(lines, "")

	// Search bar
	var searchContent string
	if m.smitherySearchMode {
		searchContent = " /  " + m.smitherySearchBuf + "\u2588"
	} else if m.smitheryQuery != "" {
		searchContent = " /  " + m.smitheryQuery + "  " + zone.Mark("smithery-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchContent = dimStyle.Render(" /  Press / to search MCP servers")
	}
	searchBox := zone.Mark("smithery-search-bar", searchContent)

	slashHint := dimStyle.Render("/")
	searchGap := m.width - lipgloss.Width(searchContent) - lipgloss.Width(slashHint) - 2
	if searchGap < 1 {
		searchGap = 1
	}
	lines = append(lines, " "+searchBox+strings.Repeat(" ", searchGap)+slashHint+" ")

	// Separator
	lines = append(lines, dimStyle.Render(" "+strings.Repeat("\u2500", m.width-2)))
	lines = append(lines, "")

	// Content
	if m.smitheryLoading {
		lines = append(lines, dimStyle.Render("  Loading..."))
	} else if m.smitheryError != "" {
		lines = append(lines, errStyle.Render("  Error: "+m.smitheryError))
	} else if len(m.smitheryResults) == 0 && m.smitheryQuery != "" {
		lines = append(lines, dimStyle.Render(fmt.Sprintf("  No results for \"%s\"", m.smitheryQuery)))
	} else if len(m.smitheryResults) == 0 {
		lines = append(lines, dimStyle.Render("  Loading MCP servers..."))
	} else {
		innerW := m.width - 8
		if innerW < 20 {
			innerW = 20
		}

		for _, r := range m.smitheryResults {
			cardContent := smitheryCardLines(r, innerW)
			cardLines := renderCard(cardContent, m.width)
			lines = append(lines, cardLines...)
		}
	}

	// Apply scroll
	scroll := m.smitheryScroll
	if scroll > len(lines) {
		scroll = len(lines)
		m.smitheryScroll = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.smitheryScroll = 0
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

// handleSmitheryKey handles keyboard input on the Smithery sub-tab.
func (m *tuiModel) handleSmitheryKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Target picker intercepts
	if m.smitheryAddActive {
		switch key {
		case "esc":
			m.smitheryAddActive = false
		case "j", "down":
			if m.smitheryAddCursor < len(m.smitheryAddTargets)-1 {
				m.smitheryAddCursor++
			}
		case "k", "up":
			if m.smitheryAddCursor > 0 {
				m.smitheryAddCursor--
			}
		case "enter":
			targetDir := m.smitheryAddPaths[m.smitheryAddCursor]
			if targetDir == createNewBundleSentinel {
				m.bundleCreateActive = true
				m.bundleCreateName = ""
				m.bundleCreateErr = ""
				m.bundleCreateCallback = "smithery"
				m.bundleCreateKind = "MCP"
				return m, nil
			}
			m.smitheryAddActive = false
			m.smitheryImporting = true
			m.smitheryImportName = m.smitheryAddItem.DisplayName
			return m, doSmitheryAdd(m.smitheryAddItem, targetDir)
		}
		return m, nil
	}

	// Search mode
	if m.smitherySearchMode {
		switch key {
		case "esc":
			m.smitherySearchMode = false
		case "enter":
			m.smitherySearchMode = false
			if m.smitherySearchBuf != "" {
				m.smitheryQuery = m.smitherySearchBuf
				m.smitheryLoading = true
				m.smitheryScroll = 0
				return m, searchSmithery(m.smitheryQuery)
			}
		case "backspace":
			if len(m.smitherySearchBuf) > 0 {
				m.smitherySearchBuf = m.smitherySearchBuf[:len(m.smitherySearchBuf)-1]
			}
		default:
			if len(key) == 1 && key[0] >= 32 && key[0] <= 126 {
				m.smitherySearchBuf += key
			}
		}
		return m, nil
	}

	switch key {
	case "/":
		m.smitherySearchMode = true
		m.smitherySearchBuf = ""
	case "esc":
		if m.smitheryQuery != "" {
			m.smitheryQuery = ""
			m.smitheryResults = nil
			m.smitheryScroll = 0
			m.smitheryLoading = true
			return m, loadSmitheryTop()
		}
	case "j", "down":
		m.smitheryScroll++
	case "k", "up":
		if m.smitheryScroll > 0 {
			m.smitheryScroll--
		}
	}

	return m, nil
}

// handleSmitheryMouse handles mouse clicks on the Smithery sub-tab.
func (m *tuiModel) handleSmitheryMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Search bar click
	if zone.Get("smithery-search-bar").InBounds(msg) {
		m.smitherySearchMode = true
		m.smitherySearchBuf = ""
		return m, nil
	}

	// Clear search
	if zone.Get("smithery-clear-search").InBounds(msg) {
		m.smitheryQuery = ""
		m.smitherySearchMode = false
		m.smitheryResults = nil
		m.smitheryScroll = 0
		m.smitheryLoading = true
		return m, loadSmitheryTop()
	}

	// Target picker clicks
	if m.smitheryAddActive {
		for i := range m.smitheryAddTargets {
			if zone.Get(fmt.Sprintf("smithery-target-%d", i)).InBounds(msg) {
				targetDir := m.smitheryAddPaths[i]
				if targetDir == createNewBundleSentinel {
					m.bundleCreateActive = true
					m.bundleCreateName = ""
					m.bundleCreateErr = ""
					m.bundleCreateCallback = "smithery"
					m.bundleCreateKind = "MCP"
					return m, nil
				}
				m.smitheryAddActive = false
				m.smitheryImporting = true
				m.smitheryImportName = m.smitheryAddItem.DisplayName
				return m, doSmitheryAdd(m.smitheryAddItem, targetDir)
			}
		}
		if zone.Get("smithery-target-cancel").InBounds(msg) {
			m.smitheryAddActive = false
			return m, nil
		}
		return m, nil
	}

	// Add buttons
	for _, r := range m.smitheryResults {
		if zone.Get("smithery-add-"+r.QualifiedName).InBounds(msg) {
			m.smitheryAddActive = true
			m.smitheryAddItem = r
			m.smitheryAddCursor = 0
			m.buildSmitheryTargets()
			return m, nil
		}
	}

	return m, nil
}

// overlaySmitheryTargetPicker renders a centered target picker dialog for Smithery.
func (m *tuiModel) overlaySmitheryTargetPicker(maxH int) string {
	title := bold.Render(fmt.Sprintf("Add %s to:", m.smitheryAddItem.DisplayName))

	selectedStyle := lipgloss.NewStyle().Bold(true).Reverse(true)

	var targetLines []string
	for i, label := range m.smitheryAddTargets {
		if i == m.smitheryAddCursor {
			line := selectedStyle.Render("\u25b8 " + label)
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("smithery-target-%d", i), line))
		} else {
			line := "  " + label
			targetLines = append(targetLines, zone.Mark(fmt.Sprintf("smithery-target-%d", i), line))
		}
	}

	cancelBtn := zone.Mark("smithery-target-cancel", btnSecondary.Render(" Cancel "))

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

// buildSmitheryTargets populates the target picker with MCP directories.
func (m *tuiModel) buildSmitheryTargets() {
	m.smitheryAddTargets = nil
	m.smitheryAddPaths = nil
	m.smitheryAddIcons = nil

	m.smitheryAddTargets = append(m.smitheryAddTargets, "Project")
	m.smitheryAddPaths = append(m.smitheryAddPaths, filepath.Join(".lore", "MCP"))
	m.smitheryAddIcons = append(m.smitheryAddIcons, "")

	m.smitheryAddTargets = append(m.smitheryAddTargets, "Global")
	m.smitheryAddPaths = append(m.smitheryAddPaths, filepath.Join(globalPath(), "MCP"))
	m.smitheryAddIcons = append(m.smitheryAddIcons, "")

	// Show user-created bundles (no .git = not registry-installed)
	bundles := discoverBundles()
	for _, b := range bundles {
		gitDir := filepath.Join(b.Dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			continue
		}
		m.smitheryAddTargets = append(m.smitheryAddTargets, b.Name)
		m.smitheryAddPaths = append(m.smitheryAddPaths, filepath.Join(b.Dir, "MCP"))
		m.smitheryAddIcons = append(m.smitheryAddIcons, "")
	}

	m.smitheryAddTargets = append(m.smitheryAddTargets, "Create new bundle...")
	m.smitheryAddPaths = append(m.smitheryAddPaths, createNewBundleSentinel)
	m.smitheryAddIcons = append(m.smitheryAddIcons, "")
}

// ── Smithery async commands ─────────────────────────────────────────

// loadSmitheryTop fetches the top MCP servers by usage from the Smithery registry.
func loadSmitheryTop() tea.Cmd {
	return func() tea.Msg {
		apiURL := "https://registry.smithery.ai/servers?pageSize=50"

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(apiURL)
		if err != nil {
			return smitherySearchMsg{err: fmt.Errorf("failed to load: %w", err)}
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return smitherySearchMsg{err: fmt.Errorf("registry returned HTTP %d", resp.StatusCode)}
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return smitherySearchMsg{err: err}
		}

		var result struct {
			Servers    []smitheryResult `json:"servers"`
			Pagination struct {
				TotalCount int `json:"totalCount"`
			} `json:"pagination"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return smitherySearchMsg{err: fmt.Errorf("invalid response: %w", err)}
		}

		// Sort by useCount descending
		sort.Slice(result.Servers, func(i, j int) bool {
			return result.Servers[i].UseCount > result.Servers[j].UseCount
		})

		return smitherySearchMsg{results: result.Servers, total: result.Pagination.TotalCount}
	}
}

// searchSmithery searches the Smithery registry with a query.
func searchSmithery(query string) tea.Cmd {
	return func() tea.Msg {
		apiURL := fmt.Sprintf("https://registry.smithery.ai/servers?q=%s&pageSize=30",
			url.QueryEscape(query))

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(apiURL)
		if err != nil {
			return smitherySearchMsg{err: fmt.Errorf("search failed: %w", err)}
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return smitherySearchMsg{err: fmt.Errorf("search returned HTTP %d", resp.StatusCode)}
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return smitherySearchMsg{err: err}
		}

		var result struct {
			Servers    []smitheryResult `json:"servers"`
			Pagination struct {
				TotalCount int `json:"totalCount"`
			} `json:"pagination"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return smitherySearchMsg{err: fmt.Errorf("invalid response: %w", err)}
		}

		return smitherySearchMsg{results: result.Servers, total: result.Pagination.TotalCount}
	}
}

// doSmitheryAdd writes an MCP server JSON declaration to the target directory.
func doSmitheryAdd(server smitheryResult, targetDir string) tea.Cmd {
	return func() tea.Msg {
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return smitheryAddDoneMsg{name: server.DisplayName, err: err}
		}

		// Build the MCP server declaration JSON
		decl := map[string]interface{}{
			"name":    server.DisplayName,
			"command": "npx",
			"args":    []string{"-y", "@smithery/" + server.QualifiedName},
		}

		data, err := json.MarshalIndent(decl, "", "  ")
		if err != nil {
			return smitheryAddDoneMsg{name: server.DisplayName, err: err}
		}

		// Sanitize qualified name for filename (may contain slashes like "clay-inc/clay-mcp")
		safeName := strings.ReplaceAll(server.QualifiedName, "/", "-")
		filename := safeName + ".json"
		filePath := filepath.Join(targetDir, filename)
		if err := os.WriteFile(filePath, data, 0644); err != nil {
			return smitheryAddDoneMsg{name: server.DisplayName, err: err}
		}

		return smitheryAddDoneMsg{name: server.DisplayName}
	}
}

// smitheryAddDoneMsg is sent when an MCP server add completes.
type smitheryAddDoneMsg struct {
	name string
	err  error
}
