/**
 * 通过 CloudBase 已登录凭据创建 products 数据模型
 * 用法：node scripts/create-products-model.js
 */
const fs = require('fs');
const path = require('path');
const { CloudApiService } = require('@cloudbase/cloud-api');
const { checkAndGetCredential } = require('@cloudbase/toolbox');

const ENV_ID = 'cloud1-d4grfezxdaca540d6';
const MODEL_NAME = 'products';

async function main() {
  const credential = await checkAndGetCredential({ cwd: path.join(__dirname, '..') });
  if (!credential) {
    throw new Error('未登录，请先执行 tcb.cmd login');
  }

  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'database-schemas', `${MODEL_NAME}.json`), 'utf8')
  );

  const lowCodeService = new CloudApiService({
    service: 'lowcode',
    version: '2021-01-08',
    getCredential: async () => credential
  });

  const existing = await lowCodeService.request('DescribeDataSourceList', {
    EnvId: ENV_ID,
    PageSize: 10,
    PageIndex: 1,
    DataSourceNames: [MODEL_NAME]
  }).catch(() => null);

  const list = existing?.Data?.Rows || existing?.Rows || [];
  if (list.some((row) => row.Name === MODEL_NAME)) {
    console.log(`数据模型 ${MODEL_NAME} 已存在，无需重复创建。`);
    return;
  }

  console.log(`正在创建数据模型 ${MODEL_NAME} ...`);
  const created = await lowCodeService.request('CreateDataSourceDetail', {
    EnvId: ENV_ID,
    Title: schema.title || '商品',
    Name: MODEL_NAME,
    Type: 'database',
    TableNameRule: 'only_name',
    Schema: JSON.stringify(schema)
  });

  const id = created?.Data?.Id || created?.Id;
  console.log('创建成功，模型 ID:', id);

  if (id) {
    console.log('正在发布模型...');
    await lowCodeService.request('BatchPublishDataSources', {
      EnvId: ENV_ID,
      DataSourceIds: [id]
    });
    console.log('发布成功。请到 云后台 → CMS 内容管理 → 商品 查看。');
  }
}

main().catch((err) => {
  console.error('失败:', err.message || err);
  if (err.requestId) console.error('RequestId:', err.requestId);
  process.exit(1);
});
