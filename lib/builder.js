import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function buildConnector(assetLocation, semver, credentials, submodule = '') {
  const replacements = [
    ['<mangled-version>', semver.replaceAll('.', '_')],
    ['name: sap-odata-connector', `name: sap-odata-connector-${semver}`],
    [/camunda\/sap-odata-connector:<pick.*>/g, `camunda/sap-odata-connector:${semver}`],
    ['<app-version>', semver],
    ['<your-cluster-id>', credentials.clusterId],
    ['<client-id-credential-from-api-client>', credentials.clientId],
    ['<client-secret-credential-from-api-client>', credentials.clientSecret],
    ['<your-cluster-region>', credentials.region],
    ['<cluster-id>', credentials.clusterId],
    ['<client-id>', credentials.clientId],
    ['<client-secret>', credentials.clientSecret],
    ['<region-id>', credentials.region],
    ['<deployment-name>', `camunda-${submodule}-connector`],
    ['<base-domain>', 'camunda.io'],
  ];

  const templatePath = join(assetLocation, 'mtad.yaml.example');
  let content = readFileSync(templatePath, 'utf-8');

  for (const [pattern, replacement] of replacements) {
    if (pattern instanceof RegExp) {
      content = content.replaceAll(pattern, replacement);
    } else {
      content = content.replaceAll(pattern, replacement);
    }
  }

  writeFileSync(join(assetLocation, 'mtad.yaml'), content);

  // The RFC connector's mtad.yaml references its .war under a target/ directory
  // (a leftover of the Maven build layout), but the release asset is downloaded
  // flat into assetLocation. Relocate it so the path in mtad.yaml resolves.
  if (submodule === 'rfc') relocateWarToTargetDir(assetLocation, semver);
}

function relocateWarToTargetDir(assetLocation, semver) {
  const warName = `rfc-${semver}.war`;
  const src = join(assetLocation, warName);
  if (!existsSync(src)) return;

  const targetDir = join(assetLocation, 'target');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(src, join(targetDir, warName));
}

export function getAssetList(assetLocation) {
  const files = [];
  for (const entry of readdirSync(assetLocation, { withFileTypes: true })) {
    if (entry.isFile()) files.push(entry.name);
  }
  return files.join(', ');
}
