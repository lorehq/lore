package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	catppuccin "github.com/catppuccin/go"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/glamour/ansi"
	"github.com/charmbracelet/glamour/styles"
	"github.com/charmbracelet/lipgloss"
	"github.com/creack/pty"
	"github.com/hinshun/vt10x"
	"github.com/lrstanley/bubblezone"
)

var _dbgLog *os.File

func init() {
	if f, err := os.OpenFile("/tmp/lore-debug.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644); err == nil {
		_dbgLog = f
	}
}

func dbg(format string, args ...any) {
	if _dbgLog != nil {
		fmt.Fprintf(_dbgLog, format+"\n", args...)
	}
}

// --- Theme Abstraction ---

type Theme struct {
	Name      string
	Base      string
	Text      string
	Subtext   string
	Highlight string
	Accent    string
	Special   string
	Border    string
	IsLight   bool
}

func getCatppuccinTheme(flavor catppuccin.Flavor, name string) Theme {
	return Theme{
		Name:      name,
		Base:      flavor.Base().Hex,
		Text:      flavor.Text().Hex,
		Subtext:   flavor.Overlay0().Hex,
		Highlight: flavor.Mauve().Hex,
		Accent:    flavor.Blue().Hex,
		Special:   flavor.Green().Hex,
		Border:    flavor.Surface1().Hex,
		IsLight:   flavor == catppuccin.Latte,
	}
}

func SolarizedDarkTheme() Theme {
	return Theme{
		Name:      "Solarized Dark",
		Base:      "#002b36",
		Text:      "#839496",
		Subtext:   "#586e75",
		Highlight: "#268bd2",
		Accent:    "#2aa198",
		Special:   "#859900",
		Border:    "#073642",
		IsLight:   false,
	}
}

func SolarizedLightTheme() Theme {
	return Theme{
		Name:      "Solarized Light",
		Base:      "#fdf6e3",
		Text:      "#657b83",
		Subtext:   "#93a1a1",
		Highlight: "#268bd2",
		Accent:    "#2aa198",
		Special:   "#859900",
		Border:    "#93a1a1",
		IsLight:   true,
	}
}

// Inverse returns the logical opposite theme for document viewing
func (t Theme) Inverse() Theme {
	if t.IsLight {
		// Use Mocha as default dark
		return getCatppuccinTheme(catppuccin.Mocha, "Mocha")
	}
	// Default to Solarized Light or Latte
	if strings.Contains(t.Name, "Solarized") {
		return SolarizedLightTheme()
	}
	return getCatppuccinTheme(catppuccin.Latte, "Latte")
}

var allThemes = []Theme{
	getCatppuccinTheme(catppuccin.Mocha, "Mocha"),
	getCatppuccinTheme(catppuccin.Macchiato, "Macchiato"),
	getCatppuccinTheme(catppuccin.Frappe, "Frappe"),
	getCatppuccinTheme(catppuccin.Latte, "Latte"),
	SolarizedDarkTheme(),
	SolarizedLightTheme(),
}

// --- Theme StyleSheet ---

type StyleSheet struct {
	Base       lipgloss.Style
	Background lipgloss.Style
	Panel      lipgloss.Style
	Active     lipgloss.Style
	Header     lipgloss.Style
	Dim        lipgloss.Style
	Title      lipgloss.Style
	Border     lipgloss.Style
}

func (t Theme) ToStyleSheet() StyleSheet {
	bg := lipgloss.Color(t.Base)
	fg := lipgloss.Color(t.Text)
	accent := lipgloss.Color(t.Accent)
	special := lipgloss.Color(t.Special)
	border := lipgloss.Color(t.Border)
	subtext := lipgloss.Color(t.Subtext)

	// Every style MUST have the background set to prevent terminal bleed
	base := lipgloss.NewStyle().Background(bg).Foreground(fg)
	
	return StyleSheet{
		Base:       base,
		Background: base.Copy(),
		Panel:      base.Copy(),
		Active:     base.Copy().Foreground(special).Bold(true),
		Header:     base.Copy().Foreground(accent).Bold(true),
		Dim:        base.Copy().Foreground(subtext),
		Title:      base.Copy().Foreground(special).Bold(true),
		Border:     base.Copy().Foreground(border),
	}
}

// hexToAnsiBg converts a #RRGGBB hex color to an ANSI 24-bit background escape.
func hexToAnsiBg(hex string) string {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return ""
	}
	r, _ := strconv.ParseInt(hex[0:2], 16, 64)
	g, _ := strconv.ParseInt(hex[2:4], 16, 64)
	b, _ := strconv.ParseInt(hex[4:6], 16, 64)
	return fmt.Sprintf("\033[48;2;%d;%d;%dm", r, g, b)
}

// reInjectBg prepends the background code and re-injects it after every
// \033[0m / \033[m reset so mid-line resets don't bleed the terminal default.
func reInjectBg(s, hexBg string) string {
	bg := hexToAnsiBg(hexBg)
	if bg == "" {
		return s
	}
	s = strings.ReplaceAll(s, "\033[0m", "\033[0m"+bg)
	s = strings.ReplaceAll(s, "\033[m", "\033[m"+bg)
	return bg + s
}

// setGlamourBackground pins every glamour element's background to `bg`.
// This prevents terminal-default bleed when glamour emits \033[0m resets
// inside the rendered output — lipgloss wrappers alone cannot patch those.
func setGlamourBackground(cfg *ansi.StyleConfig, bg string) {
	set := func(p *ansi.StylePrimitive) {
		c := bg
		p.BackgroundColor = &c
	}
	set(&cfg.Document.StylePrimitive)
	set(&cfg.BlockQuote.StylePrimitive)
	set(&cfg.Paragraph.StylePrimitive)
	set(&cfg.List.StylePrimitive)
	set(&cfg.Heading.StylePrimitive)
	set(&cfg.H1.StylePrimitive)
	set(&cfg.H2.StylePrimitive)
	set(&cfg.H3.StylePrimitive)
	set(&cfg.H4.StylePrimitive)
	set(&cfg.H5.StylePrimitive)
	set(&cfg.H6.StylePrimitive)
	set(&cfg.Text)
	set(&cfg.Code.StylePrimitive)
	set(&cfg.Table.StylePrimitive)
	set(&cfg.Link)
	set(&cfg.LinkText)
	set(&cfg.Image)
	set(&cfg.ImageText)
	set(&cfg.CodeBlock.StylePrimitive)
}

// --- Style Manager (Legacy Adapter) ---

type StyleManager struct {
	theme Theme
}

func (s StyleManager) Get(t Theme) StyleSheet {
	return t.ToStyleSheet()
}

func (s StyleManager) bg() lipgloss.TerminalColor { return lipgloss.Color(s.theme.Base) }

func (s StyleManager) Base() lipgloss.Style {
	return lipgloss.NewStyle().Background(s.bg()).Foreground(lipgloss.Color(s.theme.Text))
}

func (s StyleManager) SolidLine(str string, width int) string {
	if width < 0 {
		width = 0
	}
	rendered := s.Base().Render(str)
	w := lipgloss.Width(rendered)
	if w >= width {
		return rendered
	}
	return rendered + s.Base().Render(strings.Repeat(" ", width-w))
}

func (s StyleManager) Window(w, h int) lipgloss.Style {
	bg := s.bg()
	return s.Base().
		Border(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color(s.theme.Border)).
		BorderBackground(bg).
		Width(w - 2).  // Account for left/right borders
		Height(h - 2) // Account for top/bottom borders
}

func (s StyleManager) Tab(active bool) lipgloss.Style {
	t := s.theme
	bg := lipgloss.Color(t.Base)
	style := lipgloss.NewStyle().
		Background(bg).
		Padding(0, 1).
		Foreground(lipgloss.Color(t.Subtext))

	if active {
		style = style.Foreground(lipgloss.Color(t.Accent)).Bold(true)
	}
	return style
}

func (s StyleManager) Button() lipgloss.Style {
	return lipgloss.NewStyle().
		Background(lipgloss.Color(s.theme.Highlight)).
		Foreground(lipgloss.Color(s.theme.Base)).
		Padding(0, 3).
		Bold(true)
}

// --- Model ---

type tuiModel struct {
	mode   sessionMode
	width  int
	height int

	theme  Theme
	styles StyleManager
	zone   *zone.Manager

	selectedPlatform tuiPlatform
	isLoreProject    bool

	// Multi-session console
	sessions      []*consoleSession
	activeSession int

	// Viewport for console scrollback display
	vp viewport.Model

	tabWidths     []int
	cursorVisible bool

	debugMouse bool
	lastMouse  tea.MouseMsg
	cwd        string

	// Settings state
	settingsCursor  int
	configProfile   string
	configPlatforms map[string]bool
	configDirty     bool
	settingsMessage string
	settingsLoaded  bool

	// Status state
	memoryRunning     bool
	globalDirExists   bool
	harnessAgents     []string
	harnessSkills     []string
	lastStatusRefresh time.Time

	// Memory tab state
	memFocusedPane     memPane
	projectMemoryItems []string
	globalMemoryItems  []string
	rawProject         []string
	rawGlobal          []string
	amVisibleKeys      []string // The raw redis keys currently listed
	amCursor           int
	amScroll           int
	dataBankRoot       *fileNode
	dbVisibleNodes []*fileNode
	dbCursor       int
	dbScroll       int

	// Viewer tab state
	viewerVP        viewport.Model
	viewerPath      string
	viewerContent   string
	viewerRaw       string // original un-rendered content
	viewerPlaintext bool   // true = show raw text, false = rendered markdown
	viewerEditing   bool
	viewerTA        textarea.Model
	viewerSaveMsg   string // transient status after save
}

type fileNode struct {
	Name     string
	Path     string
	IsDir    bool
	IsOpen   bool
	Loaded   bool
	Children []*fileNode
	Level    int
}

