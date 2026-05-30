/** tmux control primitives — create sessions, send keys, read panes. */

import { execSync, execFileSync } from "node:child_process";

const SESSION = "clodia";

export function tmuxAvailable(): boolean {
	try {
		execSync("tmux -V", { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export function sessionExists(): boolean {
	try {
		execSync(`tmux has-session -t ${SESSION} 2>/dev/null`, { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export function createSession(): void {
	if (sessionExists()) return;
	// Create detached session with a dashboard window
	execSync(`tmux new-session -d -s ${SESSION} -n dashboard`, { stdio: "pipe" });
}

export function killSession(): void {
	try {
		execSync(`tmux kill-session -t ${SESSION}`, { stdio: "pipe" });
	} catch { /* already dead */ }
}

export function createAgentPane(name: string, cwd: string): void {
	// Create a new window for the agent
	execSync(`tmux new-window -t ${SESSION} -n ${name} -c ${shellEscape(cwd)}`, { stdio: "pipe" });
}

export function sendKeys(pane: string, text: string): void {
	// Use send-keys with literal flag to avoid key interpretation issues
	execFileSync("tmux", ["send-keys", "-t", `${SESSION}:${pane}`, text, "Enter"], { stdio: "pipe" });
}

export function sendRaw(pane: string, keys: string): void {
	execFileSync("tmux", ["send-keys", "-t", `${SESSION}:${pane}`, keys], { stdio: "pipe" });
}

export function readPane(pane: string): string {
	try {
		return execSync(`tmux capture-pane -t ${SESSION}:${pane} -p -S -50`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

export function listWindows(): { index: number; name: string; active: boolean }[] {
	try {
		const out = execSync(
			`tmux list-windows -t ${SESSION} -F "#{window_index}:#{window_name}:#{window_active}"`,
			{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();
		return out.split("\n").filter(Boolean).map((line) => {
			const [idx, name, active] = line.split(":");
			return { index: parseInt(idx, 10), name: name || "", active: active === "1" };
		});
	} catch {
		return [];
	}
}

export function killWindow(name: string): void {
	try {
		execSync(`tmux kill-window -t ${SESSION}:${name}`, { stdio: "pipe" });
	} catch { /* already dead */ }
}

export function selectWindow(name: string): void {
	try {
		execSync(`tmux select-window -t ${SESSION}:${name}`, { stdio: "pipe" });
	} catch { /* ignore */ }
}

function shellEscape(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}
