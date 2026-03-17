package main

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// cardBorderFg is the shared border color for explore cards.
var cardBorderFg = lipgloss.AdaptiveColor{Light: "236", Dark: "248"}

// renderCard wraps contentLines in a rounded border box at fullWidth and returns individual lines.
// Each contentLine can contain zone marks and ANSI styling.
func renderCard(contentLines []string, fullWidth int) []string {
	cardW := fullWidth - 4 // 2 char margin on each side
	if cardW < 20 {
		cardW = 20
	}

	cardStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(cardBorderFg).
		Padding(0, 1).
		Width(cardW)

	content := strings.Join(contentLines, "\n")
	rendered := cardStyle.Render(content)
	lines := strings.Split(rendered, "\n")
	// Indent card with 2-space left margin
	for i, line := range lines {
		lines[i] = "  " + line
	}
	return lines
}
