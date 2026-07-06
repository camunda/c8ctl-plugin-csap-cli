import assert from 'node:assert';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fetchReleases, findLatestRelease } from '../lib/github.js';

// ── findLatestRelease (pure — no network) ────────────────────────────────────

const MOCK_RELEASES = [
  { tag_name: 'odata-8.8.0', name: '8.8.0', assets: [] },
  { tag_name: 'odata-8.8.1', name: '8.8.1', assets: [] },
  { tag_name: 'odata-8.8.2', name: '8.8.2', assets: [] },
  { tag_name: 'odata-8.7.3', name: '8.7.3', assets: [] },
  { tag_name: 'rfc-8.8.0', name: '8.8.0', assets: [] },
  { tag_name: 'rfc-8.8.1', name: '8.8.1', assets: [] },
];

describe('findLatestRelease', () => {
  test('returns the highest patch release for the given major.minor', () => {
    const release = findLatestRelease(MOCK_RELEASES, 'odata', '8.8');
    assert.strictEqual(release.name, '8.8.2');
  });

  test('filters by submodule — odata tags do not count for rfc', () => {
    const release = findLatestRelease(MOCK_RELEASES, 'rfc', '8.8');
    assert.strictEqual(release.name, '8.8.1');
  });

  test('only returns releases for the requested major.minor', () => {
    const release = findLatestRelease(MOCK_RELEASES, 'odata', '8.7');
    assert.strictEqual(release.name, '8.7.3');
  });

  test('throws when no matching release exists', () => {
    assert.throws(
      () => findLatestRelease(MOCK_RELEASES, 'odata', '0.0'),
      /The requested odata-connector for version 0\.0 is not supported/,
    );
  });

  test('throws listing available releases in the error message', () => {
    try {
      findLatestRelease(MOCK_RELEASES, 'rfc', '0.0');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('Currently available releases'));
    }
  });
});

// ── fetchReleases (network) ──────────────────────────────────────────────────

const SKIP_NETWORK = !process.env.GH_TOKEN
  ? 'set GH_TOKEN to run network tests'
  : false;

describe('fetchReleases (requires GH_TOKEN)', () => {
  test('returns at least one release for sap-connectors', { skip: SKIP_NETWORK }, async () => {
    const releases = await fetchReleases('sap-connectors');
    assert.ok(Array.isArray(releases));
    assert.ok(releases.length >= 1, 'expected at least one release');
  });

  test('each release has tag_name, name, and assets', { skip: SKIP_NETWORK }, async () => {
    const releases = await fetchReleases('sap-connectors');
    for (const r of releases.slice(0, 5)) {
      assert.ok(typeof r.tag_name === 'string' && r.tag_name.length > 0);
      assert.ok(Array.isArray(r.assets));
    }
  });

  test('fetchReleases + findLatestRelease returns a real 8.8 odata release', { skip: SKIP_NETWORK }, async () => {
    const releases = await fetchReleases('sap-connectors');
    const latest = findLatestRelease(releases, 'odata', '8.8');
    assert.match(latest.name, /^8\.8\.\d+$/);
    assert.notStrictEqual(latest.name, '8.8.0');
  });

  test('fetchReleases + findLatestRelease returns a real 8.8 rfc release', { skip: SKIP_NETWORK }, async () => {
    const releases = await fetchReleases('sap-connectors');
    const latest = findLatestRelease(releases, 'rfc', '8.8');
    assert.match(latest.name, /^8\.8\.\d+$/);
  });

  test('findLatestRelease throws for non-existent version 0.0', { skip: SKIP_NETWORK }, async () => {
    const releases = await fetchReleases('sap-connectors');
    const tmp = mkdtempSync(join(tmpdir(), 'csap-test-'));
    try {
      assert.throws(
        () => findLatestRelease(releases, 'odata', '0.0'),
        /The requested odata-connector for version 0\.0 is not supported/,
      );
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
