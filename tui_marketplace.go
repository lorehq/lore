package main

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	zone "github.com/lrstanley/bubblezone"
)

// viewMarketplace renders the marketplace tab content.
func (m *tuiModel) viewMarketplace(maxH int) string {
	// Confirm dialog overlay
	if m.mktConfirm {
		return m.overlayMktConfirmDialog(maxH)
	}

	if m.mktOpActive {
		var verb string
		switch m.mktOpVerb {
		case "install":
			verb = "Installing"
		case "update":
			verb = "Updating"
		case "remove":
			verb = "Removing"
		default:
			verb = m.mktOpVerb
		}
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render(fmt.Sprintf("%s %s...", verb, m.mktOpSlug))
	}

	if m.mktLoading {
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render("Loading marketplace...")
	}

	if !m.mktLoaded {
		return lipgloss.NewStyle().
			Width(m.width).
			Height(maxH).
			Align(lipgloss.Center, lipgloss.Center).
			Faint(true).
			Render("Press 2 or click the tab to load")
	}

	var lines []string

	// Top bar: refresh button + search
	topBar := " " + zone.Mark("mkt-refresh", btnSecondary.Render("Refresh"))
	if m.mktSearchActive {
		topBar += "  / " + m.mktSearch + "\u2588"
	} else if m.mktSearch != "" {
		topBar += "  " + dimStyle.Render("filter: "+m.mktSearch) + "  " + zone.Mark("mkt-clear-search", dimStyle.Render("[clear]"))
	}
	lines = append(lines, topBar)
	lines = append(lines, "")

	// Filter function
	matches := func(item marketplaceItem) bool {
		if m.mktSearch == "" {
			return true
		}
		q := strings.ToLower(m.mktSearch)
		if strings.Contains(strings.ToLower(item.name), q) ||
			strings.Contains(strings.ToLower(item.slug), q) ||
			strings.Contains(strings.ToLower(item.description), q) {
			return true
		}
		for _, t := range item.tags {
			if strings.Contains(strings.ToLower(t), q) {
				return true
			}
		}
		return false
	}

	// INSTALLED section
	filteredInstalled := filterMarketplaceItems(m.mktInstalled, matches)
	installedArrow := "\u25be"
	if m.mktInstalledCollapsed {
		installedArrow = "\u25b8"
	}
	installedHeader := fmt.Sprintf(" %s %s", installedArrow, bold.Render("INSTALLED"))
	if len(filteredInstalled) > 0 {
		installedHeader += dimStyle.Render(fmt.Sprintf(" (%d)", len(filteredInstalled)))
	}
	lines = append(lines, zone.Mark("mkt-installed-header", installedHeader))

	if !m.mktInstalledCollapsed {
		if len(filteredInstalled) == 0 {
			lines = append(lines, dimStyle.Render("   No bundles installed"))
		}
		for _, item := range filteredInstalled {
			nameStr := "   " + bold.Render(item.name)
			if item.version != "" {
				nameStr += " " + dimStyle.Render("v"+item.version)
			}
			// Action buttons
			updateBtn := zone.Mark("mkt-update-"+item.slug, dimStyle.Render("[update]"))
			removeBtn := zone.Mark("mkt-remove-"+item.slug, lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("[remove]"))
			nameStr += "  " + updateBtn + " " + removeBtn
			lines = append(lines, nameStr)
			if item.description != "" {
				lines = append(lines, dimStyle.Render("   "+item.description))
			}
			if item.author != "" {
				lines = append(lines, dimStyle.Render("   by "+item.author))
			}
			if len(item.tags) > 0 {
				lines = append(lines, dimStyle.Render("   "+strings.Join(item.tags, ", ")))
			}
			lines = append(lines, "")
		}
	}

	lines = append(lines, "")

	// AVAILABLE section
	filteredAvailable := filterMarketplaceItems(m.mktAvailable, matches)
	availableArrow := "\u25be"
	if m.mktAvailableCollapsed {
		availableArrow = "\u25b8"
	}
	availableHeader := fmt.Sprintf(" %s %s", availableArrow, bold.Render("AVAILABLE"))
	if len(filteredAvailable) > 0 {
		availableHeader += dimStyle.Render(fmt.Sprintf(" (%d)", len(filteredAvailable)))
	}
	lines = append(lines, zone.Mark("mkt-available-header", availableHeader))

	if !m.mktAvailableCollapsed {
		if len(filteredAvailable) == 0 {
			lines = append(lines, dimStyle.Render("   No additional bundles available"))
		}
		for _, item := range filteredAvailable {
			nameStr := "   " + bold.Render(item.name)
			installBtn := zone.Mark("mkt-install-"+item.slug, greenStyle.Render("[install]"))
			nameStr += "  " + installBtn
			lines = append(lines, nameStr)
			if item.description != "" {
				lines = append(lines, dimStyle.Render("   "+item.description))
			}
			if item.author != "" {
				lines = append(lines, dimStyle.Render("   by "+item.author))
			}
			if len(item.tags) > 0 {
				lines = append(lines, dimStyle.Render("   "+strings.Join(item.tags, ", ")))
			}
			lines = append(lines, "")
		}
	}

	// Apply scroll
	scroll := m.mktScroll
	if scroll > len(lines) {
		scroll = len(lines)
		m.mktScroll = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.mktScroll = 0
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

// filterMarketplaceItems filters items using the provided match function.
func filterMarketplaceItems(items []marketplaceItem, matches func(marketplaceItem) bool) []marketplaceItem {
	var result []marketplaceItem
	for _, item := range items {
		if matches(item) {
			result = append(result, item)
		}
	}
	return result
}

// handleMarketplaceKey handles keyboard input on the marketplace tab.
func (m *tuiModel) handleMarketplaceKey(msg tea.KeyMsg) (*tuiModel, tea.Cmd) {
	key := msg.String()

	// Confirm dialog intercepts all keys
	if m.mktConfirm {
		switch key {
		case "enter":
			m.mktConfirm = false
			m.mktOpActive = true
			m.mktOpSlug = m.mktConfirmSlug
			m.mktOpVerb = m.mktConfirmVerb
			if m.mktConfirmVerb == "remove" {
				return m, doMktRemove(m.mktConfirmSlug)
			}
			return m, doMktInstall(m.mktConfirmSlug, m.mktConfirmRepo)
		case "esc":
			m.mktConfirm = false
		}
		return m, nil
	}

	// Search mode intercepts
	if m.mktSearchActive {
		switch key {
		case "esc":
			m.mktSearchActive = false
			m.mktSearch = ""
		case "enter":
			m.mktSearchActive = false
		case "backspace":
			if len(m.mktSearch) > 0 {
				m.mktSearch = m.mktSearch[:len(m.mktSearch)-1]
			}
		default:
			if len(key) == 1 && key[0] >= 32 && key[0] <= 126 {
				m.mktSearch += key
			}
		}
		return m, nil
	}

	switch key {
	case "r":
		m.mktLoading = true
		m.mktLoaded = false
		return m, loadMarketplace()
	case "/":
		m.mktSearchActive = true
		m.mktSearch = ""
	case "esc":
		if m.mktSearch != "" {
			m.mktSearch = ""
		}
	case "j", "down":
		m.mktScroll++
	case "k", "up":
		if m.mktScroll > 0 {
			m.mktScroll--
		}
	}

	return m, nil
}

// handleMarketplaceMouse handles mouse clicks on the marketplace tab.
func (m *tuiModel) handleMarketplaceMouse(msg tea.MouseMsg) (*tuiModel, tea.Cmd) {
	// Refresh button
	if zone.Get("mkt-refresh").InBounds(msg) {
		m.mktLoading = true
		m.mktLoaded = false
		return m, loadMarketplace()
	}

	// Clear search
	if zone.Get("mkt-clear-search").InBounds(msg) {
		m.mktSearch = ""
		return m, nil
	}

	// Section collapse toggles
	if zone.Get("mkt-installed-header").InBounds(msg) {
		m.mktInstalledCollapsed = !m.mktInstalledCollapsed
		return m, nil
	}
	if zone.Get("mkt-available-header").InBounds(msg) {
		m.mktAvailableCollapsed = !m.mktAvailableCollapsed
		return m, nil
	}

	// Install buttons
	for _, item := range m.mktAvailable {
		if zone.Get("mkt-install-"+item.slug).InBounds(msg) {
			m.mktConfirm = true
			m.mktConfirmSlug = item.slug
			m.mktConfirmVerb = "install"
			m.mktConfirmRepo = item.repo
			return m, nil
		}
	}

	// Update buttons
	for _, item := range m.mktInstalled {
		if zone.Get("mkt-update-"+item.slug).InBounds(msg) {
			m.mktOpActive = true
			m.mktOpSlug = item.slug
			m.mktOpVerb = "update"
			return m, doMktUpdate(item.slug)
		}
	}

	// Remove buttons
	for _, item := range m.mktInstalled {
		if zone.Get("mkt-remove-"+item.slug).InBounds(msg) {
			m.mktConfirm = true
			m.mktConfirmSlug = item.slug
			m.mktConfirmVerb = "remove"
			return m, nil
		}
	}

	return m, nil
}

// overlayMktConfirmDialog renders a centered confirmation dialog.
func (m *tuiModel) overlayMktConfirmDialog(maxH int) string {
	verb := m.mktConfirmVerb
	slug := m.mktConfirmSlug

	title := fmt.Sprintf(" %s %s? ", capitalize(verb), slug)

	var body string
	if verb == "remove" {
		body = "This will delete the bundle from disk.\nBundle must not be enabled in any project."
	} else {
		body = fmt.Sprintf("Install %s from the registry.", slug)
	}

	confirmLabel := capitalize(verb)
	confirmBtn := zone.Mark("mkt-confirm", btnPrimary.Render(confirmLabel))
	cancelBtn := zone.Mark("mkt-cancel", btnSecondary.Render("Cancel"))
	buttons := confirmBtn + "  " + cancelBtn

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

	content := bold.Render(title) + "\n\n" + body + "\n\n" + buttons
	rendered := dialogBox.Render(content)

	// Center vertically and horizontally
	return lipgloss.NewStyle().
		Width(m.width).
		Height(maxH).
		Align(lipgloss.Center, lipgloss.Center).
		Render(rendered)
}

// capitalize returns s with first letter uppercased.
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