// consoleSession is a single PTY session (one per launched tool).
type consoleSession struct {
	id       int
	platform tuiPlatform
	label    string
	ptmx     *os.File
	cmd      *exec.Cmd
	term     vt10x.Terminal

	inputChan chan []byte

	scrollback []string // styled lines that scrolled off top of vt10x
	prevText   []string // plain text rows for scroll detection
	termContent string  // last rendered content string

	mouseTracking int
	sgrMouse      bool
	inAltScreen   bool
	alive         bool
	liveMode      bool      // true = viewport pinned to live bottom
	lastScrollFwd time.Time // rate-limit scroll forwarding
}

type tuiPlatform int

const (
	platformClaude tuiPlatform = iota
	platformGemini
)

func (p tuiPlatform) String() string { return [...]string{"Claude Code", "Gemini AI"}[p] }
func (p tuiPlatform) Cmd() string    { return [...]string{"claude", "gemini"}[p] }

type sessionMode int

const (
	modeDashboard sessionMode = iota
	modeConsole
	modeMemory
	modeSettings
)

type memPane int

const (
	paneActiveMemory memPane = iota
	paneDataBank
)

func (m sessionMode) String() string {
	switch m {
	case modeDashboard:
		return "Dashboard"
	case modeConsole:
		return "Console"
	case modeMemory:
		return "Memory"
	case modeSettings:
		return "Settings"
	default:
		return "Unknown"
	}
}

type ptyMsg struct {
	id   int
	data []byte
}
type sessionExitMsg struct{ id int }
type tickMsg time.Time
type statusRefreshMsg struct {
	memoryRunning   bool
	globalDirExists bool
	harnessAgents   []string
	harnessSkills   []string
}
func getProjectID() string {
	cwd, _ := os.Getwd()
	p := strings.TrimPrefix(cwd, "/")
	return strings.ReplaceAll(p, string(filepath.Separator), "-")
}

type hotMemoryMsg struct {
	projectItems []string
	globalItems  []string
	rawProject   []string
	rawGlobal    []string
}
type dataBankMsg *fileNode

func initialModel() *tuiModel {
	t := allThemes[0]
	_, err := os.Stat(".lore/config.json")
	isLore := err == nil
	profile := "off"
	if isLore {
		if p, _, err := readProjectConfig(); err == nil && p != "" {
			profile = p
		}
	}

	cwd, err := os.Getwd()
	if err != nil || cwd == "" {
		cwd, _ = filepath.Abs(".")
	}
	m := &tuiModel{
		mode:             modeDashboard,
		theme:            t,
		styles:           StyleManager{theme: t},
		zone:             zone.New(),
		selectedPlatform: platformClaude,
		isLoreProject:    isLore,
		cursorVisible:    true,
		configProfile:    profile,
		cwd:              cwd,
	}

	// Immediate population of system knowledge
	for _, a := range harnessAgents {
		m.harnessAgents = append(m.harnessAgents, a.Name)
	}
	for _, s := range harnessSkills {
		m.harnessSkills = append(m.harnessSkills, s.Name)
	}
	gp := globalPath()
	if _, err := os.Stat(gp); err == nil {
		m.globalDirExists = true
	}

	return m
}

