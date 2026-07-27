const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = fs.realpathSync(path.resolve(__dirname, ".."));
process.chdir(projectRoot);

const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteEntry, "--host", "0.0.0.0"], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
