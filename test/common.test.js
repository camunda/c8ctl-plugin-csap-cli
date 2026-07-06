import assert from 'node:assert';
import { describe, test } from 'node:test';
import { warnIfGithubTokenMissing } from '../c8ctl-plugin.js';

describe('warnIfGithubTokenMissing', () => {
  test('emits a console.warn when GH_TOKEN is absent', (t) => {
    const saved = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;

    const warnMock = t.mock.method(console, 'warn');
    try {
      warnIfGithubTokenMissing();
      assert.strictEqual(warnMock.mock.calls.length, 1);
      assert.ok(
        String(warnMock.mock.calls[0].arguments[0]).includes('No GitHub token found'),
        'warn message should mention missing GH_TOKEN',
      );
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
    }
  });

  test('does not emit console.warn when GH_TOKEN is present', (t) => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'test-token';

    const warnMock = t.mock.method(console, 'warn');
    try {
      warnIfGithubTokenMissing();
      assert.strictEqual(warnMock.mock.calls.length, 0);
    } finally {
      if (saved === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = saved;
    }
  });
});
