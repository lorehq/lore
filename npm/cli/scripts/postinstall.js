#!/usr/bin/env node

// Postinstall: bootstrap global directory and harness content.

const { execSync } = require("child_process");

const sudoUser = process.env.SUDO_USER;
const isRoot = process.getuid && process.getuid() === 0;

function run(cmd) {
  if (isRoot && sudoUser) {
    execSync(`su - ${sudoUser} -c "${cmd}"`, { stdio: "pipe", timeout: 30000 });
  } else {
    execSync(cmd, { stdio: "pipe", timeout: 30000 });
  }
}

try {
  // Bootstrap ~/.config/lore/ — dirs, harness seeds
  run("lore version");
} catch (e) {
  // Binary not yet in PATH during install — will bootstrap on first user command
}
