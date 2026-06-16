const { requireLogin } = require('../../utils/auth.js');

Page({
  onShow() {
    requireLogin();
  }
});
