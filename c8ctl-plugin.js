/**
 * c8ctl-plugin-csap
 *
 * Node.js port of the csap CLI (Camunda SAP Integration CLI) for the c8ctl
 * plugin system. Supports setup of:
 *   - OData connector
 *   - RFC connector
 *   - SAP BTP plugin
 *
 * Original tool: https://github.com/camunda/sap-csap-cli (Deno)
 *
 * Usage:
 *   c8ctl csap-setup [--for <module>] [--camunda <version>] [--deployment <opt>]
 *                   [--clusterId <id>] [--region <region>]
 *                   [--clientId <id>] [--clientSecret <secret>]
 *                   [--btpRoute <host>] [--btpPluginBranch <branch>]
 *                   [--to <dir>]
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { arch as osArch, platform as osPlatform, tmpdir } from 'node:os';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// ── Domain constants (mirrored from sap-csap-cli/lib/common.ts) ─────────────

const SAP_MODULES = [
  { label: 'BTP plugin',      value: 'btp-plugin', description: 'Render tasks forms in Fiori, provide BTP integration' },
  { label: 'OData connector', value: 'odata',      description: 'Interact with S/4HANA or ECC System from a BPMN model' },
  { label: 'RFC connector',   value: 'rfc',        description: 'Query BAPIs & Remote Function Modules on SAP ECC systems' },
  { label: 'All modules',     value: 'all',        description: 'Configure all modules' },
];

const CAMUNDA_VERSIONS = [
  { label: '8.9', value: '8.9' },
  { label: '8.8', value: '8.8' },
  { label: '8.7', value: '8.7' },
  { label: '8.6', value: '8.6' },
];

const DEPLOYMENT_OPTIONS = [
  { label: 'SaaS', value: 'SaaS' },
];

const KIND = {
  odata: 'sap-connectors',
  rfc:   'sap-connectors',
  btp:   'sap-btp-plugin',
};

const ALL_CAMUNDA_CREDENTIAL_KEYS = [
  'CAMUNDA_CLUSTER_ID',
  'CAMUNDA_CLIENT_ID',
  'CAMUNDA_CLIENT_SECRET',
  'CAMUNDA_CLUSTER_REGION',
];

// ── Utilities ────────────────────────────────────────────────────────────────

function warnIfGithubTokenMissing() {
  if (!process.env.GH_TOKEN) {
    console.warn(
      '! No GitHub token found in environment variable GH_TOKEN. ' +
      'GitHub API requests may be rate-limited during execution.',
    );
  }
}

function createBuildDir(camundaVersion) {
  return camundaVersion
    ? join(tmpdir(), 'camunda', camundaVersion)
    : join(tmpdir(), 'camunda');
}

/**
 * Prompt for free-text input using readline. Falls back to defaultValue when
 * stdin/stderr are not a TTY (e.g. CI) or when --yes/-y was requested.
 */
async function inputPrompt(message, defaultValue = '', validate = null) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return defaultValue;
  }

  while (true) {
    const answer = await new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const hint = defaultValue ? ` (${defaultValue})` : '';
      rl.question(`${BOLD}${CYAN}?${RESET} ${BOLD}${message}${hint}${RESET}: `, (line) => {
        rl.close();
        resolve(line.trim() || defaultValue);
      });
    });

    if (!validate || validate(answer) !== false) return answer;
    process.stderr.write('  Invalid input, please try again.\n');
  }
}

/**
 * Wrapper around ctx.prompt.select that throws on cancellation.
 * Falls back to the first option when not interactive or ctx is absent.
 */
async function promptSelect(ctx, message, options) {
  if (!ctx?.prompt) {
    return options[0].value;
  }
  const result = await ctx.prompt.select({ message, options });
  if (result.cancelled) throw new Error('Setup cancelled by user.');
  return result.value;
}

// ── Credentials ──────────────────────────────────────────────────────────────

function detectCredentials() {
  return ALL_CAMUNDA_CREDENTIAL_KEYS.every((k) => Boolean(process.env[k]));
}

