# c8ctl-plugin-csap-cli

This is a **plugin for [c8ctl](https://github.com/camunda/c8ctl)** — Camunda's official CLI tool (`npm install @camunda8/cli -g`). Plugins extend c8ctl with additional commands; once loaded, `csap-setup` appears alongside the built-in commands and works the same way.

`c8ctl-plugin-csap-cli` automates the setup of Camunda's SAP integration modules. It downloads release assets, fills in configuration templates with your credentials, and — for the BTP plugin — runs the full build pipeline to produce a deployable artifact. It is a Node.js port of the [sap-csap-cli](https://github.com/camunda/sap-csap-cli) (originally written in Deno), eliminating the need for a separate Deno installation.

Full documentation: [docs.camunda.io › SAP › csap-cli](https://docs.camunda.io/docs/components/camunda-integrations/sap/csap-cli/)

## Supported modules

| Module                       | Flag value   | Description                                         |
|------------------------------|--------------|-----------------------------------------------------|
| OData connector              | `odata`      | Interact with S/4HANA or ECC from a BPMN model      |
| RFC connector                | `rfc`        | Query BAPIs & Remote Function Modules on SAP ECC    |
| BTP plugin ⚠️ **deprecated** | `btp-plugin` | Render task forms in Fiori, provide BTP integration |
| All                          | `all`        | Configure all three modules                         |

## Prerequisites

- [c8ctl](https://github.com/camunda/c8ctl) installed (`npm install @camunda8/cli -g`)
- Node.js ≥ 22
- `git` in `PATH` (required for the BTP plugin flow)
- `npm` in `PATH` (required for the BTP plugin build)
- A GitHub personal access token in `GH_TOKEN` is strongly recommended to avoid API rate limiting when fetching release assets

## Installation

### From npm (recommended)

```bash
c8ctl load plugin c8ctl-plugin-csap-cli
```

### From a Git repository

```bash
c8ctl load plugin --from https://github.com/camunda/c8ctl-plugin-csap-cli
```

To pin to a specific branch or tag, append `#`:

```bash
# Specific branch
c8ctl load plugin --from https://github.com/camunda/c8ctl-plugin-csap-cli#main

# Specific tag / release
c8ctl load plugin --from https://github.com/camunda/c8ctl-plugin-csap-cli#v1.0.0
```

### From a local directory

```bash
c8ctl load plugin --from file://${PWD}
```

### Verify

```bash
c8ctl help
# → csap-setup appears under Plugin Commands
```

## Usage

```
c8ctl csap-setup [options]
```

### Flags

| Flag                | Description                                                                    |
|---------------------|--------------------------------------------------------------------------------|
| `--for`             | Module to set up: `odata` \| `rfc` \| `btp-plugin` \| `all`                    |
| `--camunda`         | Camunda version: `8.8` \| `8.9` \| `8.10`                           |
| `--deployment`      | Deployment type (currently only `SaaS`)                                        |
| `--clusterId`       | Camunda Cluster ID                                                             |
| `--region`          | Camunda Cluster Region (e.g. `bru-2`)                                          |
| `--clientId`        | OAuth2 Client ID from a Camunda API Client                                     |
| `--clientSecret`    | OAuth2 Client Secret from a Camunda API Client                                 |
| `--btpRoute`        | *(btp-plugin / all)* BTP route — host without `http(s)://` and trailing `/`    |
| `--btpPluginBranch` | *(btp-plugin / all)* Git branch to clone the BTP plugin from (default: `main`) |
| `--to`              | Target directory for setup artifacts (default: OS temp directory)              |

All flags are optional. Any value not supplied via a flag is either read from environment variables or prompted for interactively.

### Examples

```bash
# Interactive setup — prompts for all missing values
c8ctl csap-setup

# OData connector for Camunda 8.9 — prompts for credentials
c8ctl csap-setup --for odata --camunda 8.9

# RFC connector, fully non-interactive
c8ctl csap-setup --for rfc --camunda 8.9 --deployment SaaS \
  --clusterId <id> --region bru-2 \
  --clientId <client-id> --clientSecret <secret>

# BTP plugin for Camunda 8.8
c8ctl csap-setup --for btp-plugin --camunda 8.8 \
  --btpRoute my-app.cfapps.eu10.hana.ondemand.com

# All modules in one go
c8ctl csap-setup --for all --camunda 8.9
```

## Credential resolution

Credentials are resolved in the following order — the first source that supplies all four values wins:

1. **Flags** — `--clusterId`, `--region`, `--clientId`, `--clientSecret`
2. **Environment variables** — `CAMUNDA_CLUSTER_ID`, `CAMUNDA_CLUSTER_REGION`, `CAMUNDA_CLIENT_ID`, `CAMUNDA_CLIENT_SECRET`
3. **Interactive prompts** — displayed when running in a TTY

```bash
export CAMUNDA_CLUSTER_ID=...
export CAMUNDA_CLUSTER_REGION=bru-2
export CAMUNDA_CLIENT_ID=...
export CAMUNDA_CLIENT_SECRET=...

c8ctl csap-setup --for odata --camunda 8.9
# → credentials sourced from env, no prompts
```

## What each module does

### OData connector & RFC connector

Downloads the release assets for the requested Camunda version from [camunda/sap-connectors](https://github.com/camunda/sap-connectors) on GitHub, fills in the `mtad.yaml.example` template with your credentials, and writes a ready-to-deploy `mtad.yaml` to the target directory.

### BTP plugin ⚠️ deprecated

> **Deprecated.** The BTP plugin module is deprecated and will be removed in a future release. Avoid new setups against it.

1. Clones [camunda/sap-btp-plugin](https://github.com/camunda/sap-btp-plugin) at the requested branch
2. Fills in `mta.yaml` and `xs-security.json` with your credentials and route
3. Runs the full build pipeline (`npm install` → `npm run build` → `npx mbt build`)
4. Produces a deployable `.mtar` archive in `mta_archives/`

If the target directory already exists and is dirty or contains previous build artifacts, it is purged and re-cloned automatically.

## Deployment

`csap-setup` only **prepares** deployment artifacts — it does not deploy them. All three modules are SAP BTP MTA (Multi-Target Application) content, deployed with the Cloud Foundry CLI and the `multiapps` plugin.

Every successful `csap-setup` run prints `in directory <path>` — that's the path to hand to `cf deploy` below.

### Prerequisites

- [Cloud Foundry CLI](https://github.com/cloudfoundry/cli) (`cf`)
- The `multiapps` CF CLI plugin:
  ```bash
  cf install-plugin multiapps
  ```
- A login to the target BTP Cloud Foundry org/space:
  ```bash
  cf login -a https://api.cf.<region>.hana.ondemand.com -o <org> -s <space>
  ```

### OData connector & RFC connector

No `.mtar` build step is involved — `csap-setup` writes a filled-in `mtad.yaml` directly next to the downloaded release assets. Point `cf deploy` at that directory; the `multiapps` plugin packages it into an MTA archive on the fly:

```bash
cf deploy <directory-printed-by-csap-setup>
```

### BTP plugin

`csap-setup` already produces a ready-to-deploy `.mtar` archive in `mta_archives/` inside the printed directory:

```bash
cf deploy <directory-printed-by-csap-setup>/mta_archives/<name>.mtar
```

### Verify

```bash
cf apps                       # confirm the module(s) show up and are running
cf routes                     # confirm the route matches --btpRoute (btp-plugin) or the connector's default route
cf logs <app-name> --recent    # tail recent logs for a specific app
```

Managed service provisioning (destination, connectivity, xsuaa, and — for the BTP plugin — postgresql-db) can take several minutes on first deploy; `cf deploy` reports progress but won't appear to hang.

## GitHub API rate limiting

Release assets are fetched from the GitHub API. Without authentication, requests are rate-limited to 60 per hour per IP address. Set `GH_TOKEN` to a personal access token with at least `public_repo` read access to raise this limit:

```bash
export GH_TOKEN=ghp_...
```

## Development

```bash
# Run tests (no build step needed)
npm test

# Load the local build into c8ctl
c8ctl load plugin --from file://${PWD}

# Verify
c8ctl help
c8ctl csap-setup --help
```

Network tests (those that call the GitHub API) are skipped automatically when `GH_TOKEN` is not set. Set it to run the full suite.

### Test coverage

The offline e2e suite (`test/setup-handler.e2e.test.js`) runs the full `setupHandler` flow against mocked GitHub releases for `odata`, `rfc`, `btp-plugin`, and `all`. The connector flows (`odata`, `rfc`) run against two supported Camunda versions, `8.10` and `8.9`.

`test/c8ctl-cli.e2e.test.js` covers the plugin through the real `c8ctl` binary instead of calling `lib/setup.js` directly — loading it from disk (`c8ctl load plugin --from file://...`), then dispatching `csap-setup`, so plugin registration and flag wiring are covered too. It runs in a sandboxed `HOME`/config dir to avoid touching your real c8ctl installation, and requires `c8ctl` on `PATH`; its network-hitting case additionally requires `GH_TOKEN`. CI installs a pinned `c8ctl` version before running tests (see `.github/workflows/test.yml`). It's skipped on Windows: `c8ctl@3.2.0`'s `load plugin` fails there with `spawnSync npm ENOENT` — an upstream bug in the c8ctl binary, not in this plugin.

## Related

- [sap-csap-cli](https://github.com/camunda/sap-csap-cli) — the original Deno implementation
- [sap-connectors](https://github.com/camunda/sap-connectors) — OData and RFC connector releases
- [sap-btp-plugin](https://github.com/camunda/sap-btp-plugin) — BTP plugin source
- [c8ctl](https://github.com/camunda/c8ctl) — the CLI this plugin extends
