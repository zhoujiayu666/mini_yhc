const path = require('node:path');
const { createRequire } = require('node:module');
const PROJECT = process.env.TOPUYI_MINI_PROJECT || 'D:/Project/mini/mini_topuyi';
const ENV = 'cloud1-d4grfezxdaca540d6';
const COLLECTION = 'topuyi_home_preview_v1';
const FUNCTION = 'topuyi-home-preview-v1';
const PREFIX = 'topuyi/home-preview/v1/';
async function connect() {
  const req = createRequire(path.join(PROJECT, 'package.json'));
  const { checkAndGetCredential } = req('@cloudbase/toolbox');
  const credential = await checkAndGetCredential({ cwd: PROJECT });
  if (!credential) throw new Error('CLOUD_LOGIN_REQUIRED');
  const app = req('@cloudbase/node-sdk').init({ env: ENV, secretId: credential.secretId, secretKey: credential.secretKey, sessionToken: credential.token });
  return app;
}
module.exports = { connect, ENV, COLLECTION, FUNCTION, PREFIX };
