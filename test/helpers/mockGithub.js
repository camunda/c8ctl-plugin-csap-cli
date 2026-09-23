import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '__fixtures__', 'sap-connectors');

// A "fixture://" URL is never dereferenced over the network — the mocked
// fetch below recognizes the scheme and serves the matching local file instead.
function assetsForTag(tag) {
  const dir = join(FIXTURES_DIR, tag);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({
      name: e.name,
      size: statSync(join(dir, e.name)).size,
      browser_download_url: `fixture://sap-connectors/${tag}/${e.name}`,
    }));
}

function release(tag, displayName) {
  return { tag_name: tag, name: displayName, assets: assetsForTag(tag) };
}

// Recorded shape of a `GET /repos/camunda/sap-connectors/releases` response,
// trimmed to the fields the plugin actually reads. `name` intentionally keeps
// the real "<Module> <semver>" display format (not equal to the semver).
export const SAP_CONNECTORS_RELEASES = [
  release('odata-8.9.5', 'OData 8.9.5'),
  release('rfc-8.9.5', 'RFC 8.9.5'),
];

function readFixtureAsset(url) {
  const match = /^fixture:\/\/sap-connectors\/(.+)$/.exec(url);
  if (!match) return null;
  return readFileSync(join(FIXTURES_DIR, match[1]));
}

/**
 * Installs a `fetch` mock (restored automatically when `t`'s test ends) that
 * serves `releases` for the GitHub releases API and fixture files for asset
 * downloads, so github.js's pullAssets()/fetchReleases() run fully offline.
 */
export function installGithubMock(t, releases = SAP_CONNECTORS_RELEASES) {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);

    if (u === 'https://api.github.com/repos/camunda/sap-connectors/releases') {
      return new Response(JSON.stringify(releases), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const body = readFixtureAsset(u);
    if (body) {
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(body.length) },
      });
    }

    throw new Error(`installGithubMock: no fixture for fetch(${u})`);
  });
}
