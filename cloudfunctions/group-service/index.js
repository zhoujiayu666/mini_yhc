const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function isFourDigitPassword(password) {
  return /^\d{4}$/.test(password || '');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  try {
    switch (action) {
      case 'createGroup':
        return await createGroup(openid, event);
      case 'joinGroup':
        return await joinGroup(openid, event);
      case 'listGroups':
        return await listGroups(openid);
      case 'applyControl':
        return await applyControl(openid, event);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('group-service error:', error);
    return {
      success: false,
      message: error.message || '服务异常'
    };
  }
};

async function createGroup(openid, payload) {
  const name = (payload.name || '').trim();
  const groupId = (payload.groupId || '').trim();
  const password = (payload.password || '').trim();

  if (!name || !groupId || !password) {
    return { success: false, message: '请完整填写信息' };
  }
  if (!isFourDigitPassword(password)) {
    return { success: false, message: '密码需为4位数字' };
  }

  const exists = await db.collection('groups').where({ groupId }).limit(1).get();
  if (exists.data.length > 0) {
    return { success: false, message: '群组ID已存在' };
  }

  const now = Date.now();
  await db.collection('groups').add({
    data: {
      groupId,
      name,
      password,
      adminOpenid: openid,
      controlState: { effect: '常亮', brightness: 80 },
      createdAt: now,
      updatedAt: now
    }
  });

  await db.collection('group_members').add({
    data: {
      groupId,
      openid,
      nickname: '管理员',
      role: 'admin',
      effect: '常亮',
      brightness: 100,
      joinedAt: now
    }
  });

  return { success: true, message: '群组创建成功' };
}

async function joinGroup(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  const nickname = (payload.nickname || '').trim();
  const password = (payload.password || '').trim();

  if (!groupId || !nickname || !password) {
    return { success: false, message: '请完整填写信息' };
  }
  if (!isFourDigitPassword(password)) {
    return { success: false, message: '密码需为4位数字' };
  }

  const groupsRes = await db.collection('groups').where({ groupId }).limit(1).get();
  if (groupsRes.data.length === 0) {
    return { success: false, message: '群组不存在' };
  }

  const group = groupsRes.data[0];
  if (group.password !== password) {
    return { success: false, message: '密码错误' };
  }

  const memberExists = await db.collection('group_members').where({
    groupId,
    nickname
  }).limit(1).get();
  if (memberExists.data.length > 0) {
    return { success: false, message: '昵称已被占用' };
  }

  const selfExists = await db.collection('group_members').where({
    groupId,
    openid
  }).limit(1).get();
  if (selfExists.data.length === 0) {
    await db.collection('group_members').add({
      data: {
        groupId,
        openid,
        nickname,
        role: 'member',
        effect: group.controlState.effect,
        brightness: group.controlState.brightness,
        joinedAt: Date.now()
      }
    });
  }

  return { success: true, message: '已加入群组' };
}

async function listGroups(openid) {
  const memberships = await db.collection('group_members').where({ openid }).get();
  if (memberships.data.length === 0) {
    return { success: true, groups: [], activeGroupId: '' };
  }

  const groupIds = memberships.data.map((m) => m.groupId);
  const groupsRes = await db.collection('groups').where({
    groupId: _.in(groupIds)
  }).get();

  const allMembersRes = await db.collection('group_members').where({
    groupId: _.in(groupIds)
  }).get();

  const memberMap = {};
  allMembersRes.data.forEach((m) => {
    if (!memberMap[m.groupId]) {
      memberMap[m.groupId] = [];
    }
    memberMap[m.groupId].push({
      nickname: m.nickname,
      role: m.role,
      effect: m.effect,
      brightness: m.brightness,
      openid: m.openid
    });
  });

  const selfRoleMap = {};
  memberships.data.forEach((m) => {
    selfRoleMap[m.groupId] = { role: m.role, nickname: m.nickname };
  });

  const groups = groupsRes.data.map((g) => ({
    id: g.groupId,
    name: g.name,
    controlState: g.controlState,
    members: memberMap[g.groupId] || [],
    activeUserRole: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].role : '',
    activeUserNickname: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].nickname : ''
  }));

  return { success: true, groups, activeGroupId: groups[0] ? groups[0].id : '' };
}

async function applyControl(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  const effect = (payload.effect || '').trim();
  const brightness = Number(payload.brightness || 0);

  if (!groupId || !effect || brightness < 1 || brightness > 100) {
    return { success: false, message: '控制参数无效' };
  }

  const roleRes = await db.collection('group_members').where({
    groupId,
    openid
  }).limit(1).get();
  if (roleRes.data.length === 0 || roleRes.data[0].role !== 'admin') {
    return { success: false, message: '当前用户不是管理员' };
  }

  await db.collection('groups').where({ groupId }).update({
    data: {
      controlState: { effect, brightness },
      updatedAt: Date.now()
    }
  });

  await db.collection('group_members').where({
    groupId,
    role: 'member'
  }).update({
    data: {
      effect,
      brightness
    }
  });

  return { success: true, message: '已统一下发灯光效果' };
}
