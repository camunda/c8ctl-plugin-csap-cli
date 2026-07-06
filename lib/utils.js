import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function str(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

export function warnIfGithubTokenMissing() {
  if (!process.env.GH_TOKEN) {
    console.warn(
      '! No GitHub token found in environment variable GH_TOKEN. ' +
      'GitHub API requests may be rate-limited during execution.',
    );
  }
}

export function createBuildDir(camundaVersion) {
  return camundaVersion
    ? join(tmpdir(), 'camunda', camundaVersion)
    : join(tmpdir(), 'camunda');
}
