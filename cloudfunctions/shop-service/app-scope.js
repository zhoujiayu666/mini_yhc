const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;

function scopeFilter(appId) {
  if (!appId) {
    return { sourceAppId: '__invalid__' };
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
  return doc.sourceAppId === appId;
}

module.exports = {
  scopeFilter,
  withScope,
  docInScope
};