func (m *tuiModel) initializeLore() error {
	dirs := []string{
		filepath.Join(".lore", "AGENTIC", "SKILLS"),
		filepath.Join(".lore", "AGENTIC", "AGENTS"),
		filepath.Join(".lore", "AGENTIC", "RULES"),
		"docs/knowledge",
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	configPath := filepath.Join(".lore", "config.json")
	defaultConfig := `{}`
	if err := os.WriteFile(configPath, []byte(defaultConfig), 0644); err != nil {
		return err
	}
	m.isLoreProject = true
	return nil
}

func (m *tuiModel) updateTheme(t Theme) {
	m.theme = t
	m.styles = StyleManager{theme: t}
	m.calculateTabWidths()
	if sess := m.activesess(); sess != nil && m.mode == modeConsole {
		sess.termContent = m.renderTerminalContent(sess)
		m.rebuildViewportContent()
	}
	// Re-render viewer content with new theme colors
	if m.viewerPath != "" {
		m.reRenderViewer()
	}
}

func (m *tuiModel) renderMarkdown(raw string, t Theme) string {
	// Start with a default glamour style
	var style ansi.StyleConfig
	if t.IsLight {
		style = styles.LightStyleConfig
	} else {
		style = styles.DarkStyleConfig
	}
	
	// Pin all backgrounds to the theme's base color so internal glamour
	// resets don't fall through to the terminal's own background.
	setGlamourBackground(&style, t.Base)

	r, _ := glamour.NewTermRenderer(
		glamour.WithStyles(style),
		glamour.WithWordWrap(m.width/3*2-20),
	)
	out, _ := r.Render(raw)
	return out
}

func (m *tuiModel) reRenderViewer() {
	if m.viewerPath == "" {
		return
	}

	// Re-fetch raw content only when we don't already have it cached
	if m.viewerRaw == "" {
		if strings.HasPrefix(m.viewerPath, "lore:hot:") {
			cmd := exec.Command("docker", "exec", "lore-lore-memory-1", "redis-cli", "HGETALL", m.viewerPath)
			out, err := cmd.Output()
			if err != nil {
				return
			}
			lines := strings.Split(strings.TrimSpace(string(out)), "\n")
			var md strings.Builder
			md.WriteString("# " + m.viewerPath + "\n\n")
			for i := 0; i < len(lines); i += 2 {
				if i+1 < len(lines) {
					md.WriteString("### " + lines[i] + "\n" + lines[i+1] + "\n\n")
				}
			}
			m.viewerRaw = md.String()
		} else {
			data, err := os.ReadFile(m.viewerPath)
			if err != nil {
				return
			}
			m.viewerRaw = string(data)
		}
	}

	var out string
	if m.viewerPlaintext {
		out = m.viewerRaw
	} else {
		out = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
	}
	m.viewerContent = out
	m.viewerVP.SetContent(out)
}

func (m *tuiModel) enterViewerEdit(pageW, pageH int) tea.Cmd {
	ta := textarea.New()
	ta.SetValue(m.viewerRaw)
	ta.SetWidth(pageW)
	ta.SetHeight(pageH)
	ta.ShowLineNumbers = false

	// Style with inverse theme colors
	inv := m.theme.Inverse()
	bg := lipgloss.Color(inv.Base)
	fg := lipgloss.Color(inv.Text)
	sub := lipgloss.Color(inv.Subtext)
	cur := lipgloss.Color(inv.Highlight)

	base := lipgloss.NewStyle().Background(bg).Foreground(fg)
	focused := textarea.Style{
		Base:             base,
		CursorLine:       base.Copy().Background(cur).Foreground(bg),
		CursorLineNumber: base.Copy().Foreground(sub),
		EndOfBuffer:      base.Copy().Foreground(sub),
		LineNumber:       base.Copy().Foreground(sub),
		Placeholder:      base.Copy().Foreground(sub),
		Prompt:           base.Copy().Foreground(sub),
		Text:             base,
	}
	ta.FocusedStyle = focused
	ta.BlurredStyle = focused
	ta.Prompt = ""

	focusCmd := ta.Focus()
	m.viewerTA = ta
	m.viewerEditing = true
	m.viewerSaveMsg = ""
	return focusCmd
}

func (m *tuiModel) saveViewerEdit() {
	if m.viewerPath == "" || strings.HasPrefix(m.viewerPath, "lore:hot:") {
		m.viewerEditing = false
		return
	}
	content := m.viewerTA.Value()
	if err := os.WriteFile(m.viewerPath, []byte(content), 0644); err != nil {
		m.viewerSaveMsg = "error: " + err.Error()
		return
	}
	m.viewerRaw = content
	if m.viewerPlaintext {
		m.viewerContent = m.viewerRaw
	} else {
		m.viewerContent = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
	}
	m.viewerVP.SetContent(m.viewerContent)
	m.viewerEditing = false
	m.viewerSaveMsg = "saved"
}

func (m *tuiModel) switchToConsole() tea.Cmd {
	m.mode = modeConsole
	if sess := m.activesess(); sess != nil {
		sess.termContent = m.renderTerminalContent(sess)
		m.rebuildViewportContent()
	}
	return nil
}

func (m *tuiModel) launchSelectedPlatform() tea.Cmd {
	// Always create a new session on launch.
	sess, sessCmd := m.newSession(platformClaude)
	if sess == nil {
		return nil
	}
	m.sessions = append(m.sessions, sess)
	m.activeSession = len(m.sessions) - 1
	return tea.Batch(m.switchToConsole(), sessCmd)
}

func (m *tuiModel) calculateTabWidths() {
	m.tabWidths = []int{
		lipgloss.Width(m.tabStyle(false).Render(" Dashboard ")),
		lipgloss.Width(m.tabStyle(false).Render(" Memory ")),
		lipgloss.Width(m.tabStyle(false).Render(" Settings ")),
	}
}

func (m *tuiModel) refreshHotMemory() tea.Cmd {
	return func() tea.Msg {
		projectID := getProjectID()
		msg := hotMemoryMsg{}

		// Helper to fetch and parse keys
		fetch := func(indexKey string) (pretty []string, raw []string) {
			cmd := exec.Command("docker", "exec", "lore-lore-memory-1", "redis-cli", "SMEMBERS", indexKey)
			out, err := cmd.Output()
			if err != nil {
				return nil, nil
			}
			lines := strings.Split(string(out), "\n")
			for _, l := range lines {
				l = strings.TrimSpace(l)
				if l == "" {
					continue
				}
				raw = append(raw, l)
				// Make key pretty: lore:hot:project:ID:note:foo -> foo (note)
				parts := strings.Split(l, ":")
				if len(parts) >= 2 {
					name := parts[len(parts)-1]
					kind := parts[len(parts)-2]
					pretty = append(pretty, fmt.Sprintf("%s (%s)", name, kind))
				} else {
					pretty = append(pretty, l)
				}
			}
			return pretty, raw
		}

		msg.projectItems, msg.rawProject = fetch("lore:hot:idx:project:" + projectID)
		msg.globalItems, msg.rawGlobal = fetch("lore:hot:idx:global")

		return msg
	}
}

func (m *tuiModel) refreshDataBank() tea.Cmd {
	return func() tea.Msg {
		gp := globalPath()
		dbPath := filepath.Join(gp, "MEMORY", "DATABANK")
		if _, err := os.Stat(dbPath); err != nil {
			return dataBankMsg(nil)
		}
		// Preserve open states if re-fetching
		root := &fileNode{Name: "DATABANK", Path: dbPath, IsDir: true, IsOpen: true, Level: 0}
		m.buildTree(root)
		return dataBankMsg(root)
	}
}

func (m *tuiModel) buildTree(node *fileNode) {
	if !node.IsDir || node.Loaded {
		return
	}
	entries, err := os.ReadDir(node.Path)
	if err != nil {
		return
	}
	node.Children = nil
	for _, e := range entries {
		child := &fileNode{
			Name:  e.Name(),
			Path:  filepath.Join(node.Path, e.Name()),
			IsDir: e.IsDir(),
			Level: node.Level + 1,
		}
		node.Children = append(node.Children, child)
	}
	node.Loaded = true

	// Always load the first few levels of the tree so it's ready
	if node.Level < 2 {
		for _, child := range node.Children {
			if child.IsDir {
				m.buildTree(child)
			}
		}
	}
}

func (m *tuiModel) loadRedisKey() {
	// Rebuild allItems list to map cursor correctly
	var allItems []string
	allItems = append(allItems, "") // Project header
	allItems = append(allItems, m.rawProject...)
	allItems = append(allItems, "", "") // Blank + Global header
	allItems = append(allItems, m.rawGlobal...)

	if m.amCursor < 0 || m.amCursor >= len(allItems) {
		return
	}
	key := allItems[m.amCursor]
	if key == "" {
		return // Header or blank
	}

	// Fetch hash
	cmd := exec.Command("docker", "exec", "lore-lore-memory-1", "redis-cli", "HGETALL", key)
	out, err := cmd.Output()
	if err != nil {
		return
	}

	// Format HGETALL output (alternating key/value lines)
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var md strings.Builder
	md.WriteString("# " + key + "\n\n")
	for i := 0; i < len(lines); i += 2 {
		if i+1 < len(lines) {
			k, v := lines[i], lines[i+1]
			md.WriteString("### " + k + "\n")
			md.WriteString(v + "\n\n")
		}
	}

	// Render
	m.viewerPath = key
	m.viewerRaw = md.String()
	var rendered string
	if m.viewerPlaintext {
		rendered = m.viewerRaw
	} else {
		rendered = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
	}
	m.viewerContent = rendered
	m.viewerVP.SetContent(rendered)
	m.viewerVP.GotoTop()
}

func (m *tuiModel) toggleNode(node *fileNode) {
	if !node.IsDir {
		// View the file
		data, err := os.ReadFile(node.Path)
		if err != nil {
			return
		}
		
		// Render markdown
		m.viewerPath = node.Path
		m.viewerRaw = string(data)
		var out string
		if m.viewerPlaintext {
			out = m.viewerRaw
		} else {
			out = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
		}
		m.viewerContent = out
		m.viewerVP.Width = m.width/3*2 - 4
		m.viewerVP.Height = m.height - 7
		m.viewerVP.SetContent(out)
		m.viewerVP.GotoTop()
		return
	}
	node.IsOpen = !node.IsOpen
	if node.IsOpen && !node.Loaded {
		m.buildTree(node)
	}
}

func (m *tuiModel) refreshStatus() tea.Cmd {
	return func() tea.Msg {
		msg := statusRefreshMsg{}

		// Check memory engine
		client := &http.Client{Timeout: 500 * time.Millisecond}
		
		// Try ports 9184 and 9185
		for _, port := range []string{"9184", "9185"} {
			url := "http://localhost:" + port
			resp, err := client.Get(url + "/health")
			if err == nil {
				msg.memoryRunning = (resp.StatusCode == 200)
				resp.Body.Close()
				if msg.memoryRunning {
					break
				}
			}
		}

		// Check global dir
		gp := globalPath()
		if _, err := os.Stat(gp); err == nil {
			msg.globalDirExists = true
		}

		// List agents/skills
		for _, a := range harnessAgents {
			msg.harnessAgents = append(msg.harnessAgents, a.Name)
		}
		for _, s := range harnessSkills {
			msg.harnessSkills = append(msg.harnessSkills, s.Name)
		}

		return msg
	}
}

func (m *tuiModel) tabStyle(active bool) lipgloss.Style {
	return m.styles.Tab(active)
}

func (m *tuiModel) windowStyle(w, h int) lipgloss.Style {
	return m.styles.Window(w, h)
}

func normalizeProfile(profile string) string {
	switch strings.ToLower(strings.TrimSpace(profile)) {
	case "minimal", "standard", "discovery", "off":
		return strings.ToLower(strings.TrimSpace(profile))
	case "":
		return ""
	default:
		return "off"
	}
}

func (m *tuiModel) activeProfile() string {
	if p := normalizeProfile(m.configProfile); p != "" {
		return p
	}
	if !m.isLoreProject {
		return "off"
	}
	profile, _, err := readProjectConfig()
	if err != nil {
		return "off"
	}
	p := normalizeProfile(profile)
	if p == "" {
		p = "off"
	}
	m.configProfile = p
	return p
}

func (m *tuiModel) profileLabel() string {
	return "Profile: " + m.activeProfile()
}

func (m *tuiModel) profileRadioLabel() string {
	active := m.activeProfile()
	options := []string{"minimal", "standard", "discovery", "off"}
	parts := make([]string, 0, len(options))
	for _, option := range options {
		mark := "○"
		if option == active {
			mark = "◉"
		}
		parts = append(parts, mark+" "+option)
	}
	return "Profile: " + strings.Join(parts, "  ")
}

func (m *tuiModel) renderButton(label string, focused bool) string {
	if focused {
		return m.styles.Button().Render(label)
	}
	return m.styles.Base().Foreground(lipgloss.Color(m.theme.Subtext)).Render("[ " + label + " ]")
}

func (m *tuiModel) statusPill(text string, color lipgloss.Color, filled bool) string {
	style := m.styles.Base().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(color).
		Foreground(color).
		Padding(0, 1)
	if filled {
		style = style.Background(color).Foreground(m.styles.bg()).Bold(true)
	}
	return style.Render(text)
}

const loreFiglet = `
 _                
| |               
| | ___  _ __ ___ 
| |/ _ \| '__/ _ \
| | (_) | | |  __/
|_|\___/|_|  \___|
`

func trimToRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	if max <= 1 {
		return string(r[:max])
	}
	return string(r[:max-1]) + "…"
}

func (m *tuiModel) renderOpsPanelWithTheme(title string, lines []string, w, h int, active bool, theme Theme) string {
	if w < 4 || h < 2 {
		return ""
	}

	styles := m.styles.Get(theme)
	borderColor := lipgloss.Color(theme.Border)
	if active {
		borderColor = lipgloss.Color(theme.Special)
	}
	if m.debugMouse {
		borderColor = lipgloss.Color("#FF00FF") // High-contrast Magenta for debugging
	}

	// Inner dimensions (inside the border)
	innerW := w - 2
	innerH := h - 2

	// Render the lines
	renderedLines := make([]string, 0, innerH)
	
	// Use pre-calculated base style for all lines
	lineStyle := styles.Panel.Copy().Width(innerW).MaxWidth(innerW)

	for i := 0; i < innerH; i++ {
		line := ""
		if i < len(lines) {
			line = lines[i]
		}
		renderedLines = append(renderedLines, lineStyle.Render(line))
	}

	content := strings.Join(renderedLines, "\n")
	
	// Borders
	b := lipgloss.RoundedBorder()
	top, left, right, bottom := b.Top, b.Left, b.Right, b.Bottom
	topLeft, topRight, bottomLeft, bottomRight := b.TopLeft, b.TopRight, b.BottomLeft, b.BottomRight

	borderStyle := lipgloss.NewStyle().Foreground(borderColor).Background(lipgloss.Color(theme.Base))

	// Build the top bar with title
	var topBar strings.Builder
	topBar.WriteString(borderStyle.Render(topLeft))
	if title != "" {
		label := " " + title + " "
		labelStyle := styles.Title.Copy().Bold(active)
		topBar.WriteString(labelStyle.Render(label))
		
		remaining := innerW - lipgloss.Width(label)
		if remaining > 0 {
			topBar.WriteString(borderStyle.Render(strings.Repeat(top, remaining)))
		}
	} else {
		topBar.WriteString(borderStyle.Render(strings.Repeat(top, innerW)))
	}
	topBar.WriteString(borderStyle.Render(topRight))

	// Build the middle section
	var middle strings.Builder
	rows := strings.Split(content, "\n")
	for _, row := range rows {
		middle.WriteString(borderStyle.Render(left))
		middle.WriteString(row)
		middle.WriteString(borderStyle.Render(right))
		middle.WriteString("\n")
	}

	// Build the bottom bar
	var bottomBar strings.Builder
	bottomBar.WriteString(borderStyle.Render(bottomLeft))
	bottomBar.WriteString(borderStyle.Render(strings.Repeat(bottom, innerW)))
	bottomBar.WriteString(borderStyle.Render(bottomRight))

	return topBar.String() + "\n" + middle.String() + bottomBar.String()
}

func (m *tuiModel) renderOpsPanel(title string, lines []string, w, h int, active bool) string {
	return m.renderOpsPanelWithTheme(title, lines, w, h, active, m.theme)
}

