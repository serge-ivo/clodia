/** Agent lifecycle — spawn, monitor, communicate with Claude Code instances. */

import { createAgentPane, readPane, sendKeys, killWindow } from "./tmux.js";

export type AgentStatus = "starting" | "busy" | "idle" | "permission" | "error" | "done" | "dead";

export interface Agent {
	name: string;
	task: string;
	cwd: string;
	status: AgentStatus;
	lastOutput: string;
	startedAt: number;
	messageCount: number;
}

/** Detect Claude Code's state from pane output. */
export function detectStatus(output: string): AgentStatus {
	if (!output || output.length < 5) return "starting";

	const lines = output.split("\n");
	const last20 = lines.slice(-20).join("\n");

	// Permission prompt — Claude is asking for approval
	if (/Allow|Approve|Deny|Do you want to|Y\/n|y\/N/i.test(last20)) return "permission";

	// Error states
	if (/Error:|FATAL|panic|Traceback/i.test(last20)) return "error";

	// Idle — Claude is waiting for input (prompt character visible)
	// Claude Code shows ">" or "❯" or the user prompt when idle
	const lastLine = lines.filter((l) => l.trim().length > 0).pop() || "";
	if (/^[>❯\$]\s*$/.test(lastLine.trim())) return "idle";

	// Check for common "done" indicators
	if (/completed|finished|done|All \d+ tests passed/i.test(last20)) {
		if (/^[>❯\$]\s*$/m.test(last20)) return "done";
	}

	return "busy";
}

/** Spawn a new Claude Code agent in a tmux pane. */
export function spawnAgent(name: string, cwd: string, task: string): Agent {
	createAgentPane(name, cwd);
	// Start claude in the pane
	sendKeys(name, "claude");
	return {
		name,
		task,
		cwd,
		status: "starting",
		lastOutput: "",
		startedAt: Date.now(),
		messageCount: 0,
	};
}

/** Send a task/message to an agent. */
export function sendTask(agent: Agent, message: string): void {
	sendKeys(agent.name, message);
	agent.messageCount++;
	agent.status = "busy";
}

/** Approve a permission prompt. */
export function approveAction(agent: Agent): void {
	sendKeys(agent.name, "y");
	agent.status = "busy";
}

/** Deny a permission prompt. */
export function denyAction(agent: Agent): void {
	sendKeys(agent.name, "n");
	agent.status = "busy";
}

/** Poll an agent's current state. */
export function pollAgent(agent: Agent): void {
	const output = readPane(agent.name);
	agent.lastOutput = output;
	agent.status = detectStatus(output);
}

/** Kill an agent's tmux window. */
export function destroyAgent(agent: Agent): void {
	killWindow(agent.name);
	agent.status = "dead";
}

/** Get the last N lines of meaningful output from an agent. */
export function getRecentOutput(agent: Agent, lines = 10): string {
	return agent.lastOutput
		.split("\n")
		.filter((l) => l.trim().length > 0)
		.slice(-lines)
		.join("\n");
}
