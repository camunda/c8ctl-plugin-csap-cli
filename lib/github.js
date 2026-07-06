import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

async function githubRequest(path) {
  const headers = {
    'User-Agent': 'c8ctl-plugin-csap-cli',
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

export async function fetchReleases(repo) {
  process.stdout.write('i fetching releases...\n');
  const releases = await githubRequest(`/repos/camunda/${repo}/releases`);
  process.stdout.write(`✓ fetched releases: ${releases.length}\n`);
  return releases;
}

export function findLatestRelease(releases, submodule, version) {
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

export async function downloadAsset(asset, dir) {
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

export async function pullAssets(repo, version, to, submodule) {
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
