import assert from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { btpPlugin } from '../lib/btp-plugin.js';

const SKIP_NETWORK = !process.env.GH_TOKEN ? 'set GH_TOKEN to run network tests' : false;

const VERSION = '8.8';
const ROUTE = 'my-route.example.org';
const CREDENTIALS = {
  clusterId: 'my-cluster-id',
  region: 'region-1',
  clientId: 'abcdefg',
  clientSecret: 'qwerty',
};

describe('BTP Plugin setup (requires GH_TOKEN)', () => {
  test(
    `full build pipeline creates deployable .mtar archive for Camunda ${VERSION}`,
    { skip: SKIP_NETWORK, timeout: 900_000 },
    async () => {
      const buildDir = mkdtempSync(join(tmpdir(), 'csap-btp-test-'));
      try {
        await btpPlugin({
          camundaVersion: VERSION,
          camundaDeployment: 'SaaS',
          credentials: CREDENTIALS,
          btpRoute: ROUTE,
          to: buildDir,
          btpPluginBranch: 'main',
        });

        // .mtar archive was created
        const mtaArchives = join(buildDir, 'sap-btp-plugin', 'mta_archives');
        assert.ok(existsSync(mtaArchives), `expected mta_archives directory at ${mtaArchives}`);
        const entries = readdirSync(mtaArchives, { withFileTypes: true });
        assert.ok(
          entries.some((e) => e.isFile() && e.name.endsWith('.mtar')),
          `no .mtar file found in ${mtaArchives}`,
        );

        // mta.yaml contains injected credentials and route
        const mtaYaml = readFileSync(join(buildDir, 'sap-btp-plugin', 'mta.yaml'), 'utf-8');
        assert.ok(mtaYaml.includes(ROUTE), 'mta.yaml missing BTP route');
        assert.ok(mtaYaml.includes(CREDENTIALS.clusterId), 'mta.yaml missing cluster ID');
        assert.ok(mtaYaml.includes(CREDENTIALS.region), 'mta.yaml missing region');
        assert.ok(mtaYaml.includes(CREDENTIALS.clientId), 'mta.yaml missing client ID');
        assert.ok(mtaYaml.includes(CREDENTIALS.clientSecret), 'mta.yaml missing client secret');

        // xs-security.json contains the mangled version (dots replaced by underscores)
        const xsSec = readFileSync(join(buildDir, 'sap-btp-plugin', 'xs-security.json'), 'utf-8');
        const mangled = VERSION.replace('.', '_');
        assert.ok(xsSec.includes(mangled), `xs-security.json missing mangled version ${mangled}`);
      } finally {
        rmSync(buildDir, { recursive: true, force: true });
      }
    },
  );
});
