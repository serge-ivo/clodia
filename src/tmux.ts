/** tmux control primitives — create sessions, send keys, read panes. */

import { execFileSync } from "node:child_process";

const SESSION = "clodia";

export function tmuxAvailable(): boolean {
	try {
		tmux("-V");
		return true;
	} catch {
		return false;
	}
}

export function sessionExists(): boolean {
	try {
		tmux("has-session", "-t", SESSION);
		return true;
	} catch {
		return false;
	}
}

export function createSession(): void {
	if (sessionExists()) return;
	// Create detached session with a dashboard window
	tmux("new-session", "-d", "-s", SESSION, "-n", "dashboard");
}

export function killSession(): void {
	try {
		tmux("kill-session", "-t", SESSION);
	} catch { /* already dead */ }
}

export function createAgentPane(name: string, cwd: string): void {
	// Create a new window for the agent
	tmux("new-window", "-t", SESSION, "-n", name, "-c", cwd);
}

export function sendKeys(pane: string, text: string): void {
	// Use send-keys with literal flag to avoid key interpretation issues
	tmux("send-keys", "-t", target(pane), text, "Enter");
}

export function sendRaw(pane: string, keys: string): void {
	tmux("send-keys", "-t", target(pane), keys);
}

export function readPane(pane: string): string {
	try {
		return tmux("capture-pane", "-t", target(pane), "-p", "-S", "-50").trim();
	} catch {
		return "";
	}
}

export function listWindows(): { index: number; name: string; active: boolean }[] {
	try {
		const out = tmux("list-windows", "-t", SESSION, "-F", "#{window_index}:#{window_name}:#{window_active}").trim();
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
		tmux("kill-window", "-t", target(name));
	} catch { /* already dead */ }
}

export function selectWindow(name: string): void {
	try {
		tmux("select-window", "-t", target(name));
	} catch { /* ignore */ }
}

function target(windowName: string): string {
	return `${SESSION}:${windowName}`;
}

function tmux(...args: string[]): string {
	return execFileSync("tmux", args, {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
	});
}
