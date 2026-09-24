import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const USE_SHELL = process.platform === 'win32';

export function isC8ctlAvailable() {
  const result = spawnSync('c8ctl', ['--version'], { shell: USE_SHELL });
  return result.error == null && result.status === 0;
}

// c8ctl persists plugin/profile state under the OS-conventional config dir,
// which is derived from these env vars — overriding all of them sandboxes
// the real user's c8ctl installation from whatever the test does.
export function sandboxEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: join(homeDir, 'AppData', 'Roaming'),
    XDG_CONFIG_HOME: join(homeDir, '.config'),
    XDG_DATA_HOME: join(homeDir, '.local', 'share'),
  };
}

export function runC8ctl(args, env) {
  return spawnSync('c8ctl', args, { env, encoding: 'utf-8', shell: USE_SHELL });
}