function getCredentialsFromEnv() {
  return {
    CAMUNDA_CLUSTER_ID:     process.env.CAMUNDA_CLUSTER_ID ?? '',
    CAMUNDA_CLIENT_ID:      process.env.CAMUNDA_CLIENT_ID ?? '',
    CAMUNDA_CLIENT_SECRET:  process.env.CAMUNDA_CLIENT_SECRET ?? '',
    CAMUNDA_CLUSTER_REGION: process.env.CAMUNDA_CLUSTER_REGION ?? '',
  };
}

async function getCredentials(flags, ctx) {
  const isYes = ctx?.yes ?? false;

  const clusterId = str(flags?.clusterId) ||
    (isYes ? '' : await inputPrompt('Camunda Cluster ID'));

  const region = str(flags?.region) ||
    (isYes ? 'bru-2' : await inputPrompt('Camunda Cluster Region', 'bru-2'));

  const clientId = str(flags?.clientId) ||
    (isYes ? '' : await inputPrompt('Camunda API Client - Client ID'));

  const clientSecret = str(flags?.clientSecret) ||
    (isYes ? '' : await inputPrompt('Camunda API Client - Client Secret'));

  return { clusterId, region, clientId, clientSecret };
}

// ── GitHub API ───────────────────────────────────────────────────────────────

