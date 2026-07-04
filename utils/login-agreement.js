/**
 * 登录前协议勾选与打开协议
 */

function ensureAgreed(agreed) {
  if (agreed) return true;
  wx.showToast({ title: '请先阅读并同意相关协议', icon: 'none' });
  return false;
}

function openPrivacyPolicy() {
  if (wx.openPrivacyContract) {
    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({ title: '暂时无法打开隐私政策', icon: 'none' });
      }
    });
    return;
  }
  wx.showToast({ title: '请升级微信后查看隐私政策', icon: 'none' });
}

function openUserAgreement() {
  wx.navigateTo({ url: '/pages/user-agreement/user-agreement' });
}

module.exports = {
  ensureAgreed,
  openPrivacyPolicy,
  openUserAgreement
};
