import assert from 'node:assert';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { setupHandler } from '../lib/setup.js';
import { installGithubMock } from './helpers/mockGithub.js';
import { installGitAndNpmMock } from './helpers/mockChildProcess.js';
import {
  assertAllPathsResolve,
  assertNoLeftoverPlaceholders,
  assertNoOverlappingNames,
  assertNoSpacesInVersionNameOrImageTag,
  assertVersionIsSemver,
} from './helpers/assertMtad.js';

// Matches the fixture releases recorded in test/helpers/mockGithub.js.
const CAMUNDA_VERSION = '8.9';
const RELEASE_SEMVER = '8.9.5';

// Covers the connectors on a second, non-latest supported Camunda version
// (8.6 is deprecated and intentionally left untested).
const CAMUNDA_VERSIONS_UNDER_TEST = [
  { camundaVersion: '8.9', releaseSemver: '8.9.5' },
  { camundaVersion: '8.7', releaseSemver: '8.7.2' },
];

const CREDENTIALS_FLAGS = {
  clusterId: 'e2e-cluster-id',
  region: 'e2e-region',
  clientId: 'e2e-client-id',
  clientSecret: 'e2e-client-secret',
};

function mtadPathFor(to, submodule, camundaVersion = CAMUNDA_VERSION, releaseSemver = RELEASE_SEMVER) {
  return join(to, camundaVersion, 'sap-connectors', `${submodule}-${releaseSemver}`, 'mtad.yaml');
}

function assertConnectorMtad(mtadPath, label) {
  const content = readFileSync(mtadPath, 'utf-8');
  assertNoLeftoverPlaceholders(content, label);
  assertNoSpacesInVersionNameOrImageTag(content, label);
  assertVersionIsSemver(content, label);
  assertAllPathsResolve(content, mtadPath, label);
  return content;
}

describe('setupHandler — offline e2e (mocked GitHub releases + stubbed git/npm)', () => {
  for (const { camundaVersion, releaseSemver } of CAMUNDA_VERSIONS_UNDER_TEST) {
    test(`--for odata --camunda ${camundaVersion} --yes: exits cleanly and produces a valid mtad.yaml`, async (t) => {
      installGithubMock(t);
      const to = mkdtempSync(join(tmpdir(), 'csap-e2e-odata-'));
      try {
        await setupHandler(
          {},
          { for: 'odata', camunda: camundaVersion, deployment: 'SaaS', to, ...CREDENTIALS_FLAGS },
          { yes: true },
        );

        assertConnectorMtad(mtadPathFor(to, 'odata', camundaVersion, releaseSemver), 'odata mtad.yaml');
      } finally {
        rmSync(to, { recursive: true, force: true });
      }
    });

    test(`--for rfc --camunda ${camundaVersion} --yes: exits cleanly and produces a valid mtad.yaml`, async (t) => {
      installGithubMock(t);
      const to = mkdtempSync(join(tmpdir(), 'csap-e2e-rfc-'));
      try {
        await setupHandler(
          {},
          { for: 'rfc', camunda: camundaVersion, deployment: 'SaaS', to, ...CREDENTIALS_FLAGS },
          { yes: true },
        );

        assertConnectorMtad(mtadPathFor(to, 'rfc', camundaVersion, releaseSemver), 'rfc mtad.yaml');
      } finally {
        rmSync(to, { recursive: true, force: true });
      }
    });
  }

  test('--for btp-plugin --yes: exits cleanly and produces a deployable .mtar', async (t) => {
    installGitAndNpmMock(t);
    const to = mkdtempSync(join(tmpdir(), 'csap-e2e-btp-'));
    try {
      await setupHandler(
        {},
        {
          for: 'btp-plugin',
          camunda: CAMUNDA_VERSION,
          deployment: 'SaaS',
          to,
          btpRoute: 'my-e2e-route.example.org',
          btpPluginBranch: 'main',
          ...CREDENTIALS_FLAGS,
        },
        { yes: true },
      );

      const btpDir = join(to, 'sap-btp-plugin');
      const mtaYaml = readFileSync(join(btpDir, 'mta.yaml'), 'utf-8');
      assertNoLeftoverPlaceholders(mtaYaml, 'btp-plugin mta.yaml');
      assert.ok(mtaYaml.includes('my-e2e-route.example.org'), 'mta.yaml missing injected BTP route');

      const mtaArchives = join(btpDir, 'mta_archives');
      assert.ok(existsSync(mtaArchives), `expected ${mtaArchives} to exist`);
      const mtars = readdirSync(mtaArchives).filter((f) => f.endsWith('.mtar'));
      assert.ok(mtars.length > 0, 'expected at least one .mtar in mta_archives');
    } finally {
      rmSync(to, { recursive: true, force: true });
    }
  });

  test('--for all --yes: builds odata, rfc, and btp-plugin without colliding resource names', async (t) => {
    installGithubMock(t);
    installGitAndNpmMock(t);
    const to = mkdtempSync(join(tmpdir(), 'csap-e2e-all-'));
    try {
      await setupHandler(
        {},
        {
          for: 'all',
          camunda: CAMUNDA_VERSION,
          deployment: 'SaaS',
          to,
          btpRoute: 'my-e2e-route.example.org',
          btpPluginBranch: 'main',
          ...CREDENTIALS_FLAGS,
        },
        { yes: true },
      );

      const odataContent = assertConnectorMtad(mtadPathFor(to, 'odata'), 'all: odata mtad.yaml');
      const rfcContent = assertConnectorMtad(mtadPathFor(to, 'rfc'), 'all: rfc mtad.yaml');
      assertNoOverlappingNames(odataContent, 'odata mtad.yaml', rfcContent, 'rfc mtad.yaml');

      const mtaArchives = join(to, 'sap-btp-plugin', 'mta_archives');
      assert.ok(existsSync(mtaArchives), `expected ${mtaArchives} to exist`);
    } finally {
      rmSync(to, { recursive: true, force: true });
    }
  });
});
