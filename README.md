# c8ctl-plugin-csap-cli

A [c8ctl](https://github.com/camunda/c8ctl) plugin that sets up Camunda's SAP integration modules for deployment. It is a Node.js port of the [sap-csap-cli](https://github.com/camunda/sap-csap-cli) (originally written in Deno).

Full documentation: [docs.camunda.io › SAP › csap-cli](https://docs.camunda.io/docs/components/camunda-integrations/sap/csap-cli/)

## Supported modules

| Module | Flag value | Description |
|---|---|---|
| OData connector | `odata` | Interact with S/4HANA or ECC from a BPMN model |
| RFC connector | `rfc` | Query BAPIs & Remote Function Modules on SAP ECC |
| BTP plugin | `btp-plugin` | Render task forms in Fiori, provide BTP integration |
| All | `all` | Configure all three modules |

## Prerequisites

- [c8ctl](https://github.com/camunda/c8ctl) ≥ the version that introduced the plugin system
- Node.js ≥ 22
- `git` in `PATH` (required for the BTP plugin flow)
- `npm` in `PATH` (required for the BTP plugin build)
- A GitHub personal access token in `GH_TOKEN` is strongly recommended to avoid API rate limiting when fetching release assets

## Installation

```bash
c8ctl load plugin c8ctl-plugin-csap-cli
```

To load a local development build:

```bash
c8ctl load plugin --from file://${PWD}
```

Verify the command is available:

```bash
c8ctl help
# → csap-setup appears under Plugin Commands
```

## Usage

```
c8ctl csap-setup [options]
```

### Flags

| Flag | Description |
|---|---|
| `--for` | Module to set up: `odata` \| `rfc` \| `btp-plugin` \| `all` |
| `--camunda` | Camunda version: `8.6` \| `8.7` \| `8.8` \| `8.9` |
| `--deployment` | Deployment type (currently only `SaaS`) |
| `--clusterId` | Camunda Cluster ID |
| `--region` | Camunda Cluster Region (e.g. `bru-2`) |
| `--clientId` | OAuth2 Client ID from a Camunda API Client |
| `--clientSecret` | OAuth2 Client Secret from a Camunda API Client |
| `--btpRoute` | *(btp-plugin / all)* BTP route — host without `http(s)://` and trailing `/` |
| `--btpPluginBranch` | *(btp-plugin / all)* Git branch to clone the BTP plugin from (default: `main`) |
| `--to` | Target directory for setup artifacts (default: OS temp directory) |

All flags are optional. Any value not supplied via a flag is either read from environment variables or prompted for interactively.

### Examples

```bash
# Interactive setup — prompts for all missing values
c8ctl csap-setup

# OData connector for Camunda 8.7 — prompts for credentials
c8ctl csap-setup --for odata --camunda 8.7

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

### BTP plugin

1. Clones [camunda/sap-btp-plugin](https://github.com/camunda/sap-btp-plugin) at the requested branch
2. Fills in `mta.yaml` and `xs-security.json` with your credentials and route
3. Runs the full build pipeline (`npm install` → `npm run build` → `npx mbt build`)
4. Produces a deployable `.mtar` archive in `mta_archives/`

If the target directory already exists and is dirty or contains previous build artifacts, it is purged and re-cloned automatically.

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

## Related

- [sap-csap-cli](https://github.com/camunda/sap-csap-cli) — the original Deno implementation
- [sap-connectors](https://github.com/camunda/sap-connectors) — OData and RFC connector releases
- [sap-btp-plugin](https://github.com/camunda/sap-btp-plugin) — BTP plugin source
- [c8ctl](https://github.com/camunda/c8ctl) — the CLI this plugin extends
