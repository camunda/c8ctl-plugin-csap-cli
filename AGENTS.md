# AGENTS.md

This file is the implementation contract for autonomous coding agents and contributors working on `c8ctl-plugin-csap`.

## Role

`c8ctl-plugin-csap` is a Node.js port of the [sap-csap-cli](https://github.com/camunda/sap-csap-cli) (originally Deno/TypeScript) as a plugin for the [c8ctl](https://github.com/camunda/c8ctl) CLI plugin system.

It exposes a single command, `csap-setup`, that prepares one or more Camunda SAP integration modules for deployment:

| Module | Value | Purpose |
|---|---|---|
| OData connector | `odata` | Interact with S/4HANA or ECC from a BPMN model |
| RFC connector | `rfc` | Query BAPIs & Remote Function Modules on SAP ECC |
| BTP plugin | `btp-plugin` | Render task forms in Fiori, provide BTP integration |
| All | `all` | Configure all three modules |

## Plugin Contract

- **Entry point:** `c8ctl-plugin.js` (root, pure JavaScript, no build step)
- **Required export:** `commands` — maps command name → `{ flags, handler }` object
- **Optional export:** `metadata` — name, description, per-command help text and examples
- **Engine:** Node.js ≥ 22 (`"type": "module"`, ESM)
- **Keywords in package.json** must include `c8ctl` or `c8ctl-plugin`

### Command shape

```js
export const commands = {
  'csap-setup': {
    flags: {
      flagName: { type: 'string' | 'boolean', description: '...' },
    },
    handler: async (args, flags, ctx) => { /* ... */ },
  },
};
```

The `ctx` object is injected by c8ctl and provides `ctx.prompt.select(...)` for interactive selection and `ctx.yes` (boolean) for non-interactive / `--yes` mode.

### Declared flags

All flags on `csap-setup` are `type: 'string'`. Do not use flag names that conflict with c8ctl built-ins (`output`, `limit`, `all`, `asc`, `desc`, `sort-by`, `dry-run`, `verbose`, `fields`, `profile`, `help`, `version`).

## Key Implementation Details

### Credential resolution order

1. All four flags (`--clusterId`, `--region`, `--clientId`, `--clientSecret`) provided → use flags
2. All four env vars (`CAMUNDA_CLUSTER_ID`, `CAMUNDA_CLUSTER_REGION`, `CAMUNDA_CLIENT_ID`, `CAMUNDA_CLIENT_SECRET`) present → use env
3. Otherwise → prompt interactively via `inputPrompt()`

### GitHub API

Assets for the OData and RFC connectors are fetched from GitHub Releases on `camunda/sap-connectors`. A `GH_TOKEN` env var is recommended to avoid rate limiting; a warning is emitted if absent. The `downloadAsset()` function skips files that already exist with the correct size.

### BTP Plugin

The BTP plugin flow clones `camunda/sap-btp-plugin` then runs a full build pipeline (npm install → npm run build -w core → npm run build -w fiori-app → npx mbt build). This mutates the working directory: `buildBtpPlugin()` calls `process.chdir(inDir)` and the original CWD is restored in a `finally` block. If the target directory exists and is dirty or contains prior build artifacts, it is purged and re-cloned.

### Interactive prompts

`promptSelect()` uses `ctx.prompt.select(...)` (c8ctl's prompt API) and falls back to the first option when `ctx` is absent (e.g. in tests). `inputPrompt()` uses `readline` directly and falls back to `defaultValue` in non-TTY environments (CI, `--yes` mode).

### `str()` helper

All flag values must be passed through `str(value)` before use. This coerces non-string or empty values to `''`, guarding against the `boolean | string` union that `parseArgs` may produce.

## Development Loop

No build step is required — the plugin is plain JavaScript.

```bash
# 1. Install test runner (no runtime deps)
npm install

# 2. Run tests
npm test

# 3. Load the plugin into c8ctl from the local directory
c8ctl load plugin --from file://${PWD}

# 4. Verify the command appears
c8ctl help

# 5. Smoke-test non-interactively (requires env vars or flags; triggers GitHub API)
GH_TOKEN=<token> c8ctl csap-setup --for odata --camunda 8.7 \
  --clusterId <id> --region bru-2 --clientId <cid> --clientSecret <sec>
```

## Testing

Tests use `node:test` + `node:assert` (no external framework). Run with:

```bash
npm test
# or directly:
node --test c8ctl-plugin.test.js
```

The test suite covers plugin structure only (metadata shape, commands export, flags shape). It deliberately does not invoke the handler — doing so would trigger GitHub API calls, `git clone`, and `npm install`. Keep it that way: handler correctness is validated manually via the development loop above.

## Quality Checks

Before marking any change complete:

1. Tests pass: `npm test`
2. Plugin loads without error: `c8ctl load plugin --from file://${PWD}`
3. Command appears in help: `c8ctl help` and `c8ctl csap-setup --help`
4. No flag conflicts with c8ctl built-ins (verified by the test `does not declare conflicting built-in c8ctl flag names`)

## Minimal Change Policy

- One command (`csap-setup`) exists by design. Do not add commands unless explicitly asked.
- Do not introduce a build step or external dependencies without a clear requirement.
- Keep `metadata.commands` descriptions concise and user-facing (< 80 characters).
- Preserve the credential resolution order; the env-var path is relied on in CI.

## Upstream References

- c8ctl plugin system contract: `PLUGIN-HELP.md` in the [c8ctl repo](https://github.com/camunda/c8ctl)
- Original Deno source: [camunda/sap-csap-cli](https://github.com/camunda/sap-csap-cli)
- SAP BTP plugin repository (cloned at runtime): [camunda/sap-btp-plugin](https://github.com/camunda/sap-btp-plugin)
- SAP connectors release repository (assets fetched at runtime): `camunda/sap-connectors`
