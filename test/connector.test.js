import assert from 'node:assert';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { connector } from '../lib/connector.js';

const SKIP_NETWORK = !process.env.GH_TOKEN ? 'set GH_TOKEN to run network tests' : false;

const CREDENTIALS = {
  clusterId: 'test-cluster-id',
  region: 'bru-2',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('connector (requires GH_TOKEN)', () => {
  for (const submodule of ['odata', 'rfc']) {
    test(`downloads assets for ${submodule} submodule`, { skip: SKIP_NETWORK }, async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'csap-connector-test-'));
      try {
        await connector({
          camundaVersion: '8.8',
          camundaDeployment: 'SaaS',
          credentials: CREDENTIALS,
          to: tmp,
          submodule,
        });

        const base = join(tmp, '8.8', 'sap-connectors');
        assert.ok(existsSync(base), `expected base directory ${base} to exist`);
        const entries = readdirSync(base, { withFileTypes: true });
        assert.ok(
          entries.some((e) => e.isDirectory()),
          'expected at least one release directory under base',
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
