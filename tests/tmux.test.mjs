import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importTerminal, sendTask } from "../dist/agent.js";
import {
	createAgentPane,
	createSession,
	killWindow,
	listWindows,
	readPane,
	sendKeys,
	tmuxAvailable,
} from "../dist/tmux.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("tmux primitives create, write, read, list, and kill a window", { skip: !tmuxAvailable() }, async () => {
	const name = `test-${randomUUID().slice(0, 8)}`;
	const marker = `literal-${randomUUID().slice(0, 8)}`;

	createSession();
	createAgentPane(name, process.cwd());
	try {
		sendKeys(name, `printf '${marker} C-c Enter ; ok'`);
		await new Promise((resolve) => setTimeout(resolve, 500));

		const output = readPane(name);
		assert.match(output, new RegExp(`${marker} C-c Enter ; ok`));
		assert.ok(listWindows().some((window) => window.name === name));
	} finally {
		killWindow(name);
	}
});

test("sendTask routes a reply into the selected tmux window", { skip: !tmuxAvailable() }, async () => {
	const name = `reply-${randomUUID().slice(0, 8)}`;
	const marker = `reply-${randomUUID().slice(0, 8)}`;
	const agent = importTerminal(name, process.cwd());

	createSession();
	createAgentPane(name, process.cwd());
	try {
		sendTask(agent, `printf '${marker}'`);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.match(readPane(name), new RegExp(marker));
		assert.equal(agent.messageCount, 1);
		assert.equal(agent.status, "busy");
	} finally {
		killWindow(name);
	}
});

test("published package contents are packable", () => {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
	const [pack] = JSON.parse(output);
	assert.equal(pack.name, "clodia");
	assert.equal(pack.version, packageJson.version);
	assert.ok(pack.files.some((file) => file.path === "dist/supervisor.js"));
});
