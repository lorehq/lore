package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func cmdUpdate(args []string) {
	for _, a := range args {
		if a == "--help" || a == "-h" {
			fmt.Print(updateHelpText)
			return
		}
	}

	// Must be in a Lore instance
	if _, err := os.Stat(".lore/config.json"); err != nil {
		fatal("Not a Lore project (no .lore/config.json). Run from a Lore instance root.")
	}

	fmt.Println("Updating harness to latest...")

	// Clone latest lore repo to temp dir
	tmpDir, err := os.MkdirTemp("", "lore-update-*")
	if err != nil {
		fatal("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	tag := "v" + version
	if version == "dev" {
		tag = "main"
	}
	cloneCmd := exec.Command("git", "clone", "--depth", "1", "--branch", tag, repoURL, tmpDir)
	cloneCmd.Stderr = os.Stderr
	if err := cloneCmd.Run(); err != nil {
		fatal("Failed to clone lore repo (tag %s): %v", tag, err)
	}

	// Run sync-harness.sh: SOURCE → TARGET (cwd)
	syncScript := filepath.Join(tmpDir, ".lore", "harness", "scripts", "sync-harness.sh")
	if _, err := os.Stat(syncScript); err != nil {
		fatal("sync-harness.sh not found in cloned template")
	}

	cwd, _ := os.Getwd()
	syncCmd := exec.Command("bash", syncScript, tmpDir, cwd)
	syncCmd.Stdout = os.Stdout
	syncCmd.Stderr = os.Stderr
	if err := syncCmd.Run(); err != nil {
		fatal("Sync failed: %v", err)
	}

	// Also update global dir
	if err := ensureGlobalDir(false); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Could not update ~/.lore/: %v\n", err)
	}

	fmt.Println("Harness updated successfully.")
}

const updateHelpText = `Update the Lore harness to the latest version.

Usage: lore update

Must be run from a Lore project root (directory with .lore/config.json).
Clones the latest harness and runs sync-harness.sh to update in place.
`
