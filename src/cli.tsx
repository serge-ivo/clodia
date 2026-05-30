#!/usr/bin/env node
/** clodia — multi-agent Claude Code supervisor. */

import { resolve } from "node:path";
import { render } from "ink";
import { tmuxAvailable, createSession } from "./tmux.js";
import { ClodiaApp } from "./app.js";

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
	console.log(`
  \x1b[35m\x1b[1mclodia\x1b[0m — multi-agent Claude Code supervisor

  \x1b[1mUsage:\x1b[0m  clodia [path]

  Spawns a tmux session and lets you manage multiple Claude Code
  agents from a single dashboard. Each agent runs in its own tmux
  window — you can view output, approve permissions, kill agents,
  and attach directly.

  \x1b[1mRequirements:\x1b[0m
    - tmux (brew install tmux)
    - claude (Claude Code CLI)

  \x1b[1mKeys:\x1b[0m
    n        Spawn new agent (name + task)
    v        View selected agent's output
    a        Attach to agent's tmux window
    y/d      Approve/deny permission prompts
    k        Kill selected agent
    ↑/↓      Navigate agent list
    q        Quit (agents keep running in tmux)

  \x1b[1mExamples:\x1b[0m
    clodia              # manage agents in current directory
    clodia ~/myproject  # manage agents in specific project
`);
	process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
	console.log("0.1.0");
	process.exit(0);
}

// Preflight checks
if (!process.stdin.isTTY) {
	console.error("  \x1b[31mclodia requires an interactive terminal (TTY)\x1b[0m");
	process.exit(1);
}

if (!tmuxAvailable()) {
	console.error("  \x1b[31mtmux is required but not found\x1b[0m");
	console.error("  Install: \x1b[1mbrew install tmux\x1b[0m");
	process.exit(1);
}

const cwd = resolve(args.find((a) => !a.startsWith("-")) || ".");
createSession();
render(<ClodiaApp cwd={cwd} />, { exitOnCtrlC: true });
