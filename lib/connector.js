import { KIND } from './constants.js';
import { pullAssets } from './github.js';
import { buildConnector, getAssetList } from './builder.js';

export async function connector({ camundaVersion, camundaDeployment, credentials, to, submodule }) {
  console.log('');

  if (!submodule) {
    throw new Error("Missing required parameter 'submodule'. Pass 'odata' or 'rfc'.");
  }

  const kind = KIND[submodule];
  if (!kind) {
    throw new Error(`Invalid submodule: ${submodule}. Expected 'odata' or 'rfc'.`);
  }

  const displayName = submodule === 'odata' ? 'OData' : submodule === 'rfc' ? 'RFC' : submodule;

  let downloadDir, latestRelease;
  try {
    const result = await pullAssets(kind, camundaVersion, to, submodule);
    downloadDir = result.dir;
    latestRelease = result.release;
  } catch (err) {
    throw new Error(
      `Failed to download assets for ${displayName} connector for Camunda ${camundaVersion} ` +
      `from GitHub. Please check if version ${camundaVersion} exists and if your GH_TOKEN is correct.\n` +
      String(err?.message ?? err),
    );
  }

  buildConnector(downloadDir, latestRelease.semver, credentials, submodule);
  console.log('');
  console.log(
    `🛠️ successfully built ${displayName} connector ${latestRelease.name}\n` +
    `\tfor Camunda ${camundaDeployment} ${camundaVersion}\n` +
    `\tin directory ${downloadDir}`,
  );
  console.log(`︙here's the file listing: ${getAssetList(downloadDir)}`);
}
