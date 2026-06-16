const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;

const { YOUMI_APP_ID } = require('./app-config');

/**
 * 当前小程序可见的数据范围：本 App 的 sourceAppId，或有米存量（无 sourceAppId 且当前为有米 App）。
 */
function scopeFilter(appId) {
  if (!appId) {
    return { sourceAppId: '__invalid__' };
  }
  if (YOUMI_APP_ID && appId === YOUMI_APP_ID) {
    return _.or([
      { sourceAppId: appId },
      { sourceAppId: _.exists(false) },
      { sourceAppId: '' },
      { sourceAppId: null }
    ]);
  }
  return { sourceAppId: appId };
}

function withScope(appId, extra) {
  return _.and([scopeFilter(appId), extra]);
}

function docInScope(doc, appId) {
  if (!doc || !appId) {
    return false;
  }
  const sid = doc.sourceAppId;
  if (sid === appId) {
    return true;
  }
  if (!sid && YOUMI_APP_ID && appId === YOUMI_APP_ID) {
    return true;
  }
  return false;
}

function filterDocsInScope(docs, appId) {
  return (docs || []).filter((d) => docInScope(d, appId));
}

module.exports = {
  scopeFilter,
  withScope,
  docInScope,
  filterDocsInScope
};
