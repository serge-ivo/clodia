import type { Agent, AgentStatus } from "./agent.js";

export type AttentionLevel = "blocked" | "decision" | "working" | "ready" | "done";

export interface SessionInsight {
	level: AttentionLevel;
	status: AgentStatus;
	headline: string;
	detail: string;
	nextAction: string;
	suggestions: string[];
	lastMeaningfulLine: string;
}

export function inspectSession(agent: Agent): SessionInsight {
	const lines = meaningfulLines(agent.lastOutput);
	const recent = lines.slice(-20);
	const recentText = recent.join("\n");
	const lastLine = recent.at(-1) ?? "";
	const errorLine = [...recent].reverse().find((line) => /error|failed|fatal|panic|traceback|exception/i.test(line));
	const questionLine = [...recent].reverse().find((line) => /\?\s*$/.test(line) || /select|choose|enter|confirm|continue/i.test(line));

	if (agent.status === "permission") {
		return {
			level: "decision",
			status: agent.status,
			headline: "Needs your decision",
			detail: "The session is waiting for approval or denial before it can continue.",
			nextAction: "Press y to approve, d to deny, or r to send a custom reply.",
			suggestions: ["y", "n"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (agent.status === "error" || errorLine) {
		return {
			level: "blocked",
			status: "error",
			headline: "Something failed",
			detail: errorLine ?? "The session reported an error.",
			nextAction: "Open the output, then reply with a fix request or attach to the terminal.",
			suggestions: ["explain the failure and propose the next fix", "retry after fixing the error"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (/merge conflict|conflict markers|unmerged paths/i.test(recentText)) {
		return {
			level: "blocked",
			status: agent.status,
			headline: "Merge conflict needs attention",
			detail: "The session appears blocked on conflicting files.",
			nextAction: "Reply with how to resolve the conflict or attach to inspect it directly.",
			suggestions: ["show me the conflicting files", "resolve the conflict conservatively"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (questionLine) {
		return {
			level: "decision",
			status: agent.status,
			headline: "Waiting for an answer",
			detail: questionLine,
			nextAction: "Press r and answer the question in plain language.",
			suggestions: ["yes, proceed", "no, stop and explain the options"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (agent.status === "idle") {
		return {
			level: "ready",
			status: agent.status,
			headline: "Ready for instructions",
			detail: "The terminal is idle and can accept the next command or task.",
			nextAction: "Press r to send the next instruction.",
			suggestions: ["continue with the next step", "summarize what changed"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (agent.status === "done") {
		return {
			level: "done",
			status: agent.status,
			headline: "Looks complete",
			detail: "The recent output suggests the task finished.",
			nextAction: "Review output or send a follow-up.",
			suggestions: ["summarize the result", "run verification"],
			lastMeaningfulLine: lastLine,
		};
	}

	if (agent.status === "starting") {
		return {
			level: "working",
			status: agent.status,
			headline: "Starting up",
			detail: "The session has not produced enough output yet.",
			nextAction: "Wait a moment.",
			suggestions: [],
			lastMeaningfulLine: lastLine,
		};
	}

	return {
		level: "working",
		status: agent.status,
		headline: "Working",
		detail: lastLine || "The terminal is active.",
		nextAction: "No decision needed right now.",
		suggestions: [],
		lastMeaningfulLine: lastLine,
	};
}

export function attentionRank(level: AttentionLevel): number {
	switch (level) {
		case "blocked": return 0;
		case "decision": return 1;
		case "ready": return 2;
		case "working": return 3;
		case "done": return 4;
	}
}

function meaningfulLines(output: string): string[] {
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}
