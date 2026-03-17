package main

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	zone "github.com/lrstanley/bubblezone"
)

// bundleCardLines builds the content lines for a bundle card.
func bundleCardLines(item marketplaceItem, innerW int) []string {
	var content []string

	// Row 1: name + version + action buttons (right-aligned)
	nameStr := bold.Render(item.name)
	if item.version != "" {
		nameStr += "  " + dimStyle.Render("v"+item.version)
	}

	var buttons string
	if item.installed {
		updateBtn := zone.Mark("mkt-update-"+item.slug, dimStyle.Render("[update]"))
		removeBtn := zone.Mark("mkt-remove-"+item.slug, lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("[remove]"))
		detailBtn := zone.Mark("mkt-detail-"+item.slug, dimStyle.Render("[details]"))
		buttons = updateBtn + " " + removeBtn + " " + detailBtn
	} else {
		installBtn := zone.Mark("mkt-install-"+item.slug, greenStyle.Render("[install]"))
		detailBtn := zone.Mark("mkt-detail-"+item.slug, dimStyle.Render("[details]"))
		buttons = installBtn + " " + detailBtn
	}

	nameW := lipgloss.Width(nameStr)
	btnW := lipgloss.Width(buttons)
	gap := innerW - nameW - btnW
	if gap < 1 {
		gap = 1
	}
	content = append(content, nameStr+strings.Repeat(" ", gap)+buttons)

	// Row 2: description
	if item.description != "" {
		desc := item.description
		if len(desc) > innerW {
			desc = desc[:innerW-1] + "\u2026"
		}
		content = append(content, dimStyle.Render(desc))
	}

	// Row 3: author
	if item.author != "" {
		content = append(content, dimStyle.Render("by "+item.author))
	}

	// Row 4: tags
	if len(item.tags) > 0 {
		content = append(content, dimStyle.Render(strings.Join(item.tags, ", ")))
	}

	// Row 5: repo links
	var repoLinks []string
	if item.repo != "" {
		repoLinks = append(repoLinks, "repo: "+strings.TrimSuffix(item.repo, ".git"))
	}
	if item.source != "" {
		repoLinks = append(repoLinks, "source: "+item.source)
	}
	if len(repoLinks) > 0 {
		content = append(content, dimStyle.Render(strings.Join(repoLinks, "  \u00b7  ")))
	}

	return content
}

