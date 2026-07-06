import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  detectCredentials,
  getCredentials,
  getCredentialsFromEnv,
} from '../lib/credentials.js';

const ENV_VARS = {
  CAMUNDA_CLUSTER_ID: 'test-cluster-id',
  CAMUNDA_CLIENT_ID: 'test-client-id',
  CAMUNDA_CLIENT_SECRET: 'test-client-secret',
  CAMUNDA_CLUSTER_REGION: 'test-region',
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;
}

function clearEnv() {
  for (const k of Object.keys(ENV_VARS)) delete process.env[k];
}

describe('detectCredentials', () => {
  test('returns true when all four env vars are set', () => {
    setEnv();
    try {
      assert.ok(detectCredentials(), 'expected detectCredentials() to return true');
    } finally {
      clearEnv();
    }
  });

  test('returns false when at least one env var is missing', () => {
    setEnv();
    delete process.env.CAMUNDA_CLIENT_SECRET;
    try {
      assert.ok(!detectCredentials(), 'expected detectCredentials() to return false');
    } finally {
      clearEnv();
    }
  });

  test('returns false when no env vars are set', () => {
    clearEnv();
    assert.ok(!detectCredentials());
  });
});

describe('getCredentialsFromEnv', () => {
  test('returns all credentials from env vars', () => {
    setEnv();
    try {
      const creds = getCredentialsFromEnv();
      assert.strictEqual(creds.CAMUNDA_CLUSTER_ID, ENV_VARS.CAMUNDA_CLUSTER_ID);
      assert.strictEqual(creds.CAMUNDA_CLIENT_ID, ENV_VARS.CAMUNDA_CLIENT_ID);
      assert.strictEqual(creds.CAMUNDA_CLIENT_SECRET, ENV_VARS.CAMUNDA_CLIENT_SECRET);
      assert.strictEqual(creds.CAMUNDA_CLUSTER_REGION, ENV_VARS.CAMUNDA_CLUSTER_REGION);
    } finally {
      clearEnv();
    }
  });

  test('returns empty strings for unset vars', () => {
    clearEnv();
    const creds = getCredentialsFromEnv();
    assert.strictEqual(creds.CAMUNDA_CLUSTER_ID, '');
    assert.strictEqual(creds.CAMUNDA_CLIENT_ID, '');
    assert.strictEqual(creds.CAMUNDA_CLIENT_SECRET, '');
    assert.strictEqual(creds.CAMUNDA_CLUSTER_REGION, '');
  });
});

describe('getCredentials', () => {
  test('returns credentials from flags without prompting when all flags are provided', async () => {
    const flags = {
      clusterId: 'flag-cluster-id',
      region: 'flag-region',
      clientId: 'flag-client-id',
      clientSecret: 'flag-client-secret',
    };

    const creds = await getCredentials(flags, { yes: true });

    assert.strictEqual(creds.clusterId, flags.clusterId);
    assert.strictEqual(creds.region, flags.region);
    assert.strictEqual(creds.clientId, flags.clientId);
    assert.strictEqual(creds.clientSecret, flags.clientSecret);
  });

  test('returns default region bru-2 when ctx.yes=true and no region flag', async () => {
    const flags = {
      clusterId: 'id',
      clientId: 'cid',
      clientSecret: 'sec',
    };

    const creds = await getCredentials(flags, { yes: true });
    assert.strictEqual(creds.region, 'bru-2');
  });
});
