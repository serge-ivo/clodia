/** Clodia — multi-agent Claude Code supervisor TUI. */

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import {
	type Agent,
	type AgentStatus,
	spawnAgent,
	importTerminal,
	sendTask,
	pollAgent,
	approveAction,
	denyAction,
	destroyAgent,
	getRecentOutput,
	normalizeAgentName,
} from "./agent.js";
import { createSession, sessionExists, selectWindow, listWindows } from "./tmux.js";
import { attentionRank, inspectSession, type AttentionLevel } from "./supervisor.js";

interface LogEntry {
	time: string;
	text: string;
	type: "info" | "agent" | "gate" | "warn" | "error";
}

function ts(): string {
	return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const STATUS_ICON: Record<AgentStatus, string> = {
	starting: "◌",
	busy: "⟳",
	idle: "●",
	permission: "⚠",
	error: "✗",
	done: "✓",
	dead: "○",
};

const STATUS_COLOR: Record<AgentStatus, string> = {
	starting: "gray",
	busy: "cyan",
	idle: "green",
	permission: "yellow",
	error: "red",
	done: "green",
	dead: "gray",
};

const ATTENTION_COLOR: Record<AttentionLevel, string> = {
	blocked: "red",
	decision: "yellow",
	working: "cyan",
	ready: "green",
	done: "gray",
};

type Mode = "dashboard" | "new-agent" | "view-agent" | "send-message" | "confirm-kill";

export function ClodiaApp({ cwd }: { cwd: string }) {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const rows = stdout?.rows ?? 30;

	const [agents, setAgents] = useState<Agent[]>([]);
	const [cursor, setCursor] = useState(0);
	const [mode, setMode] = useState<Mode>("dashboard");
	const [inputBuf, setInputBuf] = useState("");
	const [inputStep, setInputStep] = useState<"name" | "task">("name");
	const [newAgentName, setNewAgentName] = useState("");
	const [log, setLog] = useState<LogEntry[]>([
		{ time: ts(), text: "Clodia started. Press n to spawn, r to reply, v to inspect.", type: "info" },
	]);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const addLog = useCallback((text: string, type: LogEntry["type"] = "info") => {
		setLog((prev) => [...prev.slice(-100), { time: ts(), text, type }]);
	}, []);

	const activeAgents = agents.filter((a) => a.status !== "dead");
	const orderedSessions = activeAgents
		.map((agent) => ({ agent, insight: inspectSession(agent) }))
		.sort((a, b) => attentionRank(a.insight.level) - attentionRank(b.insight.level));
	const selected = orderedSessions[cursor]?.agent;
	const selectedInsight = orderedSessions[cursor]?.insight;
	const attentionCount = orderedSessions
		.filter(({ insight }) => insight.level === "blocked" || insight.level === "decision").length;

	// Ensure tmux session exists
	useEffect(() => {
		if (!sessionExists()) createSession();
	}, []);

	useEffect(() => {
		setCursor((current) => Math.min(current, Math.max(0, orderedSessions.length - 1)));
	}, [orderedSessions.length]);

	// Poll agents every 2 seconds
	useEffect(() => {
		pollRef.current = setInterval(() => {
			setAgents((prev) => {
				const agentsByName = new Map(prev.map((agent) => [agent.name, agent]));
				const imported: Agent[] = [];

				for (const window of listWindows()) {
					if (window.name === "dashboard" || agentsByName.has(window.name)) continue;
					const agent = importTerminal(window.name, cwd);
					pollAgent(agent);
					imported.push(agent);
					addLog(`Tracking terminal ${window.name}`, "agent");
				}

				const next = [...prev, ...imported];
				for (const agent of next) {
					if (agent.status === "dead") continue;
					const prevStatus = agent.status;
					pollAgent(agent);
					if (agent.status !== prevStatus) {
						if (agent.status === "permission") {
							addLog(`${agent.name}: waiting for permission`, "warn");
						} else if (agent.status === "idle" && prevStatus === "busy") {
							addLog(`${agent.name}: finished task`, "agent");
						} else if (agent.status === "error") {
							addLog(`${agent.name}: error detected`, "error");
						}
					}
				}
				return next;
			});
		}, 2000);
		return () => { if (pollRef.current) clearInterval(pollRef.current); };
	}, [addLog, cwd]);

	// ── Keyboard ──

	useInput((input, key) => {
		// ── New agent input mode ──
		if (mode === "new-agent") {
			if (key.escape) {
				setMode("dashboard");
				setInputBuf("");
				setInputStep("name");
				return;
			}
			if (key.return) {
				if (inputStep === "name") {
					const name = uniqueAgentName(normalizeAgentName(inputBuf, `agent-${agents.length}`), agents);
					setNewAgentName(name);
					setInputBuf("");
					setInputStep("task");
					return;
				}
				// Submit task
				const task = inputBuf.trim();
				if (!task) return;
				const agent = spawnAgent(newAgentName, cwd, task);
				setAgents((prev) => [...prev, agent]);
				addLog(`Spawned ${newAgentName}: "${task.slice(0, 50)}"`, "agent");
				// Wait a bit for Claude to start, then send task
				setTimeout(() => {
					sendTask(agent, task);
					addLog(`${newAgentName}: task sent`, "agent");
				}, 3000);
				setMode("dashboard");
				setInputBuf("");
				setInputStep("name");
				return;
			}
			if (key.backspace || key.delete) {
				setInputBuf((b) => b.slice(0, -1));
				return;
			}
			if (input && !key.ctrl && !key.meta) {
				setInputBuf((b) => b + input);
			}
			return;
		}

		// ── Send message ──
		if (mode === "send-message") {
			if (key.escape) {
				setMode("dashboard");
				setInputBuf("");
				return;
			}
			if (key.return) {
				const message = inputBuf.trim();
				if (message && selected) {
					sendTask(selected, message);
					addLog(`${selected.name}: sent "${message.slice(0, 60)}"`, "agent");
					setAgents((prev) => [...prev]);
				}
				setMode("dashboard");
				setInputBuf("");
				return;
			}
			if (key.backspace || key.delete) {
				setInputBuf((b) => b.slice(0, -1));
				return;
			}
			if (input && !key.ctrl && !key.meta) {
				setInputBuf((b) => b + input);
			}
			return;
		}

		// ── Confirm kill ──
		if (mode === "confirm-kill") {
			if (input === "y") {
				if (selected) {
					destroyAgent(selected);
					addLog(`Killed ${selected.name}`, "warn");
					setAgents((prev) => [...prev]);
				}
			}
			setMode("dashboard");
			return;
		}

		// ── View agent ──
		if (mode === "view-agent") {
			if (key.escape || input === "v") {
				setMode("dashboard");
				return;
			}
			if (input === "r") {
				setMode("send-message");
				setInputBuf("");
				return;
			}
			// 'a' to attach to the tmux window
			if (input === "a") {
				if (selected) selectWindow(selected.name);
			}
			return;
		}

		// ── Dashboard ──
		if (input === "q" || (key.ctrl && input === "c")) {
			exit();
			return;
		}
		if (input === "n") {
			setMode("new-agent");
			setInputBuf("");
			setInputStep("name");
			return;
		}
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
		if (key.downArrow) setCursor((c) => Math.min(orderedSessions.length - 1, c + 1));

		if (!selected) return;

		if (input === "v") setMode("view-agent");
		if (input === "r") {
			setMode("send-message");
			setInputBuf("");
		}
		if (input === "y" && selected.status === "permission") {
			approveAction(selected);
			addLog(`${selected.name}: approved`, "gate");
		}
		if (input === "d" && selected.status === "permission") {
			denyAction(selected);
			addLog(`${selected.name}: denied`, "gate");
		}
		if (input === "k") setMode("confirm-kill");
		if (input === "a") selectWindow(selected.name);
	});

	// ── Render ──

	if (mode === "new-agent") {
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} attentionCount={attentionCount} />
				<Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
					<Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={2} paddingY={1} width={60}>
						<Text bold color="magenta"> New Agent</Text>
						<Text> </Text>
						{inputStep === "name" ? (
							<>
								<Text>Agent name (or Enter for auto):</Text>
								<Text color="cyan">{"> "}{inputBuf}<Text color="gray">█</Text></Text>
							</>
						) : (
							<>
								<Text dimColor>Agent: <Text color="cyan">{newAgentName}</Text></Text>
								<Text> </Text>
								<Text>Task for Claude:</Text>
								<Text color="cyan">{"> "}{inputBuf}<Text color="gray">█</Text></Text>
							</>
						)}
						<Text> </Text>
						<Text dimColor>Enter submit · Esc cancel</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	if (mode === "confirm-kill" && selected) {
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} attentionCount={attentionCount} />
				<Box flexGrow={1} justifyContent="center" alignItems="center">
					<Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
						<Text bold color="red"> Kill agent "{selected.name}"?</Text>
						<Text dimColor>This will destroy the tmux window and Claude session.</Text>
						<Text> </Text>
						<Text>y confirm · any other key cancel</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	if (mode === "send-message" && selected) {
		const insight = inspectSession(selected);
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} attentionCount={attentionCount} />
				<Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
					<Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1} width={72}>
						<Text bold color="cyan"> Reply to {selected.name}</Text>
						<Text dimColor>{insight.headline}: {insight.detail.slice(0, 90)}</Text>
						<Text> </Text>
						<Text>Message or command:</Text>
						<Text color="cyan">{"> "}{inputBuf}<Text color="gray">█</Text></Text>
						{insight.suggestions.length > 0 && (
							<>
								<Text> </Text>
								<Text dimColor>Ideas: {insight.suggestions.join(" · ")}</Text>
							</>
						)}
						<Text> </Text>
						<Text dimColor>Enter send · Esc cancel</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	if (mode === "view-agent" && selected) {
		const output = getRecentOutput(selected, 20);
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} attentionCount={attentionCount} />
				<Box paddingX={1}>
					<Text bold>{selected.name}</Text>
					<Text dimColor> — {selected.task.slice(0, 60)}</Text>
				</Box>
				<Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1} marginX={1}>
					{output.split("\n").slice(-18).map((line, i) => (
						<Text key={i} wrap="truncate">{line}</Text>
					))}
				</Box>
				<Box paddingX={1}>
					<Text dimColor>Esc back · r reply · a attach tmux window</Text>
				</Box>
			</Box>
		);
	}

	// ── Dashboard ──
	return (
		<Box flexDirection="column" height={rows}>
			<Header agentCount={activeAgents.length} attentionCount={attentionCount} />

			<Box flexGrow={1}>
				{/* Agent list */}
				<Box flexDirection="column" width={42} borderStyle="round" borderColor="gray" paddingX={1}>
					<Text bold color="magenta"> Sessions</Text>
					{orderedSessions.length === 0 ? (
						<Text dimColor> No sessions yet. Press n to spawn one.</Text>
					) : (
						orderedSessions.map(({ agent, insight }, i) => {
							const sel = i === cursor;
							const icon = STATUS_ICON[agent.status];
							const color = STATUS_COLOR[agent.status];
							const elapsed = Math.round((Date.now() - agent.startedAt) / 1000);
							const mins = Math.floor(elapsed / 60);
							const secs = elapsed % 60;
							const time = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
							return (
								<Text key={agent.name} wrap="truncate">
									<Text color={sel ? "white" : "gray"}>{sel ? "▸ " : "  "}</Text>
									<Text color={color}>{icon} </Text>
									<Text bold={sel}>{agent.name.padEnd(12)}</Text>
									<Text color={ATTENTION_COLOR[insight.level]}> {insight.level.padEnd(8)}</Text>
									<Text dimColor> {time.padStart(6)}</Text>
								</Text>
							);
						})
					)}
					{selected && (
						<Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
							<Text dimColor>Kind: <Text color="white">{selected.kind}</Text></Text>
							<Text dimColor>Msgs: {selected.messageCount}</Text>
						</Box>
					)}
				</Box>

				{/* Supervisor */}
				<Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
					<Text bold color="magenta"> Supervisor</Text>
					{selected && selectedInsight ? (
						<>
							<Text>
								<Text color={ATTENTION_COLOR[selectedInsight.level]} bold>{selectedInsight.headline}</Text>
								<Text dimColor> · {selected.name}</Text>
							</Text>
							<Text wrap="wrap">{selectedInsight.detail}</Text>
							<Text dimColor wrap="wrap">Next: {selectedInsight.nextAction}</Text>
							{selectedInsight.lastMeaningfulLine && (
								<Text dimColor wrap="truncate">Last: {selectedInsight.lastMeaningfulLine}</Text>
							)}
							{selectedInsight.suggestions.length > 0 && (
								<Text dimColor wrap="wrap">Suggested replies: {selectedInsight.suggestions.join(" · ")}</Text>
							)}
							<Box marginTop={1} flexDirection="column">
								<Text bold color="magenta"> Activity</Text>
								{log.slice(-(Math.max(3, rows - 14))).map((entry, i) => {
									const colors: Record<string, string> = {
										info: "gray", agent: "cyan", gate: "green", warn: "yellow", error: "red",
									};
									return (
										<Text key={i} wrap="truncate">
											<Text dimColor>{entry.time} </Text>
											<Text color={colors[entry.type]}>{entry.text}</Text>
										</Text>
									);
								})}
							</Box>
						</>
					) : (
						<Text dimColor>Spawn or import a tmux session to begin supervision.</Text>
					)}
				</Box>
			</Box>

			{/* Footer */}
			<Box paddingX={1} justifyContent="space-between">
				<Text dimColor>n new · r reply · v output · a attach · y approve · d deny · k kill · q quit</Text>
				<Text dimColor>↑↓ select</Text>
			</Box>
		</Box>
	);
}

function uniqueAgentName(name: string, agents: Agent[]): string {
	const existing = new Set(agents.filter((agent) => agent.status !== "dead").map((agent) => agent.name));
	if (!existing.has(name)) return name;

	for (let i = 1; ; i++) {
		const candidate = `${name}-${i}`;
		if (!existing.has(candidate)) return candidate;
	}
}

function Header({ agentCount, attentionCount }: { agentCount: number; attentionCount: number }) {
	return (
		<Box paddingX={1} justifyContent="space-between">
			<Text>
				<Text color="magenta" bold>clodia</Text>
				<Text dimColor> high-level terminal orchestrator</Text>
			</Text>
			<Text>
				<Text dimColor>{agentCount} session{agentCount !== 1 ? "s" : ""} · {attentionCount} need attention</Text>
			</Text>
		</Box>
	);
}