// viewMarketplace renders the marketplace tab content.
func (m *tuiModel) viewMarketplace(maxH int) string {
	// Confirm dialog overlay
	if m.mktConfirm {
		return m.overlayMktConfirmDialog(maxH)
	}

	if m.mktLoading || !m.mktLoaded || m.mktOpActive {
		msg := "Loading marketplace..."
		if m.mktOpActive {
			switch m.mktOpVerb {
			case "install":
				msg = "Installing " + m.mktOpSlug + "..."
			case "update":
				msg = "Updating " + m.mktOpSlug + "..."
			case "remove":
				msg = "Removing " + m.mktOpSlug + "..."
			}
		} else if !m.mktLoaded {
			msg = "Press 2 or click the tab to load"
		}
		var lines []string
		half := maxH / 2
		for i := 0; i < half; i++ {
			lines = append(lines, "")
		}
		lines = append(lines, dimStyle.Render("  "+msg))
		for len(lines) < maxH {
			lines = append(lines, "")
		}
		return strings.Join(lines, "\n")
	}

	var lines []string

	// Search bar
	var searchContent string
	if m.mktSearchActive {
		searchContent = " /  " + m.mktSearch + "\u2588"
	} else if m.mktSearch != "" {
		searchContent = " /  " + dimStyle.Render("filter: "+m.mktSearch) + "  " + zone.Mark("mkt-clear-search", dimStyle.Render("[clear]"))
	} else {
		searchContent = dimStyle.Render(" /  Press / to search bundles")
	}
	searchBox := zone.Mark("mkt-search-bar", searchContent)

	slashHint := dimStyle.Render("/")
	searchGap := m.width - lipgloss.Width(searchContent) - lipgloss.Width(slashHint) - 2
	if searchGap < 1 {
		searchGap = 1
	}
	lines = append(lines, " "+searchBox+strings.Repeat(" ", searchGap)+slashHint+" ")

	// Separator
	lines = append(lines, dimStyle.Render(" "+strings.Repeat("\u2500", m.width-2)))
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

	// Flat list: installed first, then available
	filteredInstalled := filterMarketplaceItems(m.mktInstalled, matches)
	filteredAvailable := filterMarketplaceItems(m.mktAvailable, matches)
	allFiltered := append(filteredInstalled, filteredAvailable...)

	// Card inner width: fullWidth - 4 (margin) - 2 (border) - 2 (padding)
	innerW := m.width - 8
	if innerW < 20 {
		innerW = 20
	}

	if len(allFiltered) == 0 {
		if m.mktSearch != "" {
			lines = append(lines, dimStyle.Render(fmt.Sprintf("  No results for \"%s\"", m.mktSearch)))
		} else {
			lines = append(lines, dimStyle.Render("  No bundles available"))
		}
	} else {
		for _, item := range allFiltered {
			cardContent := bundleCardLines(item, innerW)
			cardLines := renderCard(cardContent, m.width)
			lines = append(lines, cardLines...)
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
	// Search bar click
	if zone.Get("mkt-search-bar").InBounds(msg) {
		m.mktSearchActive = true
		m.mktSearch = ""
		return m, nil
	}

	// Clear search
	if zone.Get("mkt-clear-search").InBounds(msg) {
		m.mktSearch = ""
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

	// Detail buttons (check both installed and available)
	allItems := append(append([]marketplaceItem{}, m.mktInstalled...), m.mktAvailable...)
	for _, item := range allItems {
		if zone.Get("mkt-detail-"+item.slug).InBounds(msg) {
			m.mktDetail = true
			m.mktDetailItem = item
			m.mktDetailReadme = ""
			m.mktDetailScroll = 0
			if item.dir != "" {
				return m, loadMktReadme(item.slug, item.dir)
			}
			if item.repo != "" {
				return m, fetchMktReadme(item.slug, item.repo)
			}
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

// overlayMktDetails renders a centered details modal for a marketplace item.
func (m *tuiModel) overlayMktDetails(maxH int) string {
	item := m.mktDetailItem

	// Title bar
	title := bold.Render(item.name)
	if item.version != "" {
		title += " " + dimStyle.Render("v"+item.version)
	}
	if item.author != "" {
		title += " " + dimStyle.Render("by "+item.author)
	}

	closeBtn := zone.Mark("mkt-detail-close", btnSecondary.Render("Close"))

	// Build content lines
	var contentLines []string
	contentLines = append(contentLines, title)
	contentLines = append(contentLines, "")

	// README content (primary content of the modal)
	if m.mktDetailReadme != "" {
		readmeLines := strings.Split(m.mktDetailReadme, "\n")
		contentLines = append(contentLines, readmeLines...)
	} else if item.dir != "" {
		contentLines = append(contentLines, dimStyle.Render("No README.md found in bundle."))
	} else {
		// Not installed — show description and links
		if item.description != "" {
			contentLines = append(contentLines, item.description)
			contentLines = append(contentLines, "")
		}
		var links []string
		if item.repo != "" {
			links = append(links, "repo: "+strings.TrimSuffix(item.repo, ".git"))
		}
		if item.source != "" {
			links = append(links, "source: "+item.source)
		}
		for _, l := range links {
			contentLines = append(contentLines, dimStyle.Render(l))
		}
		if len(item.tags) > 0 {
			contentLines = append(contentLines, "")
			contentLines = append(contentLines, dimStyle.Render("Tags: "+strings.Join(item.tags, ", ")))
		}
		contentLines = append(contentLines, "")
		contentLines = append(contentLines, dimStyle.Render("Install the bundle to view the full README."))
	}

	dialogW := m.width - 6
	if dialogW > 100 {
		dialogW = 100
	}
	if dialogW < 40 {
		dialogW = m.width - 2
	}

	// Word-wrap long lines to fit dialog width (account for border + padding)
	contentW := dialogW - 4
	if contentW < 20 {
		contentW = 20
	}
	var wrappedLines []string
	for _, line := range contentLines {
		if lipgloss.Width(line) <= contentW {
			wrappedLines = append(wrappedLines, line)
		} else {
			// Simple word wrap
			words := strings.Fields(line)
			if len(words) == 0 {
				wrappedLines = append(wrappedLines, line)
				continue
			}
			cur := words[0]
			for _, w := range words[1:] {
				test := cur + " " + w
				if lipgloss.Width(test) > contentW {
					wrappedLines = append(wrappedLines, cur)
					cur = w
				} else {
					cur = test
				}
			}
			wrappedLines = append(wrappedLines, cur)
		}
	}
	contentLines = wrappedLines

	// Available height inside the dialog box (account for border + padding + close button)
	innerH := maxH - 8
	if innerH < 5 {
		innerH = 5
	}

	// Apply scroll (clamp to max scrollable position)
	maxScroll := len(contentLines) - innerH
	if maxScroll < 0 {
		maxScroll = 0
	}
	scroll := m.mktDetailScroll
	if scroll > maxScroll {
		scroll = maxScroll
		m.mktDetailScroll = scroll
	}
	if scroll < 0 {
		scroll = 0
		m.mktDetailScroll = 0
	}

	visible := contentLines
	if scroll < len(visible) {
		visible = visible[scroll:]
	} else {
		visible = nil
	}
	if len(visible) > innerH {
		visible = visible[:innerH]
	}

	bodyText := strings.Join(visible, "\n")

	// Scroll indicator
	scrollInfo := ""
	if maxScroll > 0 {
		scrollInfo = dimStyle.Render(fmt.Sprintf(" (%d/%d)", scroll+1, maxScroll+1))
	}

	content := bodyText + "\n\n" + closeBtn + scrollInfo

	borderFg := lipgloss.AdaptiveColor{Light: "236", Dark: "248"}
	dialogBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderFg).
		Padding(1, 2).
		Width(dialogW)

	rendered := dialogBox.Render(content)

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