async function githubRequest(path) {
  const headers = {
    'User-Agent': 'c8ctl-plugin-csap',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GH_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GH_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchReleases(repo) {
  process.stdout.write('i fetching releases...\n');
  const releases = await githubRequest(`/repos/camunda/${repo}/releases`);
  process.stdout.write(`✓ fetched releases: ${releases.length}\n`);
  return releases;
}

function findLatestRelease(releases, submodule, version) {
  process.stdout.write('i determining latest release...\n');

  const [targetMajor, targetMinor] = version.split('.').map(Number);

  const matching = releases.filter((release) => {
    const tag = release.tag_name;
    const lastDash = tag.lastIndexOf('-');
    if (lastDash === -1) return false;

    const releaseName = tag.slice(0, lastDash);
    const semver = tag.slice(lastDash + 1);
    const [major, minor] = semver.split('.').map(Number);

    return (
      releaseName === submodule &&
      !Number.isNaN(major) &&
      !Number.isNaN(minor) &&
      major === targetMajor &&
      minor === targetMinor
    );
  });

  matching.sort((a, b) => {
    const nameA = a.name ?? '0.0.0';
    const nameB = b.name ?? '0.0.0';
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  if (matching.length === 0) {
    const available = releases.map((r) => `\t- ${r.name}`).join('\n');
    throw new Error(
      `! The requested ${submodule}-connector for version ${version} is not supported.\n` +
      `  Currently available releases are:\n${available}`,
    );
  }

  const latest = matching.at(-1);
  process.stdout.write(`✓ latest release: ${latest.name}\n`);
  return latest;
}

async function downloadAsset(asset, dir) {
  const filePath = join(dir, asset.name);

  if (existsSync(filePath)) {
    const fileInfo = statSync(filePath);
    if (fileInfo.size === asset.size) {
      process.stdout.write(`i File already exists: ${basename(filePath)} — skipping download\n`);
      return;
    }
    process.stdout.write(`i File exists but size mismatch: ${asset.name} — re-downloading\n`);
  }

  const response = await fetch(asset.browser_download_url);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.name}: ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const kb = (asset.size / 1024).toFixed(2);
  let received = 0;

  const chunks = [];
  for await (const chunk of response.body) {
    chunks.push(chunk);
    received += chunk.length;
    if (contentLength > 0) {
      const pct = ((received / contentLength) * 100).toFixed(2);
      process.stdout.write(`\r⇣ Downloading ${asset.name}... (${kb} KB): ${pct}%`);
    }
  }
  process.stdout.write('\n');
  writeFileSync(filePath, Buffer.concat(chunks));
}

async function pullAssets(repo, version, to, submodule) {
  const releases = await fetchReleases(repo);
  const latestRelease = findLatestRelease(releases, submodule, version);

  const dir = join(to, version, repo, latestRelease.tag_name);
  mkdirSync(dir, { recursive: true });

  process.stdout.write(`i starting download of ${latestRelease.assets.length} assets\n`);
  for (const asset of latestRelease.assets) {
    await downloadAsset(asset, dir);
  }

  return { dir, release: latestRelease };
}

// ── Builder (sap-connectors) ─────────────────────────────────────────────────

function buildConnector(assetLocation, semver, credentials, submodule = '') {
  const replacements = [
    ['<mangled-version>', semver.replaceAll('.', '_')],
    ['name: sap-odata-connector', `name: sap-odata-connector-${semver}`],
    [/camunda\/sap-odata-connector:<pick.*>/g, `camunda/sap-odata-connector:${semver}`],
    ['<app-version>', semver],
    ['<your-cluster-id>', credentials.clusterId],
    ['<client-id-credential-from-api-client>', credentials.clientId],
    ['<client-secret-credential-from-api-client>', credentials.clientSecret],
    ['<your-cluster-region>', credentials.region],
    ['<cluster-id>', credentials.clusterId],
    ['<client-id>', credentials.clientId],
    ['<client-secret>', credentials.clientSecret],
    ['<region-id>', credentials.region],
    ['<deployment-name>', `camunda-${submodule}-connector`],
    ['<base-domain>', 'camunda.io'],
  ];

  const templatePath = join(assetLocation, 'mtad.yaml.example');
  let content = readFileSync(templatePath, 'utf-8');

  for (const [pattern, replacement] of replacements) {
    if (pattern instanceof RegExp) {
      content = content.replaceAll(pattern, replacement);
    } else {
      content = content.replaceAll(pattern, replacement);
    }
  }

  writeFileSync(join(assetLocation, 'mtad.yaml'), content);
}

function getAssetList(assetLocation) {
  const files = [];
  for (const entry of readdirSync(assetLocation, { withFileTypes: true })) {
    if (entry.isFile()) files.push(entry.name);
  }
  return files.join(', ');
}

// ── Connector command ─────────────────────────────────────────────────────────

async function connector({ camundaVersion, camundaDeployment, credentials, to, submodule }) {
  console.log('');

  if (!submodule) {
    throw new Error("Missing required parameter 'submodule'. Pass 'odata' or 'rfc'.");
  }

  const kind = KIND[submodule];
  if (!kind) {
    throw new Error(`Invalid submodule: ${submodule}. Expected 'odata' or 'rfc'.`);
  }

  const displayName = submodule === 'odata' ? 'OData' : submodule === 'rfc' ? 'RFC' : submodule;

  let downloadDir, latestRelease;
  try {
    const result = await pullAssets(kind, camundaVersion, to, submodule);
    downloadDir = result.dir;
    latestRelease = result.release;
  } catch (err) {
    throw new Error(
      `Failed to download assets for ${displayName} connector for Camunda ${camundaVersion} ` +
      `from GitHub. Please check if version ${camundaVersion} exists and if your GH_TOKEN is correct.\n` +
      String(err?.message ?? err),
    );
  }

  buildConnector(downloadDir, latestRelease.name, credentials);
  console.log('');
  console.log(
    `🛠️ successfully built ${displayName} connector ${latestRelease.name}\n` +
    `\tfor Camunda ${camundaDeployment} ${camundaVersion}\n` +
    `\tin directory ${downloadDir}`,
  );
  console.log(`︙here's the file listing: ${getAssetList(downloadDir)}`);
}

// ── BTP Plugin helpers ────────────────────────────────────────────────────────

function isRepoModified(directory) {
  const result = spawnSync('git', ['-C', directory, 'status', '--porcelain'], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return true;

  const output = result.stdout.toString().trim();
  if (!output) return false;

  const modifiedFiles = output
    .split('\n')
    .filter((line) => line.startsWith('D') || line.startsWith('M'))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (modifiedFiles.length > 0) {
    console.log(`! detected local git repository modifications: ${modifiedFiles.join(', ')}`);
  }
  return modifiedFiles.length > 0;
}

function previousBuildExists(dir) {
  const mtaDir = join(dir, 'mta_archives');
  const mtarFiles = [];

  if (existsSync(mtaDir)) {
    for (const entry of readdirSync(mtaDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.mtar')) mtarFiles.push(entry.name);
    }
  }

  let hasNodeModules = false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'node_modules') {
      console.log('i detected node_modules directory');
      hasNodeModules = true;
    }
  }

  if (mtarFiles.length > 0) console.log(`i detected previous build artifacts: ${mtarFiles.join(', ')}`);
  return hasNodeModules || mtarFiles.length > 0;
}

function cloneRepo(repo, branch, to) {
  const result = spawnSync('git', ['clone', '--branch', branch, repo, to], { stdio: 'inherit' });
  return result.status === 0;
}

function platformRollupPackage() {
  const p = osPlatform();
  const a = osArch();
  if (p === 'darwin' && a === 'arm64') return '@rollup/rollup-darwin-arm64';
  if (p === 'darwin' && a === 'x64')   return '@rollup/rollup-darwin-x64';
  if (p === 'linux'  && a === 'x64')   return '@rollup/rollup-linux-x64-gnu';
  if (p === 'linux'  && a === 'arm64') return '@rollup/rollup-linux-arm64-gnu';
  if (p === 'win32'  && a === 'x64')   return '@rollup/rollup-win32-x64-msvc';
  if (p === 'win32'  && a === 'arm64') return '@rollup/rollup-win32-arm64-msvc';
  return null;
}

function runNpmInstall() {
  if (existsSync('package-lock.json')) {
    const ci = spawnSync('npm', ['ci'], { stdio: 'inherit' });
    if (ci.status === 0) return;
    console.warn('i npm ci failed, retrying with npm install...');
  }

  const install = spawnSync('npm', ['install'], { stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Error installing dependencies');
}

function buildCore() {
  const result = spawnSync('npm', ['run', 'build', '-w', 'core'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Backend build error:\n${result.stderr.toString()}`);
  }
  process.stdout.write(result.stdout.toString());
  console.log('✓ backend build finished');
}

function buildApp() {
  function runBuild() {
    return spawnSync('npm', ['run', 'build', '-w', 'fiori-app'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });
  }

  let result = runBuild();
  let stderrText = result.stderr.toString();

  if (result.status !== 0 && stderrText.includes('Cannot find module @rollup/rollup-')) {
    const rollupPkg = platformRollupPackage();
    if (rollupPkg) {
      console.warn(`i frontend build missing optional rollup binary, installing ${rollupPkg} and retrying...`);
      const inst = spawnSync('npm', ['install', '--no-save', rollupPkg], { stdio: 'inherit' });
      if (inst.status === 0) {
        result = runBuild();
        stderrText = result.stderr.toString();
      }
    }
  }

  if (result.status !== 0) throw new Error(`Frontend build error:\n${stderrText}`);
  process.stdout.write(result.stdout.toString());
  console.log('✓ frontend build finished');
}

function buildMbt() {
  const result = spawnSync('npx', ['--yes', 'mbt', 'build'], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Archive build error:\n${result.stderr.toString()}`);
  }
  process.stdout.write(result.stdout.toString());
}

function rmDevDeps(dir) {
  const pkgPath = join(dir, 'package.json');
  const pkgBakPath = join(dir, 'package.json.bak');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  writeFileSync(pkgBakPath, JSON.stringify(pkg, null, 2));
  delete pkg.devDependencies;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

function replaceInFile(file, searchValue, replaceValue) {
  const content = readFileSync(file, 'utf-8');
  const updated = typeof searchValue === 'string'
    ? content.replaceAll(searchValue, replaceValue)
    : content.replace(searchValue, replaceValue);
  writeFileSync(file, updated);
}

function injectVersion(camundaVersion, btpPluginVersion) {
  const mangledVersion = camundaVersion.replace(/\./g, '_').substring(0, 3);
  replaceInFile('./xs-security.json', '<app-version>', mangledVersion);
  replaceInFile('./mta.yaml', '<app-version>', mangledVersion);
  replaceInFile('./mta.yaml', '<unique-app-version>', btpPluginVersion);
}

function injectRoute(route) {
  replaceInFile('./mta.yaml', '<btp-plugin-route>', route);
}

function injectCredentials(credentials) {
  replaceInFile('./mta.yaml', '<your-cluster-id>', credentials.clusterId);
  replaceInFile('./mta.yaml', '<your-cluster-region>', credentials.region);
  replaceInFile('./mta.yaml', '<client-id-credential-from-api-client>', credentials.clientId);
  replaceInFile('./mta.yaml', '<client-secret-credential-from-api-client>', credentials.clientSecret);
}

async function buildBtpPlugin(inDir, camundaDeployment, camundaVersion, credentials, btpRoute) {
  process.chdir(inDir);

  copyFileSync('./mta.yaml.example', './mta.yaml');
  copyFileSync('./xs-security.json.example', './xs-security.json');

  if (!existsSync(join(inDir, 'package.json'))) {
    throw new Error(
      `package.json not found in ${inDir} — clone may have failed or repository layout changed`,
    );
  }

  const pkg = JSON.parse(readFileSync(join(inDir, 'package.json'), 'utf-8'));
  const btpPluginVersion = pkg.version;

  console.log('i adjusting deployment and environment files...');
  injectVersion(camundaVersion, btpPluginVersion);
  injectRoute(btpRoute);
  injectCredentials(credentials);
  console.log('✓ adjusted mta.yaml and xs-security.json');

  console.log('i installing dependencies...');
  runNpmInstall();
  console.log('✓ installed dependencies');

  console.log('i building backend and frontend...');
  buildCore();
  buildApp();
  console.log('✓ built backend and frontend');

  console.log('i optimizing deployment packages...');
  rmDevDeps('router');
  rmDevDeps('core');
  rmDevDeps('fiori-app');
  console.log('✓ optimized deployment packages');

  console.log('i building deployment archive...');
  buildMbt();
  console.log('✓ built deployment archive');

  console.log('');
  console.log(
    `🛠️ successfully built BTP Plugin\n` +
    `\tfor Camunda ${camundaDeployment} ${camundaVersion}\n` +
    `\tin directory ${inDir}`,
  );

  const mtarDir = join(inDir, 'mta_archives');
  if (!existsSync(mtarDir)) throw new Error('mta_archives directory not found');

  const mtars = readdirSync(mtarDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mtar'))
    .map((e) => e.name);

  console.log(`︙here's the deployment archive (.mtar): ${mtars.join(', ')}`);
}

// ── BTP Plugin command ────────────────────────────────────────────────────────

async function btpPlugin({ camundaVersion, camundaDeployment, credentials, btpRoute, to, btpPluginBranch }) {
  console.log('');
  console.log(`${YELLOW}//> BTP Plugin setup${RESET}`);

  const btpDir = join(to, 'sap-btp-plugin');

  const cloneOrReset = async (reason) => {
    console.log(`! ${reason} — purging...`);
    rmSync(btpDir, { recursive: true });
    mkdirSync(btpDir, { recursive: true });
    await _cloneBtpPlugin(btpDir, btpPluginBranch);
  };

  if (!existsSync(btpDir)) {
    mkdirSync(btpDir, { recursive: true });
    await _cloneBtpPlugin(btpDir, btpPluginBranch);
  } else {
    console.log(`i target directory ${btpDir} already exists`);
    console.log('i checking repository integrity...');

    if (isRepoModified(btpDir)) {
      await cloneOrReset('target directory is not clean');
    } else if (previousBuildExists(btpDir)) {
      await cloneOrReset('target directory contains previous build artifacts');
    } else {
      console.log('✔ repository integrity validated — continuing');
    }
  }

  const originalCwd = process.cwd();
  try {
    await buildBtpPlugin(btpDir, camundaDeployment, camundaVersion, credentials, btpRoute);
  } finally {
    process.chdir(originalCwd);
  }
}

async function _cloneBtpPlugin(to, branch) {
  console.log('i cloning SAP BTP Plugin repository...');
  if (!cloneRepo('https://github.com/camunda/sap-btp-plugin', branch, to)) {
    throw new Error(
      `${RED}Failed to clone SAP BTP Plugin repository from branch ${branch}${RESET}`,
    );
  }
  console.log(`✓ cloned SAP BTP Plugin to ${to} from ${branch} branch`);
}

// ── Setup handler (main entrypoint) ──────────────────────────────────────────

async function setupHandler(args, flags, ctx) {
  warnIfGithubTokenMissing();

  const isYes = ctx?.yes ?? false;

  // ── SAP integration module ───────────────────────────────────────────────
  const sapModule = str(flags?.['for']) ||
    await promptSelect(ctx, 'SAP integration module', SAP_MODULES);

  // ── Camunda version ───────────────────────────────────────────────────────
  const camundaVersion = str(flags?.camunda) ||
    await promptSelect(ctx, 'Camunda version', CAMUNDA_VERSIONS);

  // ── Camunda deployment ────────────────────────────────────────────────────
  const camundaDeployment = str(flags?.deployment) ||
    await promptSelect(ctx, 'Deployment option', DEPLOYMENT_OPTIONS);

  // ── BTP-specific options ─────────────────────────────────────────────────
  const needsBtp = sapModule === 'btp-plugin' || sapModule === 'all';

  const btpRoute = needsBtp
    ? str(flags?.btpRoute) ||
      (isYes
        ? 'camunda-btp-plugin.cfapps.eu10-004.hana.ondemand.com'
        : await inputPrompt(
            'BTP route to reach the plugin\n (without http(s):// and trailing /)',
            'camunda-btp-plugin.cfapps.eu10-004.hana.ondemand.com',
            (input) => !input.endsWith('/') && !input.startsWith('http'),
          ))
    : 'n/a';

  const btpPluginBranch = needsBtp
    ? str(flags?.btpPluginBranch) ||
      (isYes ? 'main' : await inputPrompt('Branch to clone the BTP plugin from', 'main'))
    : 'n/a';

  // ── Target directory ─────────────────────────────────────────────────────
  const defaultTo = createBuildDir(camundaVersion);
  const to = str(flags?.to) ||
    (isYes ? defaultTo : await inputPrompt('Target directory for setup artifacts', defaultTo));

  // ── Credentials ───────────────────────────────────────────────────────────
  let credentials;

  const allFlagsPresent =
    str(flags?.clusterId) && str(flags?.region) &&
    str(flags?.clientId) && str(flags?.clientSecret);

  if (allFlagsPresent) {
    credentials = {
      clusterId:    str(flags.clusterId),
      region:       str(flags.region),
      clientId:     str(flags.clientId),
      clientSecret: str(flags.clientSecret),
    };
  } else if (detectCredentials()) {
    const env = getCredentialsFromEnv();
    credentials = {
      clusterId:    env.CAMUNDA_CLUSTER_ID,
      region:       env.CAMUNDA_CLUSTER_REGION,
      clientId:     env.CAMUNDA_CLIENT_ID,
      clientSecret: env.CAMUNDA_CLIENT_SECRET,
    };
    console.log('\ni Camunda API credentials found in environment. Reusing');
    const masked = Object.fromEntries(
      Object.entries(env).map(([k, v]) => [k, `***${v.slice(-3)}`]),
    );
    console.table(masked);
  } else {
    console.log('\ni No Camunda API credentials found in environment. Enter credentials manually');
    credentials = await getCredentials(flags, ctx);
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const opts = { camundaVersion, camundaDeployment, credentials, to };

  switch (sapModule) {
    case 'all':
      await connector({ ...opts, submodule: 'odata' });
      await connector({ ...opts, submodule: 'rfc' });
      await btpPlugin({ ...opts, btpRoute, btpPluginBranch });
      break;
    case 'btp-plugin':
      await btpPlugin({ ...opts, btpRoute, btpPluginBranch });
      break;
    case 'odata':
      await connector({ ...opts, submodule: 'odata' });
      break;
    case 'rfc':
      await connector({ ...opts, submodule: 'rfc' });
      break;
    default:
      throw new Error(`Unknown SAP integration module: ${sapModule}`);
  }

  console.log(`\n${GREEN}✔ Setup completed successfully${RESET}`);
}

// ── Type helpers ─────────────────────────────────────────────────────────────

function str(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

// ── Plugin exports ────────────────────────────────────────────────────────────

export const commands = {
  'csap-setup': {
    flags: {
      'for': {
        type: 'string',
        description: 'SAP integration module: btp-plugin | odata | rfc | all',
      },
      camunda: {
        type: 'string',
        description: 'Camunda version: 8.6 | 8.7 | 8.8 | 8.9',
      },
      deployment: {
        type: 'string',
        description: 'Camunda deployment option: SaaS',
      },
      clusterId: {
        type: 'string',
        description: 'Camunda Cluster ID',
      },
      region: {
        type: 'string',
        description: 'Camunda Cluster Region (e.g. bru-2)',
      },
      clientId: {
        type: 'string',
        description: 'Camunda API Client: OAuth2 client ID',
      },
      clientSecret: {
        type: 'string',
        description: 'Camunda API Client: OAuth2 client secret',
      },
      btpRoute: {
        type: 'string',
        description: '(btp-plugin / all only) BTP route — host without http(s):// and trailing /',
      },
      btpPluginBranch: {
        type: 'string',
        description: '(btp-plugin / all only) git branch to clone the BTP plugin from (default: main)',
      },
      to: {
        type: 'string',
        description: 'Target directory for setup artifacts (default: OS temp directory)',
      },
    },
    handler: setupHandler,
  },
};

export const metadata = {
  name: 'c8ctl-plugin-csap',
  description: 'Set up Camunda SAP integration modules',
  commands: {
    'csap-setup': {
      description: 'Set up Camunda SAP integration modules interactively',
      helpDescription:
        'Prepares one or more of Camunda\'s SAP integration modules for deployment:\n' +
        '  • OData connector — interact with S/4HANA or ECC from a BPMN model\n' +
        '  • RFC connector — query BAPIs & Remote Function Modules on SAP ECC\n' +
        '  • BTP plugin — render task forms in Fiori, provide BTP integration\n\n' +
        'Credentials are read from --clusterId / --region / --clientId / --clientSecret flags,\n' +
        'from CAMUNDA_CLUSTER_ID / CAMUNDA_CLUSTER_REGION / CAMUNDA_CLIENT_ID / CAMUNDA_CLIENT_SECRET\n' +
        'environment variables, or prompted interactively.\n\n' +
        'A GitHub token in GH_TOKEN is recommended to avoid API rate limiting.',
      examples: [
        {
          command: 'c8ctl csap-setup --for odata --camunda 8.7',
          description: 'Set up OData connector for Camunda 8.7 interactively',
        },
        {
          command: 'c8ctl csap-setup --for rfc --camunda 8.9 --deployment SaaS --clusterId abc --region bru-2 --clientId id --clientSecret sec',
          description: 'Non-interactive RFC connector setup with all flags',
        },
        {
          command: 'c8ctl csap-setup --for btp-plugin --camunda 8.8 --btpRoute my-app.cfapps.eu10.hana.ondemand.com',
          description: 'Set up BTP plugin for Camunda 8.8',
        },
        {
          command: 'c8ctl csap-setup --for all --camunda 8.9',
          description: 'Set up all SAP integration modules for Camunda 8.9',
        },
      ],
    },
  },
};
