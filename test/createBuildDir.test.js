import assert from 'node:assert';
import { mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, test } from 'node:test';
import { createBuildDir } from '../lib/utils.js';

describe('createBuildDir', () => {
  test('returns a path under the system temp dir containing "camunda"', () => {
    const result = createBuildDir();
    assert.ok(result.startsWith(tmpdir()), `expected ${result} to start with ${tmpdir()}`);
    assert.ok(result.includes('camunda'));
  });

  test('returns a version-specific path when camundaVersion is provided', () => {
    const result = createBuildDir('8.7');
    assert.ok(result.includes('8.7'));
    assert.ok(result.includes('camunda'));
  });

  test('returned path can be created as a directory', () => {
    const result = createBuildDir('8.7');
    mkdirSync(result, { recursive: true });
    assert.ok(statSync(result).isDirectory(), `expected ${result} to be a directory`);
  });

  test('path without version differs from path with version', () => {
    const withoutVersion = createBuildDir();
    const withVersion = createBuildDir('8.9');
    assert.notStrictEqual(withoutVersion, withVersion);
    assert.ok(withVersion.includes('8.9'));
  });
});
