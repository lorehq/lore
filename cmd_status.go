package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func cmdStatus(args []string) {
	for _, a := range args {
		if a == "--help" || a == "-h" {
			fmt.Print(statusHelpText)
			return
		}
	}

	fmt.Println("Lore Status")
	fmt.Println("───────────")

	// Instance check
	configPath := ".lore/config.json"
	if _, err := os.Stat(configPath); err != nil {
		fmt.Println("Instance:  Not a Lore project (no .lore/config.json)")
	} else {
		data, err := os.ReadFile(configPath)
		if err == nil {
			var cfg map[string]interface{}
			if json.Unmarshal(stripJSONComments(data), &cfg) == nil {
				cwd, _ := os.Getwd()
				fmt.Printf("Instance:  %s\n", filepath.Base(cwd))
				if raw, ok := cfg["platforms"]; ok {
					platMap := parsePlatformsConfig(raw)
					enabled := enabledPlatformNames(platMap)
					if len(enabled) > 0 {
						fmt.Printf("Platforms: %v\n", enabled)
					}
				}
			}
		}
	}

	// Global dir
	gp := globalPath()
	if _, err := os.Stat(gp); err != nil {
		fmt.Println("Global:    ~/.lore/ not found")
	} else {
		fmt.Println("Global:    ~/.lore/ exists")

		// Check key dirs
		dirs := []string{"MEMORY", "AGENTIC"}
		for _, d := range dirs {
			if _, err := os.Stat(filepath.Join(gp, d)); err == nil {
				fmt.Printf("           %s/ ✓\n", d)
			} else {
				fmt.Printf("           %s/ ✗\n", d)
			}
		}
	}

	// Memory engine health
	engineUrl := getMemoryEngineUrl()
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(engineUrl + "/health")
	if err != nil {
		fmt.Println("Memory:    Not running")
	} else {
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			fmt.Println("Memory:    Running (healthy)")
		} else {
			fmt.Printf("Memory:    Running (status %d)\n", resp.StatusCode)
		}
	}

	// CLI version
	fmt.Printf("CLI:       v%s (%s)\n", version, commit)
}

const statusHelpText = `Show Lore instance and infrastructure health.

Usage: lore status

Checks:
  - Instance config (.lore/config.json)
  - Global directory (~/.lore/)
  - Memory engine health
  - CLI version
`
