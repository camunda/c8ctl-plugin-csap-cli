import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { arch as osArch, platform as osPlatform } from 'node:os';
import { join } from 'node:path';
import { RED, YELLOW, RESET } from './constants.js';

const SHELL = process.platform === 'win32';

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
    const ci = spawnSync('npm', ['ci'], { stdio: 'inherit', shell: SHELL });
    if (ci.status === 0) return;
    console.warn('i npm ci failed, retrying with npm install...');
  }

  const install = spawnSync('npm', ['install'], { stdio: ['inherit', 'pipe', 'pipe'], shell: SHELL });
  if (install.status !== 0) {
    throw new Error(`Error installing dependencies:\n${install.stderr.toString()}`);
  }
}

function buildCore() {
  const result = spawnSync('npm', ['run', 'build', '-w', 'core'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: SHELL,
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
      shell: SHELL,
    });
  }

  let result = runBuild();
  let stderrText = result.stderr.toString();

  if (result.status !== 0 && stderrText.includes('Cannot find module @rollup/rollup-')) {
    const rollupPkg = platformRollupPackage();
    if (rollupPkg) {
      console.warn(`i frontend build missing optional rollup binary, installing ${rollupPkg} and retrying...`);
      const inst = spawnSync('npm', ['install', '--no-save', rollupPkg], { stdio: 'inherit', shell: SHELL });
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
    shell: SHELL,
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

async function _cloneBtpPlugin(to, branch) {
  console.log('i cloning SAP BTP Plugin repository...');
  if (!cloneRepo('https://github.com/camunda/sap-btp-plugin', branch, to)) {
    throw new Error(
      `${RED}Failed to clone SAP BTP Plugin repository from branch ${branch}${RESET}`,
    );
  }
  console.log(`✓ cloned SAP BTP Plugin to ${to} from ${branch} branch`);
}

export async function btpPlugin({ camundaVersion, camundaDeployment, credentials, btpRoute, to, btpPluginBranch }) {
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
