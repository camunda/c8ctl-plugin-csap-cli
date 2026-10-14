export const RESET  = '\x1b[0m';
export const BOLD   = '\x1b[1m';
export const CYAN   = '\x1b[36m';
export const GREEN  = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const RED    = '\x1b[31m';

export const SAP_MODULES = [
  { label: 'BTP plugin (deprecated)', value: 'btp-plugin', description: 'Render tasks forms in Fiori, provide BTP integration' },
  { label: 'OData connector', value: 'odata',      description: 'Interact with S/4HANA or ECC System from a BPMN model' },
  { label: 'RFC connector',   value: 'rfc',        description: 'Query BAPIs & Remote Function Modules on SAP ECC systems' },
  { label: 'All modules',     value: 'all',        description: 'Configure all modules' },
];

export const CAMUNDA_VERSIONS = [
  { label: '8.10', value: '8.10' },
  { label: '8.9', value: '8.9' },
  { label: '8.8', value: '8.8' },
];

export const DEPLOYMENT_OPTIONS = [
  { label: 'SaaS', value: 'SaaS' },
];

export const KIND = {
  odata: 'sap-connectors',
  rfc:   'sap-connectors',
  btp:   'sap-btp-plugin',
};

export const ALL_CAMUNDA_CREDENTIAL_KEYS = [
  'CAMUNDA_CLUSTER_ID',
  'CAMUNDA_CLIENT_ID',
  'CAMUNDA_CLIENT_SECRET',
  'CAMUNDA_CLUSTER_REGION',
];
