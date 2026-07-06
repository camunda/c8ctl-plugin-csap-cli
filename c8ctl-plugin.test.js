import assert from "node:assert";
import { describe, test } from "node:test";

const plugin = await import("./c8ctl-plugin.js");

// ── Plugin structure ──────────────────────────────────────────────────────────

describe("csap plugin — metadata", () => {
	test('name is "c8ctl-plugin-csap"', () => {
		assert.strictEqual(plugin.metadata.name, "c8ctl-plugin-csap");
	});

	test("has a non-empty description", () => {
		assert.ok(
			typeof plugin.metadata.description === "string" &&
				plugin.metadata.description.length > 0,
		);
	});

	test('declares the "csap-setup" command', () => {
		assert.ok(plugin.metadata.commands?.["csap-setup"]);
	});

	test("csap-setup has a non-empty description", () => {
		const meta = plugin.metadata.commands["csap-setup"];
		assert.ok(typeof meta.description === "string" && meta.description.length > 0);
	});

	test("csap-setup has a helpDescription", () => {
		const meta = plugin.metadata.commands["csap-setup"];
		assert.ok(typeof meta.helpDescription === "string" && meta.helpDescription.length > 0);
	});

	test("csap-setup provides at least four examples", () => {
		const examples = plugin.metadata.commands["csap-setup"].examples;
		assert.ok(Array.isArray(examples));
		assert.ok(examples.length >= 4);
		for (const ex of examples) {
			assert.ok(typeof ex.command === "string" && ex.command.length > 0);
			assert.ok(typeof ex.description === "string" && ex.description.length > 0);
		}
	});

	test("examples cover odata, rfc, btp-plugin, and all modules", () => {
		const examples = plugin.metadata.commands["csap-setup"].examples;
		const cmds = examples.map((e) => e.command);
		assert.ok(cmds.some((c) => c.includes("odata")), "missing OData example");
		assert.ok(cmds.some((c) => c.includes("rfc")), "missing RFC example");
		assert.ok(cmds.some((c) => c.includes("btp-plugin")), "missing BTP plugin example");
		assert.ok(cmds.some((c) => c.includes("all")), "missing 'all modules' example");
	});
});

// ── Commands export ───────────────────────────────────────────────────────────

describe("csap plugin — commands export", () => {
	test('exports a commands object with a "csap-setup" key', () => {
		assert.ok(plugin.commands);
		assert.ok(plugin.commands["csap-setup"]);
	});

	test('csap-setup is a {flags, handler} object (not a bare function)', () => {
		const cmd = plugin.commands["csap-setup"];
		assert.strictEqual(typeof cmd, "object");
		assert.strictEqual(typeof cmd.handler, "function");
		assert.ok(cmd.flags && typeof cmd.flags === "object");
	});

	test("handler is a function (not invoked — requires network/TTY)", () => {
		// Only verify the shape; calling handler without mocks would trigger
		// git clone, npm install, and GitHub API requests.
		assert.strictEqual(typeof plugin.commands["csap-setup"].handler, "function");
	});
});

// ── Flags shape ───────────────────────────────────────────────────────────────

describe("csap plugin — flags shape", () => {
	const REQUIRED_FLAGS = [
		"for",
		"camunda",
		"deployment",
		"clusterId",
		"region",
		"clientId",
		"clientSecret",
		"btpRoute",
		"btpPluginBranch",
		"to",
	];

	for (const flagName of REQUIRED_FLAGS) {
		test(`declares flag "${flagName}"`, () => {
			const flags = plugin.commands["csap-setup"].flags;
			assert.ok(flags[flagName], `Missing flag "${flagName}"`);
		});

		test(`"${flagName}" has type "string" or "boolean"`, () => {
			const flag = plugin.commands["csap-setup"].flags[flagName];
			assert.ok(
				flag.type === "string" || flag.type === "boolean",
				`Flag "${flagName}" must have type "string" or "boolean", got "${flag.type}"`,
			);
		});

		test(`"${flagName}" has a non-empty description`, () => {
			const flag = plugin.commands["csap-setup"].flags[flagName];
			assert.ok(
				typeof flag.description === "string" && flag.description.length > 0,
				`Flag "${flagName}" must have a non-empty description`,
			);
		});
	}

	test("all flags have type 'string'", () => {
		const flags = plugin.commands["csap-setup"].flags;
		for (const [name, def] of Object.entries(flags)) {
			assert.strictEqual(def.type, "string", `Flag "${name}" should be "string" type`);
		}
	});

	test("does not declare conflicting built-in c8ctl flag names", () => {
		const flags = plugin.commands["csap-setup"].flags;
		const conflicting = [
			"output", "limit", "all", "asc", "desc", "sort-by",
			"dry-run", "verbose", "fields", "profile", "help", "version",
		];
		for (const name of conflicting) {
			assert.ok(!(name in flags), `Flag "${name}" conflicts with a built-in c8ctl flag`);
		}
	});
});
