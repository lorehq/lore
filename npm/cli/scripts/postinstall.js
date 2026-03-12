#!/usr/bin/env node

// Postinstall: bootstrap global directory and install the default bundle.
// No shipped files — everything is fetched via the binary's own commands.

const { execSync } = require("child_process");

const sudoUser = process.env.SUDO_USER;
const isRoot = process.getuid && process.getuid() === 0;

const logo = `
   _
  | |
  | | ___  _ __ ___
  | |/ _ \\| '__/ _ \\
  | | (_) | | |  __/
  |_|\\___/|_|  \\___|
`;

function run(cmd) {
  if (isRoot && sudoUser) {
    execSync(`su - ${sudoUser} -c "${cmd}"`, { stdio: "pipe", timeout: 30000 });
  } else {
    execSync(cmd, { stdio: "pipe", timeout: 30000 });
  }
}

try {
  console.log(logo);

  // Bootstrap ~/.config/lore/ — dirs, harness seeds, examples
  process.stdout.write("  Setting up...");
  run("lore version");
  process.stdout.write(" done.\n");

  // Install default bundle (lore-os)
  process.stdout.write("  Installing lore-os...");
  run("lore bundle install lore-os --url https://github.com/lorehq/lore-os.git");
  process.stdout.write(" done.\n\n");
} catch (e) {
  // Binary not yet in PATH during install — will bootstrap on first user command
  console.log("");
}
