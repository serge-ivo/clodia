/** Clodia — multi-agent Claude Code supervisor TUI. */

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import {
	type Agent,
	type AgentStatus,
	spawnAgent,
	sendTask,
	pollAgent,
	approveAction,
	denyAction,
	destroyAgent,
	getRecentOutput,
	normalizeAgentName,
} from "./agent.js";
import { createSession, sessionExists, selectWindow } from "./tmux.js";

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

type Mode = "dashboard" | "new-agent" | "view-agent" | "confirm-kill";

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
		{ time: ts(), text: "Clodia started. Press 'n' to spawn an agent.", type: "info" },
	]);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const addLog = useCallback((text: string, type: LogEntry["type"] = "info") => {
		setLog((prev) => [...prev.slice(-100), { time: ts(), text, type }]);
	}, []);

	// Ensure tmux session exists
	useEffect(() => {
		if (!sessionExists()) createSession();
	}, []);

	// Poll agents every 2 seconds
	useEffect(() => {
		pollRef.current = setInterval(() => {
			setAgents((prev) => {
				for (const agent of prev) {
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
				return [...prev];
			});
		}, 2000);
		return () => { if (pollRef.current) clearInterval(pollRef.current); };
	}, [addLog]);

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

		// ── Confirm kill ──
		if (mode === "confirm-kill") {
			if (input === "y") {
				const agent = agents[cursor];
				if (agent) {
					destroyAgent(agent);
					addLog(`Killed ${agent.name}`, "warn");
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
			// 'a' to attach to the tmux window
			if (input === "a") {
				const agent = agents[cursor];
				if (agent) selectWindow(agent.name);
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
		if (key.downArrow) setCursor((c) => Math.min(agents.length - 1, c + 1));

		const agent = agents[cursor];
		if (!agent) return;

		if (input === "v") setMode("view-agent");
		if (input === "y" && agent.status === "permission") {
			approveAction(agent);
			addLog(`${agent.name}: approved`, "gate");
		}
		if (input === "d" && agent.status === "permission") {
			denyAction(agent);
			addLog(`${agent.name}: denied`, "gate");
		}
		if (input === "k") setMode("confirm-kill");
		if (input === "a") selectWindow(agent.name);
	});

	// ── Render ──

	const activeAgents = agents.filter((a) => a.status !== "dead");
	const selected = agents[cursor];

	if (mode === "new-agent") {
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} />
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
				<Header agentCount={activeAgents.length} />
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

	if (mode === "view-agent" && selected) {
		const output = getRecentOutput(selected, 20);
		return (
			<Box flexDirection="column" height={rows}>
				<Header agentCount={activeAgents.length} />
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
					<Text dimColor>Esc back · a attach tmux window</Text>
				</Box>
			</Box>
		);
	}

	// ── Dashboard ──
	return (
		<Box flexDirection="column" height={rows}>
			<Header agentCount={activeAgents.length} />

			<Box flexGrow={1}>
				{/* Agent list */}
				<Box flexDirection="column" width={42} borderStyle="round" borderColor="gray" paddingX={1}>
					<Text bold color="magenta"> Agents</Text>
					{agents.length === 0 ? (
						<Text dimColor> No agents. Press n to spawn one.</Text>
					) : (
						agents.map((agent, i) => {
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
									<Text dimColor> {agent.status.padEnd(10)}</Text>
									<Text dimColor> {time.padStart(6)}</Text>
								</Text>
							);
						})
					)}
					{selected && (
						<Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
							<Text dimColor>Task: <Text color="white">{selected.task.slice(0, 30)}</Text></Text>
							<Text dimColor>Msgs: {selected.messageCount}</Text>
						</Box>
					)}
				</Box>

				{/* Activity log */}
				<Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
					<Text bold color="magenta"> Activity</Text>
					{log.slice(-(rows - 6)).map((entry, i) => {
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
			</Box>

			{/* Footer */}
			<Box paddingX={1} justifyContent="space-between">
				<Text dimColor>n new · v view · a attach · y approve · d deny · k kill · q quit</Text>
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

function Header({ agentCount }: { agentCount: number }) {
	return (
		<Box paddingX={1} justifyContent="space-between">
			<Text>
				<Text color="magenta" bold>clodia</Text>
				<Text dimColor> multi-agent supervisor</Text>
			</Text>
			<Text>
				<Text dimColor>{agentCount} agent{agentCount !== 1 ? "s" : ""} · tmux session: clodia</Text>
			</Text>
		</Box>
	);
}
