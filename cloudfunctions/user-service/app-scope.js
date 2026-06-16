const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;

const { YOUMI_APP_ID } = require('./app-config');

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

module.exports = {
  scopeFilter,
  docInScope
};
