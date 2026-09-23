import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cp from 'node:child_process';

const BTP_PLUGIN_FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', '__fixtures__', 'sap-btp-plugin');

function ok(stdout = '') {
  return { status: 0, stdout: Buffer.from(stdout), stderr: Buffer.from('') };
}

/**
 * Installs a `cp.spawnSync` mock (restored automatically when `t`'s test
 * ends) that fakes every external process buildBtpPlugin()/btpPlugin() shell
 * out to: `git clone` materializes the recorded sap-btp-plugin fixture tree
 * instead of hitting the network, `git status`/`npm`/`npx` calls no-op, and
 * `npx mbt build` produces a `.mtar` so the downstream existsSync() check passes.
 */
export function installGitAndNpmMock(t) {
  t.mock.method(cp, 'spawnSync', (command, args = []) => {
    if (command === 'git' && args[0] === 'clone') {
      const to = args.at(-1);
      cpSync(BTP_PLUGIN_FIXTURE, to, { recursive: true });
      return ok();
    }

    if (command === 'git' && args[0] === '-C') {
      // isRepoModified()'s `git status --porcelain` — report a clean tree.
      return ok('');
    }

    if (command === 'npm') {
      // npm ci / npm install / npm run build -w <workspace> — all no-ops.
      return ok();
    }

    if (command === 'npx') {
      // `npx --yes mbt build` — produce the .mtar buildBtpPlugin() expects to find.
      const mtaDir = join(process.cwd(), 'mta_archives');
      mkdirSync(mtaDir, { recursive: true });
      writeFileSync(join(mtaDir, 'camunda-btp-plugin-fixture-1.0.4.mtar'), 'fake-mtar-content-for-tests');
      return ok();
    }

    throw new Error(`installGitAndNpmMock: unexpected spawnSync(${command}, ${JSON.stringify(args)})`);
  });
}