func dashboardTitle(maxWidth int) string {
	if maxWidth <= 0 {
		return ""
	}
	full := fmt.Sprintf("Lore - The agentic coding tool harness v%s", version)
	if lipgloss.Width(full) <= maxWidth {
		return full
	}
	short := fmt.Sprintf("Lore v%s", version)
	if lipgloss.Width(short) <= maxWidth {
		return short
	}
	return ""
}

// consoleDims returns the PTY dimensions derived from the current window size.
// cols = full window width; rows = content area height (window minus header+footer).
func (m *tuiModel) consoleDims() (cols, rows int) {
	cols, rows = m.width, m.height-2
	if cols < 1 {
		cols = 1
	}
	if rows < 1 {
		rows = 1
	}
	return
}

// newSession creates and starts a new PTY session for the given platform.
func (m *tuiModel) newSession(platform tuiPlatform) (*consoleSession, tea.Cmd) {
	cols, rows := m.consoleDims()
	c := exec.Command("bash", "-i")
	c.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	ptmx, err := pty.Start(c)
	if err != nil {
		return nil, nil
	}
	_ = pty.Setsize(ptmx, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})

	sess := &consoleSession{
		id:        len(m.sessions),
		platform:  platform,
		label:     platform.Cmd(),
		ptmx:      ptmx,
		cmd:       c,
		term:      vt10x.New(),
		inputChan: make(chan []byte, 500),
		alive:     true,
	}
	sess.term.Resize(cols, rows)

	// Input writer goroutine
	go func() {
		for data := range sess.inputChan {
			_, _ = ptmx.Write(data)
		}
	}()

	// Launch the platform tool after shell starts
	go func() {
		time.Sleep(150 * time.Millisecond)
		sess.inputChan <- []byte("\x15" + platform.Cmd() + "\r")
	}()

	return sess, tea.Batch(sess.readPTY(), waitForSessionExit(sess))
}

// readPTY blocks until PTY data is available then returns it.
// Single blocking read — no drain loop, keeps typing latency minimal.
func (s *consoleSession) readPTY() tea.Cmd {
	id, ptmx := s.id, s.ptmx
	return func() tea.Msg {
		buf := make([]byte, 32768)
		n, err := ptmx.Read(buf)
		if err != nil {
			return sessionExitMsg{id: id}
		}
		data := make([]byte, n)
		copy(data, buf[:n])
		return ptyMsg{id: id, data: data}
	}
}

func waitForSessionExit(sess *consoleSession) tea.Cmd {
	return func() tea.Msg {
		_ = sess.cmd.Wait()
		sess.alive = false
		sess.mouseTracking = 0
		return sessionExitMsg{id: sess.id}
	}
}

