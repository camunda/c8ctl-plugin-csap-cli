import assert from 'node:assert';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isC8ctlAvailable, runC8ctl, sandboxEnv } from './helpers/c8ctlCli.js';

// Exercises the plugin through the real c8ctl binary — loading it from disk
// and dispatching a command — rather than calling lib/setup.js directly, so
// flag wiring and plugin registration are covered too, not just the core logic.
const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const SKIP_NO_CLI = !isC8ctlAvailable() ? 'c8ctl CLI not found on PATH' : false;
const SKIP_NETWORK = SKIP_NO_CLI || (!process.env.GH_TOKEN ? 'set GH_TOKEN to run network tests' : false);

const EXPECTED_FLAGS = [
  '--for', '--camunda', '--deployment',
  '--clusterId', '--region', '--clientId', '--clientSecret',
  '--btpRoute', '--btpPluginBranch', '--to',
];

const CREDENTIAL_FLAGS = [
  '--clusterId', 'cli-e2e-cluster-id',
  '--region', 'cli-e2e-region',
  '--clientId', 'cli-e2e-client-id',
  '--clientSecret', 'cli-e2e-client-secret',
];

describe('c8ctl CLI integration (real c8ctl binary, plugin loaded from disk)', () => {
  test('c8ctl load plugin: registers csap-setup with the expected flags', { skip: SKIP_NO_CLI }, () => {
    const home = mkdtempSync(join(tmpdir(), 'csap-cli-home-'));
    try {
      const env = sandboxEnv(home);

      const load = runC8ctl(['load', 'plugin', '--from', `file://${REPO_ROOT}`], env);
      assert.strictEqual(load.status, 0, `c8ctl load plugin failed: ${load.stderr}`);

      const list = runC8ctl(['list', 'plugins'], env);
      assert.strictEqual(list.status, 0, `c8ctl list plugins failed: ${list.stderr}`);
      assert.ok(list.stdout.includes('c8ctl-plugin-csap-cli'), 'plugin missing from c8ctl list plugins');

      const help = runC8ctl(['csap-setup', '--help'], env);
      assert.strictEqual(help.status, 0, `c8ctl csap-setup --help failed: ${help.stderr}`);
      for (const flag of EXPECTED_FLAGS) {
        assert.ok(help.stdout.includes(flag), `csap-setup --help missing flag ${flag}`);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test(
    'c8ctl csap-setup --for odata --camunda 8.9 --yes: runs end-to-end through the real CLI (requires GH_TOKEN)',
    { skip: SKIP_NETWORK, timeout: 120_000 },
    () => {
      const home = mkdtempSync(join(tmpdir(), 'csap-cli-home-'));
      const to = mkdtempSync(join(tmpdir(), 'csap-cli-e2e-odata-'));
      try {
        const env = sandboxEnv(home);

        const load = runC8ctl(['load', 'plugin', '--from', `file://${REPO_ROOT}`], env);
        assert.strictEqual(load.status, 0, `c8ctl load plugin failed: ${load.stderr}`);

        const run = runC8ctl(
          [
            'csap-setup', '--for', 'odata', '--camunda', '8.9', '--deployment', 'SaaS',
            '--to', to, '--yes', ...CREDENTIAL_FLAGS,
          ],
          env,
        );
        assert.strictEqual(run.status, 0, `c8ctl csap-setup failed: ${run.stderr}\n${run.stdout}`);

        const base = join(to, '8.9', 'sap-connectors');
        assert.ok(existsSync(base), `expected ${base} to exist`);
      } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(to, { recursive: true, force: true });
      }
    },
  );
});
