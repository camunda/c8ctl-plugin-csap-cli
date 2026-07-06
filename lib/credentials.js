import { ALL_CAMUNDA_CREDENTIAL_KEYS } from './constants.js';
import { str } from './utils.js';
import { inputPrompt } from './prompt.js';

export function detectCredentials() {
  return ALL_CAMUNDA_CREDENTIAL_KEYS.every((k) => Boolean(process.env[k]));
}

export function getCredentialsFromEnv() {
  return {
    CAMUNDA_CLUSTER_ID:     process.env.CAMUNDA_CLUSTER_ID ?? '',
    CAMUNDA_CLIENT_ID:      process.env.CAMUNDA_CLIENT_ID ?? '',
    CAMUNDA_CLIENT_SECRET:  process.env.CAMUNDA_CLIENT_SECRET ?? '',
    CAMUNDA_CLUSTER_REGION: process.env.CAMUNDA_CLUSTER_REGION ?? '',
  };
}

export async function getCredentials(flags, ctx) {
  const isYes = ctx?.yes ?? false;

  const clusterId = str(flags?.clusterId) ||
    (isYes ? '' : await inputPrompt('Camunda Cluster ID'));

  const region = str(flags?.region) ||
    (isYes ? 'bru-2' : await inputPrompt('Camunda Cluster Region', 'bru-2'));

  const clientId = str(flags?.clientId) ||
    (isYes ? '' : await inputPrompt('Camunda API Client - Client ID'));

  const clientSecret = str(flags?.clientSecret) ||
    (isYes ? '' : await inputPrompt('Camunda API Client - Client Secret'));

  return { clusterId, region, clientId, clientSecret };
}
