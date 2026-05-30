import assert from "node:assert/strict";
import test from "node:test";
import { importTerminal } from "../dist/agent.js";
import { attentionRank, inspectSession } from "../dist/supervisor.js";

function session(status, output) {
	const agent = importTerminal("session", ".");
	agent.status = status;
	agent.lastOutput = output;
	return agent;
}

test("inspectSession flags approval prompts as decisions", () => {
	const insight = inspectSession(session("permission", "Allow this command?"));
	assert.equal(insight.level, "decision");
	assert.equal(insight.headline, "Needs your decision");
	assert.deepEqual(insight.suggestions, ["y", "n"]);
});

test("inspectSession flags errors as blocked", () => {
	const insight = inspectSession(session("busy", "Running tests\nError: build failed"));
	assert.equal(insight.level, "blocked");
	assert.equal(insight.status, "error");
	assert.match(insight.detail, /build failed/);
});

test("inspectSession gives merge conflicts a specific explanation", () => {
	const insight = inspectSession(session("busy", "You have unmerged paths.\nfix conflicts and then commit"));
	assert.equal(insight.level, "blocked");
	assert.equal(insight.headline, "Merge conflict needs attention");
});

test("inspectSession identifies questions that need a reply", () => {
	const insight = inspectSession(session("busy", "Choose an option to continue"));
	assert.equal(insight.level, "decision");
	assert.equal(insight.headline, "Waiting for an answer");
});

test("inspectSession handles ready, done, starting, and working states", () => {
	assert.equal(inspectSession(session("idle", "ready\n>")).level, "ready");
	assert.equal(inspectSession(session("done", "All tests passed\n>")).level, "done");
	assert.equal(inspectSession(session("starting", "")).headline, "Starting up");
	assert.equal(inspectSession(session("busy", "Installing dependencies")).headline, "Working");
});

test("attentionRank sorts urgent sessions first", () => {
	const ordered = ["done", "working", "blocked", "ready", "decision"].sort((a, b) => attentionRank(a) - attentionRank(b));
	assert.deepEqual(ordered, ["blocked", "decision", "ready", "working", "done"]);
});
