import assert from 'node:assert';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildConnector } from '../c8ctl-plugin.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const CREDENTIALS = {
  clusterId: 'xxx',
  clientId: 'yyy',
  clientSecret: 'zzz',
  region: 'bru-2',
};

describe('buildConnector — sap-odata-connector', () => {
  for (const submodule of ['odata', 'rfc']) {
    const assetDir = join(__dirname, '__assets__', `sap-${submodule}-connector`);
    const versions = readdirSync(assetDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const version of versions) {
      test(`generates correct mtad.yaml for ${submodule} ${version}`, () => {
        const assetLocation = join(assetDir, version);
        const generatedPath = join(assetLocation, 'mtad.yaml');

        try {
          buildConnector(assetLocation, version, CREDENTIALS, submodule);

          const generated = readFileSync(generatedPath, 'utf-8');
          const expected = readFileSync(join(assetLocation, 'mtad.yaml.expected'), 'utf-8');

          assert.strictEqual(
            generated,
            expected,
            `Generated mtad.yaml does not match expected for ${submodule} ${version}`,
          );
        } finally {
          if (existsSync(generatedPath)) rmSync(generatedPath);
        }
      });
    }
  }
});
