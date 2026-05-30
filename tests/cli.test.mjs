import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("CLI --version matches package.json", () => {
	const output = execFileSync("node", ["dist/cli.js", "--version"], { encoding: "utf8" }).trim();
	assert.equal(output, packageJson.version);
});

test("CLI help describes the orchestrator controls", () => {
	const output = execFileSync("node", ["dist/cli.js", "--help"], { encoding: "utf8" });
	assert.match(output, /high-level terminal orchestrator/);
	assert.match(output, /r\s+Reply to the selected terminal session/);
	assert.match(output, /track\s+existing tmux windows/);
});

test("package exposes the clodia binary", () => {
	assert.equal(packageJson.bin.clodia, "dist/cli.js");
	assert.ok(packageJson.files.includes("dist"));
});
