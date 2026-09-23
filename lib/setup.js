import { SAP_MODULES, CAMUNDA_VERSIONS, DEPLOYMENT_OPTIONS, GREEN, RESET } from './constants.js';
import { str, warnIfGithubTokenMissing, createBuildDir, expandPath } from './utils.js';
import { inputPrompt, promptSelect } from './prompt.js';
import { detectCredentials, getCredentialsFromEnv, getCredentials } from './credentials.js';
import { connector } from './connector.js';
import { btpPlugin } from './btp-plugin.js';

export async function setupHandler(args, flags, ctx) {
  warnIfGithubTokenMissing();

  const isYes = ctx?.yes ?? false;

  // ── SAP integration module ───────────────────────────────────────────────
  const sapModule = str(flags?.['for']) ||
    await promptSelect(ctx, 'SAP integration module', SAP_MODULES);

  // ── Camunda version ───────────────────────────────────────────────────────
  const camundaVersion = str(flags?.camunda) ||
    await promptSelect(ctx, 'Camunda version', CAMUNDA_VERSIONS);

  // ── Camunda deployment ────────────────────────────────────────────────────
  const camundaDeployment = str(flags?.deployment) ||
    await promptSelect(ctx, 'Deployment option', DEPLOYMENT_OPTIONS);

  // ── BTP-specific options ─────────────────────────────────────────────────
  const needsBtp = sapModule === 'btp-plugin' || sapModule === 'all';

  const btpRoute = needsBtp
    ? str(flags?.btpRoute) ||
      (isYes
        ? 'camunda-btp-plugin.cfapps.eu10-004.hana.ondemand.com'
        : await inputPrompt(
            'BTP route to reach the plugin\n (without http(s):// and trailing /)',
            'camunda-btp-plugin.cfapps.eu10-004.hana.ondemand.com',
            (input) => !input.endsWith('/') && !input.startsWith('http'),
          ))
    : 'n/a';

  const btpPluginBranch = needsBtp
    ? str(flags?.btpPluginBranch) ||
      (isYes ? 'main' : await inputPrompt('Branch to clone the BTP plugin from', 'main'))
    : 'n/a';

  // ── Target directory ─────────────────────────────────────────────────────
  const defaultTo = createBuildDir(camundaVersion);
  const rawTo = str(flags?.to) ||
    (isYes ? defaultTo : await inputPrompt('Target directory for setup artifacts', defaultTo));
  const to = expandPath(rawTo);

  // ── Credentials ───────────────────────────────────────────────────────────
  let credentials;

  const allFlagsPresent =
    str(flags?.clusterId) && str(flags?.region) &&
    str(flags?.clientId) && str(flags?.clientSecret);

  if (allFlagsPresent) {
    credentials = {
      clusterId:    str(flags.clusterId),
      region:       str(flags.region),
      clientId:     str(flags.clientId),
      clientSecret: str(flags.clientSecret),
    };
  } else if (detectCredentials()) {
    const env = getCredentialsFromEnv();
    credentials = {
      clusterId:    env.CAMUNDA_CLUSTER_ID,
      region:       env.CAMUNDA_CLUSTER_REGION,
      clientId:     env.CAMUNDA_CLIENT_ID,
      clientSecret: env.CAMUNDA_CLIENT_SECRET,
    };
    console.log('\ni Camunda API credentials found in environment. Reusing');
    const masked = Object.fromEntries(
      Object.entries(env).map(([k, v]) => [k, `***${v.slice(-3)}`]),
    );
    console.table(masked);
  } else {
    console.log('\ni No Camunda API credentials found in environment. Enter credentials manually');
    credentials = await getCredentials(flags, ctx);
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const opts = { camundaVersion, camundaDeployment, credentials, to };

  switch (sapModule) {
    case 'all':
      await connector({ ...opts, submodule: 'odata' });
      await connector({ ...opts, submodule: 'rfc' });
      await btpPlugin({ ...opts, btpRoute, btpPluginBranch });
      break;
    case 'btp-plugin':
      await btpPlugin({ ...opts, btpRoute, btpPluginBranch });
      break;
    case 'odata':
      await connector({ ...opts, submodule: 'odata' });
      break;
    case 'rfc':
      await connector({ ...opts, submodule: 'rfc' });
      break;
    default:
      throw new Error(`Unknown SAP integration module: ${sapModule}`);
  }

  console.log(`\n${GREEN}✔ Setup completed successfully${RESET}`);
}