func (m *tuiModel) tick() tea.Cmd {
	return tea.Tick(time.Millisecond*500, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m *tuiModel) resizeTerminal(w, h int) {
	cols, rows := m.consoleDims()
	for _, sess := range m.sessions {
		if sess.alive {
			_ = pty.Setsize(sess.ptmx, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
			sess.term.Resize(cols, rows)
		}
	}
	m.vp.Width = cols
	m.vp.Height = rows
}

// activesess returns the active console session, or nil if none exists.
func (m *tuiModel) activesess() *consoleSession {
	if m.activeSession < len(m.sessions) {
		return m.sessions[m.activeSession]
	}
	return nil
}

// sessById returns the session with the given id, or nil.
func (m *tuiModel) sessById(id int) *consoleSession {
	for _, s := range m.sessions {
		if s.id == id {
			return s
		}
	}
	return nil
}

func keyToBytes(k tea.KeyMsg) []byte {
	switch k.Type {
	case tea.KeyRunes:
		return []byte(string(k.Runes))
	case tea.KeyEnter:
		return []byte("\r")
	case tea.KeyBackspace:
		return []byte("\x7f")
	case tea.KeyDelete:
		return []byte("\x1b[3~")
	case tea.KeyTab:
		return []byte("\t")
	case tea.KeyEsc:
		return []byte("\x1b")
	case tea.KeyUp:
		return []byte("\x1b[A")
	case tea.KeyDown:
		return []byte("\x1b[B")
	case tea.KeyRight:
		return []byte("\x1b[C")
	case tea.KeyLeft:
		return []byte("\x1b[D")
	case tea.KeyHome:
		return []byte("\x1b[H")
	case tea.KeyEnd:
		return []byte("\x1b[F")
	case tea.KeyPgUp:
		return []byte("\x1b[5~")
	case tea.KeyPgDown:
		return []byte("\x1b[6~")
	}
	if k.Type >= tea.KeyCtrlA && k.Type <= tea.KeyCtrlZ {
		return []byte{byte(k.Type - tea.KeyCtrlA + 1)}
	}
	return []byte(k.String())
}

// scanMouseMode detects when nested apps enable/disable mouse tracking
// by parsing CSI private mode sequences from PTY output. Handles both
// individual (\x1b[?1002h) and combined (\x1b[?1002;1006h) forms.
func (s *consoleSession) scanMouseMode(data []byte) {
	str := string(data)
	for i := 0; i < len(str)-3; i++ {
		if str[i] != '\x1b' || str[i+1] != '[' || str[i+2] != '?' {
			continue
		}
		j := i + 3
		for j < len(str) && ((str[j] >= '0' && str[j] <= '9') || str[j] == ';') {
			j++
		}
		if j >= len(str) || (str[j] != 'h' && str[j] != 'l') {
			continue
		}
		enable := str[j] == 'h'
		for _, p := range strings.Split(str[i+3:j], ";") {
			code, err := strconv.Atoi(p)
			if err != nil {
				continue
			}
			switch code {
			case 1000, 1002, 1003:
				if enable {
					s.mouseTracking = code
				} else if s.mouseTracking == code {
					s.mouseTracking = 0
				}
			case 1006:
				s.sgrMouse = enable
			case 1049:
				s.inAltScreen = enable
			}
		}
		i = j //nolint
	}
}

// encodeMouseEvent converts a bubbletea MouseMsg into the escape sequence
// format expected by the nested terminal application (SGR or X10).
func encodeMouseEvent(sess *consoleSession, msg tea.MouseMsg) []byte {
	// Scroll events are handled by lore's viewport — never forward to nested app.
	switch msg.Button {
	case tea.MouseButtonWheelUp, tea.MouseButtonWheelDown,
		tea.MouseButtonWheelLeft, tea.MouseButtonWheelRight:
		return nil
	}
	col := msg.X
	row := msg.Y - 2 // subtract header rows
	if col < 1 || row < 1 || sess.term == nil {
		return nil
	}
	termCols, termRows := sess.term.Size()
	if col > termCols || row > termRows {
		return nil
	}

	var button int
	isRelease := msg.Action == tea.MouseActionRelease
	isMotion := msg.Action == tea.MouseActionMotion

	switch msg.Button {
	case tea.MouseButtonLeft:
		button = 0
	case tea.MouseButtonMiddle:
		button = 1
	case tea.MouseButtonRight:
		button = 2
	case tea.MouseButtonWheelUp:
		button = 64
	case tea.MouseButtonWheelDown:
		button = 65
	case tea.MouseButtonWheelLeft:
		button = 66
	case tea.MouseButtonWheelRight:
		button = 67
	case tea.MouseButtonBackward:
		button = 128
	case tea.MouseButtonForward:
		button = 129
	case tea.MouseButtonNone:
		button = 3
	default:
		return nil
	}

	// Filter events based on the tracking mode the nested app requested.
	if isMotion {
		if sess.mouseTracking < 1002 {
			return nil // X10 mode: no motion events
		}
		if sess.mouseTracking < 1003 && msg.Button == tea.MouseButtonNone {
			return nil // Button-event mode: only drag, not free motion
		}
		if button < 64 {
			button |= 32 // set motion flag for non-wheel buttons
		}
	}

	if msg.Shift {
		button |= 4
	}
	if msg.Alt {
		button |= 8
	}
	if msg.Ctrl {
		button |= 16
	}

	if sess.sgrMouse {
		suffix := byte('M')
		if isRelease {
			suffix = 'm'
		}
		return []byte(fmt.Sprintf("\x1b[<%d;%d;%d%c", button, col, row, suffix))
	}

	// X10/normal encoding
	if isRelease {
		button = 3
	}
	return []byte{'\x1b', '[', 'M', byte(button + 32), byte(col + 32), byte(row + 32)}
}

func (m *tuiModel) vtToLipgloss(c vt10x.Color) lipgloss.TerminalColor {
	if c == vt10x.DefaultFG || c == vt10x.DefaultBG {
		return nil
	}
	if c > 255 {
		r, g, b := uint8((c>>16)&0xFF), uint8((c>>8)&0xFF), uint8(c&0xFF)
		return lipgloss.Color(fmt.Sprintf("#%02x%02x%02x", r, g, b))
	}
	return lipgloss.Color(strconv.Itoa(int(c)))
}

// --- Scrollback detection ---

// captureScreenText returns the plain text content of each vt10x row.
func (m *tuiModel) captureScreenText(sess *consoleSession) []string {
	cols, rows := sess.term.Size()
	lines := make([]string, rows)
	for y := 0; y < rows; y++ {
		var line strings.Builder
		for x := 0; x < cols; x++ {
			ch := sess.term.Cell(x, y).Char
			if ch == 0 {
				line.WriteRune(' ')
			} else {
				line.WriteRune(ch)
			}
		}
		lines[y] = line.String()
	}
	return lines
}

// detectScrolledLines compares previous and current screen text to determine
// how many lines scrolled off the top. Returns the count of scrolled lines.
func detectScrolledLines(prev, curr []string) int {
	if len(prev) == 0 || len(curr) == 0 || prev[0] == curr[0] {
		return 0
	}
	// Check if prev[shift:] aligns with curr[:len-shift] for small shifts
	for shift := 1; shift < len(prev) && shift <= 20; shift++ {
		if prev[shift] != curr[0] {
			continue
		}
		// Verify alignment with a few more rows
		match := true
		for i := 1; i < 3 && shift+i < len(prev) && i < len(curr); i++ {
			if prev[shift+i] != curr[i] {
				match = false
				break
			}
		}
		if match {
			return shift
		}
	}
	return 0
}

// renderTerminalRows renders each vt10x row as an individually styled string.
func (m *tuiModel) renderTerminalRows(sess *consoleSession) []string {
	if sess == nil || sess.term == nil {
		return []string{"PTY Loading..."}
	}
	cols, rows := sess.term.Size()
	cursor := sess.term.Cursor()
	result := make([]string, rows)

	for y := 0; y < rows; y++ {
		var b strings.Builder
		var lastFG, lastBG vt10x.Color = vt10x.DefaultFG, vt10x.DefaultBG
		var lastMode int16 = 0
		var chunk strings.Builder

		for x := 0; x < cols; x++ {
			glyph := sess.term.Cell(x, y)
			isCursor := x == cursor.X && y == cursor.Y && m.cursorVisible

			if x > 0 && (glyph.FG != lastFG || glyph.BG != lastBG || glyph.Mode != lastMode || isCursor) {
				b.WriteString(m.renderChunk(chunk.String(), lastFG, lastBG, lastMode))
				chunk.Reset()
			}

			char := string(glyph.Char)
			if glyph.Char == 0 {
				char = " "
			}
			chunk.WriteString(char)
			lastFG, lastBG, lastMode = glyph.FG, glyph.BG, glyph.Mode

			if isCursor {
				style := m.styles.Base().Reverse(true).Background(lipgloss.Color(m.theme.Text))
				b.WriteString(style.Render(chunk.String()))
				chunk.Reset()
				lastFG, lastBG, lastMode = 999, 999, 999
			}
		}
		if chunk.Len() > 0 {
			b.WriteString(m.renderChunk(chunk.String(), lastFG, lastBG, lastMode))
		}
		result[y] = b.String()
	}
	return result
}

// renderChunk applies vt10x cell attributes to a text chunk.
func (m *tuiModel) renderChunk(text string, fg, bg vt10x.Color, mode int16) string {
	style := m.styles.Base()
	if fgc := m.vtToLipgloss(fg); fgc != nil {
		style = style.Foreground(fgc)
	}
	if bgc := m.vtToLipgloss(bg); bgc != nil {
		style = style.Background(bgc)
	}
	if mode&(1<<2) != 0 {
		style = style.Bold(true)
	}
	if mode&(1<<0) != 0 {
		style = style.Reverse(true)
	}
	return style.Render(text)
}

func (m *tuiModel) renderTerminalContent(sess *consoleSession) string {
	return strings.Join(m.renderTerminalRows(sess), "\n")
}

// rebuildViewportContent sets the viewport content from scrollback + live screen.
// If the viewport was at the bottom (live mode), it stays at the bottom.
func (m *tuiModel) rebuildViewportContent() {
	sess := m.activesess()
	if sess == nil {
		m.vp.SetContent("No active session. Use Dashboard to launch a tool.")
		return
	}
	wasAtBottom := m.vp.AtBottom() || m.vp.TotalLineCount() <= m.vp.Height
	var full strings.Builder
	for _, line := range sess.scrollback {
		full.WriteString(line)
		full.WriteString("\n")
	}
	full.WriteString(sess.termContent)
	m.vp.SetContent(full.String())
	if wasAtBottom {
		m.vp.GotoBottom()
		if sess := m.activesess(); sess != nil {
			sess.liveMode = true
		}
	}
}

// --- TEA Implementation ---

func (m *tuiModel) Init() tea.Cmd { return tea.Batch(m.tick(), m.refreshStatus()) }

func (m *tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	switch msg := msg.(type) {
	case hotMemoryMsg:
		m.projectMemoryItems = msg.projectItems
		m.globalMemoryItems = msg.globalItems
		m.rawProject = msg.rawProject
		m.rawGlobal = msg.rawGlobal
		// Sync raw keys for display mapping
		m.amVisibleKeys = append(m.rawProject, m.rawGlobal...)
	case dataBankMsg:
		m.dataBankRoot = msg
	case statusRefreshMsg:
		m.memoryRunning = msg.memoryRunning
		m.globalDirExists = msg.globalDirExists
		m.harnessAgents = msg.harnessAgents
		m.harnessSkills = msg.harnessSkills
		m.lastStatusRefresh = time.Now()
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.resizeTerminal(msg.Width, msg.Height)
		m.calculateTabWidths()
		if sess := m.activesess(); sess != nil && m.mode == modeConsole {
			sess.termContent = m.renderTerminalContent(sess)
			m.rebuildViewportContent()
		}
	case tickMsg:
		m.cursorVisible = !m.cursorVisible
		if sess := m.activesess(); sess != nil && sess.alive && m.mode == modeConsole {
			sess.termContent = m.renderTerminalContent(sess)
			m.rebuildViewportContent()
		}
		if time.Since(m.lastStatusRefresh) > 5*time.Second {
			cmds = append(cmds, m.refreshStatus())
			if m.mode == modeMemory {
				cmds = append(cmds, m.refreshHotMemory(), m.refreshDataBank())
			}
		}
		cmds = append(cmds, m.tick())
	case ptyMsg:
		sess := m.sessById(msg.id)
		if sess != nil && sess.alive {
			prevTracking := sess.mouseTracking
			wasAltScreen := sess.inAltScreen
			sess.scanMouseMode(msg.data)
			// When an app leaves altscreen (e.g. Claude /exit), clear stale scrollback
			if wasAltScreen && !sess.inAltScreen {
				sess.scrollback = sess.scrollback[:0]
				sess.mouseTracking = 0
				sess.liveMode = true
			}
			if sess.mouseTracking != prevTracking {
				if sess.mouseTracking > 0 {
					cmds = append(cmds, tea.EnableMouseCellMotion)
				} else {
					cmds = append(cmds, tea.DisableMouse)
				}
			}

			isActive := m.mode == modeConsole && m.activesess() == sess
			if isActive {
				preTxt := sess.prevText
				preRows := m.renderTerminalRows(sess)
				_, _ = sess.term.Write(msg.data)
				postTxt := m.captureScreenText(sess)
				sess.prevText = postTxt
				if scrolled := detectScrolledLines(preTxt, postTxt); scrolled > 0 && scrolled <= len(preRows) {
					sess.scrollback = append(sess.scrollback, preRows[:scrolled]...)
					if len(sess.scrollback) > 5000 {
						sess.scrollback = sess.scrollback[len(sess.scrollback)-5000:]
					}
				}
				sess.termContent = m.renderTerminalContent(sess)
				m.rebuildViewportContent()
			} else {
				_, _ = sess.term.Write(msg.data)
			}
			cmds = append(cmds, sess.readPTY())
		}
	case sessionExitMsg:
		if sess := m.sessById(msg.id); sess != nil {
			sess.alive = false
			sess.mouseTracking = 0
			sess.termContent = fmt.Sprintf("\n  [%s session ended]\n", sess.label)
			if m.mode == modeConsole && m.activesess() == sess {
				m.rebuildViewportContent()
			}
			cmds = append(cmds, tea.DisableMouse)
		}
	case tea.MouseMsg:
		m.lastMouse = msg
		isScroll := msg.Button == tea.MouseButtonWheelUp || msg.Button == tea.MouseButtonWheelDown ||
			msg.Button == tea.MouseButtonWheelLeft || msg.Button == tea.MouseButtonWheelRight
		isLeftPress := msg.Button == tea.MouseButtonLeft && msg.Action == tea.MouseActionPress

		// ── Edit mode: only save/cancel buttons respond. Everything else is dropped.
		// This prevents ALL mouse escape sequences from leaking into the textarea.
		// Buttons are in title row (Y==1): ┌ + space + "[3] Viewer " (13 chars) + [ save ] (8) + space + [ cancel ] (10)
		if m.mode == modeMemory && m.viewerEditing {
			if isLeftPress && msg.Y == 1 {
				leftW := m.width / 3
				xOff := leftW + 13 // after border ┌ + leading space + "[3] Viewer "
				if msg.X >= xOff && msg.X < xOff+8 {
					m.saveViewerEdit()
					return m, nil
				}
				if msg.X >= xOff+9 && msg.X < xOff+19 {
					m.viewerEditing = false
					return m, nil
				}
			}
			return m, tea.Batch(cmds...)
		}

		// ── Console mode: forward to active session or scroll viewport
		if m.mode == modeConsole && msg.Y > 1 {
			if sess := m.activesess(); sess != nil && sess.alive {
				if isScroll {
					if sess.liveMode {
						// Live view: forward scroll-up to app, drop scroll-down (already at end)
						if msg.Button == tea.MouseButtonWheelUp {
							sess.liveMode = false
							m.vp.ScrollUp(3)
						}
						// WheelDown at live bottom: drop entirely — never forward to PTY
					} else {
						// Scrolled back: move lore viewport only, nothing reaches PTY
						if msg.Button == tea.MouseButtonWheelUp {
							m.vp.ScrollUp(3)
						} else {
							m.vp.ScrollDown(3)
							if m.vp.AtBottom() {
								sess.liveMode = true
							}
						}
					}
				} else if sess.mouseTracking > 0 {
					// Non-scroll mouse: forward to nested app
					if encoded := encodeMouseEvent(sess, msg); encoded != nil {
						_, _ = sess.ptmx.Write(encoded)
					}
				}
			} else if isScroll {
				if msg.Button == tea.MouseButtonWheelUp {
					m.vp.ScrollUp(3)
				} else {
					m.vp.ScrollDown(3)
				}
			}
			return m, tea.Batch(cmds...)
		}

		// ── Scroll wheel: direct scroll, no viewport.Update() indirection
		if isScroll {
			if m.mode == modeMemory && !m.viewerEditing && msg.X >= m.width/3 {
				if msg.Button == tea.MouseButtonWheelUp {
					m.viewerVP.ScrollUp(3)
				} else {
					m.viewerVP.ScrollDown(3)
				}
			}
			return m, nil
		}

		// ── Left-click dispatch (all non-editing, non-console modes)
		if !isLeftPress {
			return m, tea.Batch(cmds...)
		}

		// Static tab bar (Dashboard, Memory, Settings)
		tabModes := []sessionMode{modeDashboard, modeMemory, modeSettings}
		for i, mode := range tabModes {
			if m.zone.Get(fmt.Sprintf("tab-%d", i)).InBounds(msg) {
				m.mode = mode
				if m.mode == modeMemory {
					return m, tea.Batch(m.refreshHotMemory(), m.refreshDataBank())
				}
				return m, nil
			}
		}

		// Session radio buttons
		for i := range m.sessions {
			if m.zone.Get(fmt.Sprintf("sess-%d", i)).InBounds(msg) {
				m.activeSession = i
				return m, m.switchToConsole()
			}
		}

		// Profile radio buttons
		profNames := []string{"off", "minimal", "standard", "discovery"}
		for i, name := range profNames {
			if m.zone.Get(fmt.Sprintf("prof-%d", i)).InBounds(msg) {
				m.configProfile = name
				if m.isLoreProject {
					_ = writeProjectConfig(m.configProfile, m.configPlatforms)
				}
				return m, nil
			}
		}

		// Footer theme buttons
		for i, t := range allThemes {
			if m.zone.Get(fmt.Sprintf("theme-%d", i)).InBounds(msg) {
				m.updateTheme(t)
				return m, nil
			}
		}

		// Dashboard buttons
		if m.mode == modeDashboard {
			if m.zone.Get("dash-init").InBounds(msg) {
				_ = m.initializeLore()
				return m, nil
			}
			if m.zone.Get("dash-launch").InBounds(msg) {
				return m, m.launchSelectedPlatform()
			}
		}

		// Memory tab buttons and pane items
		if m.mode == modeMemory {
			// Viewer title buttons — coordinate-based (Y==1 = top border row of viewer panel)
			// Layout: ┌(leftW) + space + "[3] Viewer "(11) = 13 chars before first button
			if msg.Y == 1 && msg.X >= m.width/3 {
				leftW := m.width / 3
				xOff := leftW + 13
				modeBtnW := 6 // "[ md ]"
				if m.viewerPlaintext {
					modeBtnW = 7 // "[ txt ]"
				}
				if msg.X >= xOff && msg.X < xOff+modeBtnW {
					m.viewerPlaintext = !m.viewerPlaintext
					if m.viewerRaw != "" {
						if m.viewerPlaintext {
							m.viewerContent = m.viewerRaw
						} else {
							m.viewerContent = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
						}
						m.viewerVP.SetContent(m.viewerContent)
					}
					return m, nil
				}
				isFileBtn := m.viewerPath != "" && !strings.HasPrefix(m.viewerPath, "lore:hot:")
				if isFileBtn && m.viewerRaw != "" {
					editBtnStart := xOff + modeBtnW + 1
					if msg.X >= editBtnStart && msg.X < editBtnStart+8 {
						rightW := m.width - m.width/3
						innerW := rightW - 2
						innerH := m.height - 2 - 3
						pagePadX, pagePadY := 10, 4
						pageW, pageH := innerW-pagePadX*2, innerH-pagePadY*2
						if pageW < 20 {
							pageW = innerW
						}
						if pageH < 5 {
							pageH = innerH
						}
						return m, m.enterViewerEdit(pageW, pageH)
					}
				}
			}
			for i := 0; i < 100; i++ {
				if m.zone.Get(fmt.Sprintf("am-key-%d", i)).InBounds(msg) {
					m.memFocusedPane = paneActiveMemory
					m.amCursor = i
					m.loadRedisKey()
					return m, nil
				}
			}
			for i := 0; i < len(m.dbVisibleNodes); i++ {
				if m.zone.Get(fmt.Sprintf("db-node-%d", i)).InBounds(msg) {
					m.memFocusedPane = paneDataBank
					m.dbCursor = i
					m.toggleNode(m.dbVisibleNodes[i])
					return m, nil
				}
			}
		}

	case tea.KeyMsg:
		if msg.Type == tea.KeyCtrlC {
			return m, tea.Quit
		}
		if msg.Type == tea.KeyCtrlD {
			m.debugMouse = !m.debugMouse
			return m, nil
		}
		// F1-F3 switch static tabs; F4 reserved
		fTabModes := []sessionMode{modeDashboard, modeMemory, modeSettings}
		if msg.Type >= tea.KeyF1 && msg.Type <= tea.KeyF3 {
			m.mode = fTabModes[msg.Type-tea.KeyF1]
			if m.mode == modeMemory {
				return m, tea.Batch(m.refreshHotMemory(), m.refreshDataBank())
			}
			return m, nil
		}
		if m.mode == modeConsole {
			if sess := m.activesess(); sess != nil && sess.alive {
				b := keyToBytes(msg)
				// Drop CSI remnants from split or misdelivered mouse events.
				if len(b) >= 2 && b[0] == '[' && (b[1] == '<' || b[1] == 'M') {
					return m, nil
				}
				if len(b) >= 3 && b[0] == '\x1b' && b[1] == '[' && (b[2] == '<' || b[2] == 'M') {
					return m, nil
				}
				m.vp.GotoBottom()
				sess.inputChan <- b
			}
			return m, nil
		}
		if m.mode == modeDashboard {
			if msg.String() == "enter" {
				if !m.isLoreProject {
					_ = m.initializeLore()
					return m, nil
				}
				return m, m.launchSelectedPlatform()
			}
		}
		if m.mode == modeMemory && m.viewerEditing {
			switch msg.String() {
			case "ctrl+s":
				m.saveViewerEdit()
				return m, nil
			case "esc":
				m.viewerEditing = false
				return m, nil
			default:
				// Only forward genuine keystroke types to the textarea.
				// KeyRunes = printable text; named keys (arrows, backspace, etc.)
				// have Type >= 0 and the textarea handles them.
				// Anything with multiple runes that starts with '[' or '\x1b' is a
				// leaked mouse/escape sequence — drop it.
				if msg.Type == tea.KeyRunes && len(msg.Runes) > 1 {
					r0 := msg.Runes[0]
					if r0 == '[' || r0 == '\x1b' {
						return m, nil
					}
				}
				var cmd tea.Cmd
				m.viewerTA, cmd = m.viewerTA.Update(msg)
				return m, cmd
			}
		}
		if m.mode == modeMemory {
			switch msg.String() {
			case "tab":
				if m.memFocusedPane == paneActiveMemory {
					m.memFocusedPane = paneDataBank
				} else {
					m.memFocusedPane = paneActiveMemory
				}
				return m, nil
			case "e":
				if m.memFocusedPane == paneDataBank && m.dbCursor >= 0 && m.dbCursor < len(m.dbVisibleNodes) {
					node := m.dbVisibleNodes[m.dbCursor]
					if !node.IsDir {
						editor := os.Getenv("EDITOR")
						if editor == "" {
							editor = "vim"
						}
						c := exec.Command(editor, node.Path)
						return m, tea.ExecProcess(c, func(err error) tea.Msg {
							return nil
						})
					}
				}
				return m, nil
			case "up", "k":
				if m.memFocusedPane == paneActiveMemory {
					if m.amCursor > 0 {
						m.amCursor--
						if m.amCursor < m.amScroll {
							m.amScroll = m.amCursor
						}
					}
				} else {
					if m.dbCursor > 0 {
						m.dbCursor--
						if m.dbCursor < m.dbScroll {
							m.dbScroll = m.dbCursor
						}
					}
				}
				return m, nil
			case "down", "j":
				if m.memFocusedPane == paneActiveMemory {
					// 1 (header) + len(project) + 1 (blank) + 1 (header) + len(global)
					totalAM := 1 + len(m.projectMemoryItems) + 1 + 1 + len(m.globalMemoryItems)
					if m.amCursor < totalAM-1 {
						m.amCursor++
						h := (m.height - 5) / 3 // topH
						if m.amCursor >= m.amScroll+h-2 {
							m.amScroll = m.amCursor - (h - 2) + 1
						}
					}
				} else {
					if m.dbCursor < len(m.dbVisibleNodes)-1 {
						m.dbCursor++
						h := (m.height - 5) / 3 * 2 // bottomH
						if m.dbCursor >= m.dbScroll+h-2 {
							m.dbScroll = m.dbCursor - (h - 2) + 1
						}
					}
				}
				return m, nil
			case "enter", " ":
				if m.memFocusedPane == paneActiveMemory {
					m.loadRedisKey()
				} else {
					if m.dbCursor >= 0 && m.dbCursor < len(m.dbVisibleNodes) {
						m.toggleNode(m.dbVisibleNodes[m.dbCursor])
					}
				}
				return m, nil
			case "m":
				m.viewerPlaintext = !m.viewerPlaintext
				if m.viewerRaw != "" {
					var out string
					if m.viewerPlaintext {
						out = m.viewerRaw
					} else {
						out = m.renderMarkdown(m.viewerRaw, m.theme.Inverse())
					}
					m.viewerContent = out
					m.viewerVP.SetContent(out)
				}
				return m, nil
			case "pgup", "pgdown", "alt+up", "alt+down":
				var cmd tea.Cmd
				m.viewerVP, cmd = m.viewerVP.Update(msg)
				return m, cmd
			}
		}
		if m.mode == modeSettings {
			return m, m.handleSettingsKey(msg)
		}
		if m.mode != modeConsole && msg.String() == "q" {
			return m, m.switchToConsole()
		}
	}
	return m, tea.Batch(cmds...)
}

func (m *tuiModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Initializing..."
	}

	// 1. Get pre-calculated styles for current theme
	s := m.theme.ToStyleSheet()

	// Static tabs: Dashboard | Memory | Settings
	// modeConsole is entered via session buttons in the header, not a static tab.
	staticTabs := []struct {
		label string
		mode  sessionMode
	}{
		{" Dashboard ", modeDashboard},
		{" Memory ", modeMemory},
		{" Settings ", modeSettings},
	}
	var tabs []string
	currentW := 0
	for i, tab := range staticTabs {
		active := m.mode == tab.mode
		style := m.tabStyle(active)
		var t string
		if active {
			t = style.Render("[" + tab.label + "]")
		} else {
			t = style.Render(" " + tab.label + " ")
		}
		t = m.zone.Mark(fmt.Sprintf("tab-%d", i), t)
		tabs = append(tabs, t)
		currentW += lipgloss.Width(t)
	}
	fillerWidth := m.width - currentW
	if fillerWidth < 0 {
		fillerWidth = 0
	}

	// Profile radio buttons shown right of session buttons
	activeProf := m.activeProfile()
	type profDef struct {
		name  string
		color string
	}
	profDefs := []profDef{
		{"off", string(m.theme.Subtext)},
		{"minimal", "#a6e3a1"},
		{"standard", "#f9e2af"},
		{"discovery", "#f38ba8"},
	}
	var profBtns []string
	for i, pd := range profDefs {
		dot := "○"
		style := lipgloss.NewStyle().Foreground(lipgloss.Color(pd.color))
		if activeProf == pd.name {
			dot = "●"
			style = style.Bold(true)
		}
		btn := m.zone.Mark(fmt.Sprintf("prof-%d", i), style.Render(dot+" "+pd.name))
		profBtns = append(profBtns, btn)
	}
	profileBar := " " + strings.Join(profBtns, "  ") + " "
	if m.debugMouse {
		profileBar = fmt.Sprintf(" (%d,%d)", m.lastMouse.X, m.lastMouse.Y) + profileBar
	}

	// Session radio buttons (shown when sessions exist)
	var sessBar string
	if len(m.sessions) > 0 {
		var btns []string
		for i, sess := range m.sessions {
			radio := "○"
			label := sess.label
			if !sess.alive {
				radio = "✕"
			} else if i == m.activeSession {
				radio = "●"
			}
			txt := radio + " " + label
			var btn string
			if i == m.activeSession {
				btn = s.Active.Render(" " + txt + " ")
			} else {
				btn = s.Dim.Render(" " + txt + " ")
			}
			btns = append(btns, m.zone.Mark(fmt.Sprintf("sess-%d", i), btn))
		}
		sessBar = lipgloss.JoinHorizontal(lipgloss.Top, btns...)
	}

	// Filler: sessions left-aligned, title right-aligned
	sessW := lipgloss.Width(sessBar)
	profW := lipgloss.Width(profileBar)
	rightW := fillerWidth - sessW
	if rightW < profW {
		profileBar = ""
		rightW = fillerWidth - sessW
		if rightW < 0 {
			rightW = 0
		}
	}
	fillerRight := s.Background.Copy().Align(lipgloss.Right).Width(rightW).Render(profileBar)
	filler := sessBar + fillerRight

	headerRaw := lipgloss.JoinHorizontal(lipgloss.Top, append(tabs, filler)...)
	header := s.Background.Copy().Width(m.width).Render(headerRaw)
	header = m.zone.Mark("header", header)

	var content string
	contentH := m.height - 2
	if contentH < 1 {
		contentH = 1
	}
	switch m.mode {
	case modeDashboard:
		content = m.viewDashboard(contentH, s)
	case modeConsole:
		content = m.viewConsole(contentH, s)
	case modeMemory:
		content = m.viewMemory(contentH, s)
	case modeSettings:
		content = m.viewSettings(contentH, s)
	}
	// Pad content to exactly contentH lines with themed background so native
	// terminal color doesn't bleed through on short pages.
	if gap := contentH - lipgloss.Height(content); gap > 0 {
		blankLine := s.Background.Copy().Width(m.width).Render("")
		content += strings.Repeat("\n"+blankLine, gap)
	}
	content = m.zone.Mark("content", content)

	// Ultra-slim compact footer — theme buttons + version
	var themeButtons []string
	for i, t := range allThemes {
		var btn string
		if t.Name == m.theme.Name {
			txt := s.Base.Copy().Bold(true).Render(" " + t.Name + " ")
			btn = s.Base.Render("[") + txt + s.Base.Render("]")
		} else {
			btn = s.Dim.Copy().Padding(0, 1).Render(t.Name)
		}
		themeButtons = append(themeButtons, m.zone.Mark(fmt.Sprintf("theme-%d", i), btn))
	}

	versionInfo := s.Dim.Render("v" + version)
	if m.debugMouse {
		versionInfo = s.Active.Render(fmt.Sprintf("(%d,%d) ", m.lastMouse.X, m.lastMouse.Y)) + versionInfo
	}

	footerContent := lipgloss.JoinHorizontal(lipgloss.Top,
		lipgloss.JoinHorizontal(lipgloss.Top, themeButtons...),
	)

	// Right-align version — only if there's room for both the spacer and the label.
	availWidth := m.width - lipgloss.Width(footerContent)
	if spacerW := availWidth - lipgloss.Width(versionInfo); spacerW > 0 {
		footerContent += s.Base.Render(strings.Repeat(" ", spacerW)) + versionInfo
	}

	footer := s.Background.Copy().Width(m.width).Render(footerContent)

	// Combine manually to ensure zero extra whitespace
	ui := header + "\n" + content + "\n" + footer
	return m.zone.Scan(ui)
	}

func (m *tuiModel) viewMemory(h int, s StyleSheet) string {
	w := m.width
	if w < 60 || h < 10 {
		return s.Panel.Copy().Width(w).Height(h).Padding(1).Render("Resize window for Memory dashboard")
	}

	leftW := w / 3
	rightW := w - leftW

	// Left Pane Split
	topH := h / 3
	bottomH := h - topH

	// [1] Active Memory (Top Left)
	// We build a list of all items (Project header + items + Global header + items)
	var amDisplayLines []string
	var allItems []struct {
		text  string
		isKey bool
		raw   string
	}
	allItems = append(allItems, struct {
		text  string
		isKey bool
		raw   string
	}{"Project", false, ""})
	for i, item := range m.projectMemoryItems {
		allItems = append(allItems, struct {
			text  string
			isKey bool
			raw   string
		}{"  • " + item, true, m.rawProject[i]})
	}
	allItems = append(allItems, struct {
		text  string
		isKey bool
		raw   string
	}{"", false, ""})
	allItems = append(allItems, struct {
		text  string
		isKey bool
		raw   string
	}{"Global", false, ""})
	for i, item := range m.globalMemoryItems {
		allItems = append(allItems, struct {
			text  string
			isKey bool
			raw   string
		}{"  • " + item, true, m.rawGlobal[i]})
	}

	// Filter to scroll range for Active Memory
	startAM := m.amScroll
	for i := startAM; i < len(allItems) && len(amDisplayLines) < (topH-2); i++ {
		item := allItems[i]
		style := s.Panel.Copy()
		if !item.isKey && item.text != "" {
			style = s.Header.Copy()
		}
		if m.memFocusedPane == paneActiveMemory && i == m.amCursor {
			style = s.Active.Copy()
		}
		
		txt := style.Render(item.text)
		if item.isKey {
			txt = m.zone.Mark(fmt.Sprintf("am-key-%d", i), txt)
		}
		amDisplayLines = append(amDisplayLines, txt)
	}

	// [2] Data Bank (Bottom Left)
	m.dbVisibleNodes = nil
	dbLines := []string{}
	if m.dataBankRoot != nil {
		m.renderTreeNode(m.dataBankRoot, 0)
		start := m.dbScroll
		for i := start; i < len(m.dbVisibleNodes) && len(dbLines) < (bottomH-2); i++ {
			node := m.dbVisibleNodes[i]
			style := s.Panel.Copy()
			if m.memFocusedPane == paneDataBank && i == m.dbCursor {
				style = s.Active.Copy()
			} else if node.IsDir {
				style = s.Header.Copy()
			}
			marker := "  "
			if node.IsDir {
				marker = "▸ "
				if node.IsOpen {
					marker = "▾ "
				}
			}
			prefix := strings.Repeat("  ", node.Level)
			txt := style.Render(prefix+marker+node.Name)
			txt = m.zone.Mark(fmt.Sprintf("db-node-%d", i), txt)
			dbLines = append(dbLines, txt)
		}
	}

	// [3] Viewer (Right) - THE INSET PAGE
	innerW := rightW - 2
	innerH := h - 2

	// Page dimensions (inset from panel borders)
	pagePadX := 10
	pagePadY := 4
	pageW := innerW - (pagePadX * 2)
	pageH := innerH - (pagePadY * 2)

	if pageW < 20 { pageW = innerW }
	if pageH < 5 { pageH = innerH }

	inverseTheme := m.theme.Inverse()
	invStyles := inverseTheme.ToStyleSheet()

	// Build title buttons — no zone marks; coordinate-based click detection used instead
	btnStyle := func(label string) string {
		return s.Active.Render("[") + s.Header.Copy().Bold(true).Render(" "+label+" ") + s.Active.Render("]")
	}

	var finalViewerLines []string

	if m.viewerEditing {
		// Edit mode: show textarea filling the inset page area
		m.viewerTA.SetWidth(pageW)
		m.viewerTA.SetHeight(pageH)
		taLines := strings.Split(m.viewerTA.View(), "\n")
		for i := 0; i < innerH; i++ {
			var lineStr string
			if i < pagePadY || i >= pagePadY+pageH {
				lineStr = s.Panel.Copy().Width(innerW).Render("")
			} else {
				contentLine := ""
				if (i - pagePadY) < len(taLines) {
					contentLine = taLines[i-pagePadY]
				}
				contentLine = reInjectBg(contentLine, inverseTheme.Base)
				pageTxt := invStyles.Panel.Copy().Width(pageW).Render(contentLine)
				sidePad := s.Panel.Copy().Width(pagePadX).Render("")
				lineStr = sidePad + pageTxt + sidePad
			}
			finalViewerLines = append(finalViewerLines, lineStr)
		}
	} else {
		m.viewerVP.Width = pageW
		m.viewerVP.Height = pageH
		vpLines := strings.Split(m.viewerVP.View(), "\n")
		for i := 0; i < innerH; i++ {
			var lineStr string
			if i < pagePadY || i >= pagePadY+pageH {
				lineStr = s.Panel.Copy().Width(innerW).Render("")
			} else {
				contentLine := ""
				if (i - pagePadY) < len(vpLines) {
					contentLine = vpLines[i-pagePadY]
				}
				contentLine = reInjectBg(contentLine, inverseTheme.Base)
				pageTxt := invStyles.Panel.Copy().Width(pageW).Render(contentLine)
				sidePad := s.Panel.Copy().Width(pagePadX).Render("")
				lineStr = sidePad + pageTxt + sidePad
			}
			finalViewerLines = append(finalViewerLines, lineStr)
		}
	}

	left := lipgloss.JoinVertical(lipgloss.Left,
		m.renderOpsPanel("[1] Active Memory", amDisplayLines, leftW, topH, m.memFocusedPane == paneActiveMemory),
		m.renderOpsPanel("[2] Data Bank", dbLines, leftW, bottomH, m.memFocusedPane == paneDataBank),
	)

	// Build viewer title with buttons
	isFile := m.viewerPath != "" && !strings.HasPrefix(m.viewerPath, "lore:hot:")
	var viewerTitle string
	if m.viewerEditing {
		saveBtn := btnStyle("save")
		cancelBtn := btnStyle("cancel")
		saveMsgStr := ""
		if m.viewerSaveMsg != "" {
			saveMsgStr = "  " + s.Dim.Render(m.viewerSaveMsg)
		}
		viewerTitle = "[3] Viewer " + saveBtn + " " + cancelBtn + saveMsgStr
	} else {
		viewerModeLabel := "md"
		if m.viewerPlaintext {
			viewerModeLabel = "txt"
		}
		viewerTitle = "[3] Viewer " + btnStyle(viewerModeLabel)
		if isFile {
			viewerTitle += " " + btnStyle("edit")
		}
		if m.viewerSaveMsg != "" {
			viewerTitle += "  " + s.Dim.Render(m.viewerSaveMsg)
		}
	}

	viewerBox := m.renderOpsPanel(viewerTitle, finalViewerLines, rightW, h, m.viewerEditing)

	return lipgloss.JoinHorizontal(lipgloss.Top, left, viewerBox)
}

func (m *tuiModel) renderTreeNode(node *fileNode, depth int) {
	m.dbVisibleNodes = append(m.dbVisibleNodes, node)
	if node.IsDir && node.IsOpen {
		for _, child := range node.Children {
			m.renderTreeNode(child, depth+1)
		}
	}
}

func (m *tuiModel) viewDashboard(h int, s StyleSheet) string {
	w := m.width
	if w < 60 || h < 16 {
		return m.windowStyle(w, h).Padding(1).Render("Resize window for AI Operations Center")
	}

	leftW := w / 3
	if leftW < 36 {
		leftW = 36
	}
	if leftW > w-36 {
		leftW = w - 36
	}
	rightW := w - leftW

	// Left Pane Split (LazyDocker Style density)
	p1 := 4 // Project
	p2 := 8 // Harness
	p3 := 6 // Memory Engine
	p4 := h - (p1 + p2 + p3) // Sessions

	// [1]-Project
	projectName := filepath.Base(m.cwd)
	if projectName == "" || projectName == "." || projectName == "/" {
		projectName = m.cwd
	}
	projectLines := []string{projectName, m.cwd}

	// [2]-Harness
	harnessLines := []string{
		"Global Dir:   " + func() string {
			if m.globalDirExists {
				return "ready ✓"
			}
			return "not found ✗"
		}(),
		"CLI Version:  " + version,
		"Profile:      " + m.activeProfile(),
		"",
		"Active Agents: " + fmt.Sprintf("%d", len(m.harnessAgents)),
		"Active Skills: " + fmt.Sprintf("%d", len(m.harnessSkills)),
	}

	// [3]-Memory Engine
	memoryLines := []string{
		"Status: " + func() string {
			if m.memoryRunning {
				return "online ✓"
			}
			return "offline ✗"
		}(),
		"Port:   9185",
		"Prefix: lore:hot:*",
	}

	// [4]-Operations Panel
	actionLines := []string{}
	if !m.isLoreProject {
		btn := m.zone.Mark("dash-init", "[ INITIALIZE PROJECT ]")
		actionLines = append(actionLines, btn)
		actionLines = append(actionLines, "Enter: Initialize")
	} else {
		btn := m.zone.Mark("dash-launch", "[ LAUNCH ]")
		actionLines = append(actionLines, btn)
		actionLines = append(actionLines, "Enter: Launch AI shell")
	}

	// [5]-Current Sessions
	sessionLines := []string{"(no active sessions)"}

	// [Right Panel] About
	figRaw := strings.Split(strings.Trim(loreFiglet, "\n"), "\n")
	var rightLines []string
	rightLines = append(rightLines, "")
	for _, line := range figRaw {
		rightLines = append(rightLines, "  "+line)
	}
	rightLines = append(rightLines,
		"",
		"  Lore — The agentic coding tool harness",
		"",
		"  Copyright (c) 2026 LoreHQ",
		"  License: Apache-2.0",
		"",
		"  GitHub:  https://github.com/lorehq/lore-tui",
		"  Issues:  https://github.com/lorehq/lore-tui/issues",
		"",
		"  Harnessing AI agents for high-velocity engineering.",
	)

	p4 = 8 // Operations
	p5 := h - (p1 + p2 + p3 + p4) // Sessions

	left := lipgloss.JoinVertical(lipgloss.Left,
		m.renderOpsPanel("[1]-Project", projectLines, leftW, p1, true),
		m.renderOpsPanel("[2]-Harness", harnessLines, leftW, p2, false),
		m.renderOpsPanel("[3]-Memory Engine", memoryLines, leftW, p3, false),
		m.renderOpsPanel("[4]-Operations", actionLines, leftW, p4, false),
		m.renderOpsPanel("[5]-Current Sessions", sessionLines, leftW, p5, false),
	)
	right := m.renderOpsPanel("About", rightLines, rightW, h, false)

	return lipgloss.JoinHorizontal(lipgloss.Top, left, right)
}

func (m *tuiModel) viewConsole(h int, s StyleSheet) string {
	m.vp.Width = m.width
	m.vp.Height = h
	return s.Background.Copy().Width(m.width).Height(h).Render(m.vp.View())
}

// settingsRowCount returns the total number of navigable rows in settings.
// Layout: 3 profile radios (row 0-2), 6 platform checkboxes (row 3-8), 2 buttons (row 9-10).
const (
	settingsProfileStart  = 0
	settingsPlatformStart = 3
	settingsButtonStart   = 9
	settingsRowCount      = 11
)

var profileOptions = []string{"minimal", "standard", "discovery"}

func (m *tuiModel) loadSettings() {
	profile, platforms, err := readProjectConfig()
	if err != nil {
		m.configProfile = "standard"
		m.configPlatforms = defaultPlatforms()
	} else {
		m.configProfile = profile
		m.configPlatforms = platforms
	}
	m.configDirty = false
	m.settingsMessage = ""
	m.settingsLoaded = true
	m.settingsCursor = 0
}

func (m *tuiModel) handleSettingsKey(msg tea.KeyMsg) tea.Cmd {
	key := msg.String()

	switch key {
	case "q", "esc":
		return m.switchToConsole()
	case "up", "k":
		if m.settingsCursor > 0 {
			m.settingsCursor--
		}
	case "down", "j":
		if m.settingsCursor < settingsRowCount-1 {
			m.settingsCursor++
		}
	case " ", "x", "enter":
		m.settingsActivate()
	case "s":
		m.saveSettings()
	case "g":
		m.saveAndGenerate()
	}
	return nil
}

func (m *tuiModel) settingsActivate() {
	c := m.settingsCursor

	// Profile radio
	if c >= settingsProfileStart && c < settingsPlatformStart {
		m.configProfile = profileOptions[c-settingsProfileStart]
		m.configDirty = true
		m.settingsMessage = ""
		return
	}

	// Platform checkbox
	if c >= settingsPlatformStart && c < settingsButtonStart {
		idx := c - settingsPlatformStart
		if idx < len(validPlatforms) {
			p := validPlatforms[idx]
			m.configPlatforms[p] = !m.configPlatforms[p]
			m.configDirty = true
			m.settingsMessage = ""
		}
		return
	}

	// Buttons
	if c == settingsButtonStart {
		m.saveSettings()
	} else if c == settingsButtonStart+1 {
		m.saveAndGenerate()
	}
}

func (m *tuiModel) saveSettings() {
	if err := writeProjectConfig(m.configProfile, m.configPlatforms); err != nil {
		m.settingsMessage = "Error: " + err.Error()
		return
	}
	m.configDirty = false
	m.settingsMessage = "Saved"
}

func (m *tuiModel) saveAndGenerate() {
	m.saveSettings()
	if m.settingsMessage != "Saved" {
		return
	}
	enabled := enabledPlatformNames(m.configPlatforms)
	if len(enabled) == 0 {
		m.settingsMessage = "No platforms enabled"
		return
	}
	runProjection(enabled)
	m.settingsMessage = "Saved & regenerated"
}

func (m *tuiModel) viewSettings(h int, s StyleSheet) string {
	return s.Background.Copy().Width(m.width).Height(h).Render("")
}

// runTUI launches the interactive TUI.
func runTUI() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
