/**
 * c8ctl-plugin-csap-cli
 *
 * Node.js port of the csap CLI (Camunda SAP Integration CLI) for the c8ctl
 * plugin system. Supports setup of:
 *   - OData connector
 *   - RFC connector
 *   - SAP BTP plugin
 *
 * Original tool: https://github.com/camunda/sap-csap-cli (Deno)
 */

import { setupHandler } from './lib/setup.js';

export const commands = {
  'csap-setup': {
    flags: {
      'for': {
        type: 'string',
        description: 'SAP integration module: btp-plugin (deprecated) | odata | rfc | all',
      },
      camunda: {
        type: 'string',
        description: 'Camunda version: 8.7 | 8.8 | 8.9 | 8.10',
      },
      deployment: {
        type: 'string',
        description: 'Camunda deployment option: SaaS',
      },
      clusterId: {
        type: 'string',
        description: 'Camunda Cluster ID',
      },
      region: {
        type: 'string',
        description: 'Camunda Cluster Region (e.g. bru-2)',
      },
      clientId: {
        type: 'string',
        description: 'Camunda API Client: OAuth2 client ID',
      },
      clientSecret: {
        type: 'string',
        description: 'Camunda API Client: OAuth2 client secret',
      },
      btpRoute: {
        type: 'string',
        description: '(btp-plugin / all only) BTP route — host without http(s):// and trailing /',
      },
      btpPluginBranch: {
        type: 'string',
        description: '(btp-plugin / all only) git branch to clone the BTP plugin from (default: main)',
      },
      to: {
        type: 'string',
        description: 'Target directory for setup artifacts (default: OS temp directory)',
      },
    },
    handler: setupHandler,
  },
};

export const metadata = {
  name: 'c8ctl-plugin-csap-cli',
  description: 'Set up Camunda SAP integration modules',
  commands: {
    'csap-setup': {
      description: 'Set up Camunda SAP integration modules interactively',
      helpDescription:
        'Prepares one or more of Camunda\'s SAP integration modules for deployment:\n' +
        '  • OData connector — interact with S/4HANA or ECC from a BPMN model\n' +
        '  • RFC connector — query BAPIs & Remote Function Modules on SAP ECC\n' +
        '  • BTP plugin (deprecated) — render task forms in Fiori, provide BTP integration\n\n' +
        'Credentials are read from --clusterId / --region / --clientId / --clientSecret flags,\n' +
        'from CAMUNDA_CLUSTER_ID / CAMUNDA_CLUSTER_REGION / CAMUNDA_CLIENT_ID / CAMUNDA_CLIENT_SECRET\n' +
        'environment variables, or prompted interactively.\n\n' +
        'A GitHub token in GH_TOKEN is recommended to avoid API rate limiting.',
      examples: [
        {
          command: 'c8ctl csap-setup --for odata --camunda 8.7',
          description: 'Set up OData connector for Camunda 8.7 interactively',
        },
        {
          command: 'c8ctl csap-setup --for rfc --camunda 8.9 --deployment SaaS --clusterId abc --region bru-2 --clientId id --clientSecret sec',
          description: 'Non-interactive RFC connector setup with all flags',
        },
        {
          command: 'c8ctl csap-setup --for btp-plugin --camunda 8.8 --btpRoute my-app.cfapps.eu10.hana.ondemand.com',
          description: 'Set up BTP plugin for Camunda 8.8',
        },
        {
          command: 'c8ctl csap-setup --for all --camunda 8.9',
          description: 'Set up all SAP integration modules for Camunda 8.9',
        },
      ],
    },
  },
};
