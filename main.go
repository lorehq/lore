package main

import (
	"fmt"
	"os"
)

// Set via ldflags at build time.
var (
	version = "0.1.13"
	commit  = "none"
)

const helpText = `Lore CLI — agentic coding, unified

Usage: lore [command]

Commands:
  (no args)                           Launch interactive TUI
  init [name] [--platforms <list>]    Initialize Lore (current dir or new dir)
  generate [--platforms <list>]       Generate platform files from rules, skills, and agents
  bundle <subcommand>                 Manage bundles (install, list, enable, disable, update, remove)
  hook <name>                         Hook handler (called by platforms)
  version                             Print version
  help                                Print this help

Options:
  --help, -h        Print this help
  --version, -v     Print version

Run 'lore <command> --help' for details on a specific command.
`

func main() {
	// Ensure global directory and harness seeds exist on every invocation.
	// Idempotent — creates dirs/seeds only if missing.
	_ = ensureGlobalDir()

	if len(os.Args) < 2 {
		runTUI()
		return
	}

	cmd := os.Args[1]
	switch cmd {
	case "init":
		cmdInit(os.Args[2:])
	case "generate":
		cmdGenerate(os.Args[2:])
	case "bundle":
		cmdBundle(os.Args[2:])
	case "hook":
		cmdHook(os.Args[2:])
	case "version", "--version", "-v":
		fmt.Printf("lore %s (%s)\n", version, commit)
	case "help", "--help", "-h":
		fmt.Print(helpText)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\nRun 'lore help' for usage.\n", cmd)
		os.Exit(1)
	}
}
