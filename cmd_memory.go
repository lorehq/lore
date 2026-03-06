package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func cmdMemory(args []string) {
	if len(args) == 0 {
		fmt.Print(memoryHelpText)
		return
	}

	action := args[0]
	if action == "--help" || action == "-h" {
		fmt.Print(memoryHelpText)
		return
	}

	gp := globalPath()
	composePath := filepath.Join(gp, "docker-compose.yml")

	if _, err := os.Stat(composePath); err != nil {
		fatal("No docker-compose.yml found at %s. Run 'lore init' first.", composePath)
	}

	switch action {
	case "start":
		run("docker", "compose", "-f", composePath, "up", "-d")
	case "stop":
		run("docker", "compose", "-f", composePath, "down")
	case "status":
		run("docker", "compose", "-f", composePath, "ps")
	default:
		fatal("Unknown memory action: %s\nValid actions: start, stop, status", action)
	}
}

func run(name string, args ...string) {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), "COMPOSE_PROJECT_NAME=lore")

	// Load .env from global dir for LORE_TOKEN
	envPath := filepath.Join(globalPath(), ".env")
	if data, err := os.ReadFile(envPath); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line[0] != '#' {
				cmd.Env = append(cmd.Env, line)
			}
		}
	}

	if err := cmd.Run(); err != nil {
		fatal("%s failed: %v", name, err)
	}
}


const memoryHelpText = `Manage the Lore memory engine (Docker containers).

Usage: lore memory <action>

Actions:
  start    Start Redis + memory engine containers
  stop     Stop containers
  status   Show container status

The memory engine runs from ~/.lore/docker-compose.yml.
`
