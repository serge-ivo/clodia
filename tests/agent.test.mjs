import assert from "node:assert/strict";
import test from "node:test";
import {
	detectStatus,
	getRecentOutput,
	importTerminal,
	normalizeAgentName,
	sendTask,
} from "../dist/agent.js";

test("normalizeAgentName returns tmux-safe names", () => {
	assert.equal(normalizeAgentName(" Agent One; rm -rf / ", "agent-0"), "agent-one-rm--rf");
	assert.equal(normalizeAgentName("CAPS_and spaces", "agent-0"), "caps_and-spaces");
	assert.equal(normalizeAgentName("!!!", "agent-0"), "agent-0");
	assert.equal(normalizeAgentName("a".repeat(80), "agent-0"), "a".repeat(32));
});

test("detectStatus recognizes important terminal states", () => {
	assert.equal(detectStatus(""), "starting");
	assert.equal(detectStatus("Do you want to continue? Y/n"), "permission");
	assert.equal(detectStatus("Traceback\nError: failed to build"), "error");
	assert.equal(detectStatus("work completed\n>"), "done");
	assert.equal(detectStatus(">"), "starting");
	assert.equal(detectStatus("ready\n>"), "idle");
	assert.equal(detectStatus("installing packages..."), "busy");
});

test("getRecentOutput filters blank lines and returns the tail", () => {
	const agent = importTerminal("terminal", ".");
	agent.lastOutput = "\nfirst\n\nsecond\nthird\n";
	assert.equal(getRecentOutput(agent, 2), "second\nthird");
});

test("sendTask leaves bookkeeping unchanged when tmux rejects the target", () => {
	const agent = importTerminal("missing-pane-for-unit-test", ".");
	assert.throws(() => sendTask(agent, "hello"));
	assert.equal(agent.messageCount, 0);
	assert.equal(agent.status, "starting");
});
