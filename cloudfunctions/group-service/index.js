const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ADMIN_ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

function isFourDigitPassword(password) {
  return /^\d{4}$/.test(password || '');
}

function isNumericGroupId(v) {
  return /^\d+$/.test(String(v || ''));
}

/** 与 color-wheel 一致：色相 0–359°，饱和度 0–100 */
function clampHue(n, fallback = 0) {
  if (n === undefined || n === null || n === '') {
    return fallback;
  }
  const h = Math.round(Number(n));
  if (!Number.isFinite(h)) {
    return fallback;
  }
  return ((h % 360) + 360) % 360;
}

function clampSat(n, fallback = 100) {
  if (n === undefined || n === null || n === '') {
    return fallback;
  }
  const s = Math.round(Number(n));
  if (!Number.isFinite(s)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, s));
}

function resolveHueSat(payload, prevState) {
  const prev = prevState || {};
  const prevHue = typeof prev.hue === 'number' ? clampHue(prev.hue, 0) : 0;
  const prevSat = typeof prev.saturation === 'number' ? clampSat(prev.saturation, 100) : 100;
  const hue =
    payload.hue !== undefined && payload.hue !== null && payload.hue !== ''
      ? clampHue(payload.hue, prevHue)
      : prevHue;
  const saturation =
    payload.saturation !== undefined && payload.saturation !== null && payload.saturation !== ''
      ? clampSat(payload.saturation, prevSat)
      : prevSat;
  return { hue, saturation };
}

function isDynamicLoopEffect(effect) {
  return effect === '聚会' || effect === '彩虹' || effect === '星空';
}

function normalizeStepMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return 200;
  }
  return Math.min(1000, Math.max(100, Math.round(n)));
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
      case 'adminDetailPresence':
        return await adminDetailPresence(openid, event);
      case 'dismissGroup':
        return await dismissGroup(openid, event);
      case 'leaveGroup':
        return await leaveGroup(openid, event);
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
  const needPassword = payload.needPassword !== false;

  if (!name || !groupId) {
    return { success: false, message: '请完整填写信息' };
  }
  if (!isNumericGroupId(groupId)) {
    return { success: false, message: '群组ID仅支持数字' };
  }
  if (needPassword && !isFourDigitPassword(password)) {
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
      password: needPassword ? password : '',
      needPassword,
      adminOpenid: openid,
      controlState: {
        effect: '常亮',
        brightness: 80,
        hue: 0,
        saturation: 100,
        dispatchId: 0,
        syncSeed: null,
        syncStartAt: null,
        syncStepMs: null
      },
      adminInDetailAt: 0,
      lastAdminActiveAt: now,
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
      hue: 0,
      saturation: 100,
      joinedAt: now
    }
  });

  return { success: true, message: '群组创建成功' };
}

async function joinGroup(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  const nicknameInput = (payload.nickname || '').trim();
  const password = (payload.password || '').trim();

  if (!groupId) {
    return { success: false, message: '请填写群组ID' };
  }

  const groupsRes = await db.collection('groups').where({ groupId }).limit(1).get();
  if (groupsRes.data.length === 0) {
    return { success: false, message: '群组不存在' };
  }

  const group = groupsRes.data[0];
  const needPassword = group.needPassword !== false;
  if (needPassword) {
    if (!isFourDigitPassword(password)) {
      return { success: false, message: '密码需为4位数字' };
    }
  }
  if (needPassword && group.password !== password) {
    return { success: false, message: '密码错误' };
  }
  const selfExists = await db.collection('group_members').where({
    groupId,
    openid
  }).limit(1).get();

  let nickname = nicknameInput;
  if (!nickname) {
    let trial = `成员${openid.slice(-4)}`;
    for (let i = 0; i < 5; i += 1) {
      const exists = await db.collection('group_members').where({ groupId, nickname: trial }).limit(1).get();
      if (exists.data.length === 0) {
        nickname = trial;
        break;
      }
      trial = `成员${openid.slice(-4)}${Math.floor(Math.random() * 10)}`;
    }
    if (!nickname) {
      nickname = `成员${Date.now() % 10000}`;
    }
  } else {
    const memberExists = await db.collection('group_members').where({
      groupId,
      nickname
    }).limit(1).get();
    if (memberExists.data.length > 0) {
      return { success: false, message: '昵称已被占用' };
    }
  }

  if (selfExists.data.length === 0) {
    const cs = group.controlState || {};
    await db.collection('group_members').add({
      data: {
        groupId,
        openid,
        nickname,
        role: 'member',
        effect: cs.effect,
        brightness: cs.brightness,
        hue: typeof cs.hue === 'number' ? clampHue(cs.hue, 0) : 0,
        saturation: typeof cs.saturation === 'number' ? clampSat(cs.saturation, 100) : 100,
        joinedAt: Date.now()
      }
    });
  }

  return { success: true, message: '已加入群组' };
}

async function listGroups(openid) {
  const memberships = await db.collection('group_members').where({ openid }).get();
  const groupIds = memberships.data.map((m) => m.groupId);
  const allGroupsRes = await db.collection('groups').get();

  const mineGroupsRes = groupIds.length > 0
    ? await db.collection('groups').where({ groupId: _.in(groupIds) }).get()
    : { data: [] };
  const mineMembersRes = groupIds.length > 0
    ? await db.collection('group_members').where({ groupId: _.in(groupIds) }).get()
    : { data: [] };
  const allMembersRes = await db.collection('group_members').get();

  const memberMap = {};
  mineMembersRes.data.forEach((m) => {
    if (!memberMap[m.groupId]) {
      memberMap[m.groupId] = [];
    }
    memberMap[m.groupId].push({
      nickname: m.nickname,
      role: m.role,
      effect: m.effect,
      brightness: m.brightness,
      hue: m.hue,
      saturation: m.saturation,
      openid: m.openid
    });
  });

  const selfRoleMap = {};
  memberships.data.forEach((m) => {
    selfRoleMap[m.groupId] = { role: m.role, nickname: m.nickname };
  });

  const now = Date.now();
  /** 管理员「在线」判定：心跳8s 一次，适当放宽避免成员端偶发拉取间隔导致误判 */
  const presenceTtlMs = 60000;

  const mineGroups = mineGroupsRes.data.map((g) => {
    const at = g.adminInDetailAt || 0;
    return {
      id: g.groupId,
      name: g.name,
      controlState: g.controlState,
      needPassword: g.needPassword !== false,
      members: memberMap[g.groupId] || [],
      memberCount: (memberMap[g.groupId] || []).length,
      activeUserRole: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].role : '',
      activeUserNickname: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].nickname : '',
      adminIsInGroupDetail: !!(at && now - at < presenceTtlMs)
    };
  });

  const memberCountMap = {};
  allMembersRes.data.forEach((m) => {
    memberCountMap[m.groupId] = (memberCountMap[m.groupId] || 0) + 1;
  });
  const activeThreshold = now - ADMIN_ACTIVE_WINDOW_MS;
  const allGroups = allGroupsRes.data
    .filter((g) => {
      const lastAdminActiveAt = Number(g.lastAdminActiveAt || g.updatedAt || 0);
      return lastAdminActiveAt >= activeThreshold;
    })
    .map((g) => {
      const at = g.adminInDetailAt || 0;
      return {
        id: g.groupId,
        name: g.name,
        controlState: g.controlState,
        needPassword: g.needPassword !== false,
        memberCount: memberCountMap[g.groupId] || 0,
        activeUserRole: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].role : '',
        activeUserNickname: selfRoleMap[g.groupId] ? selfRoleMap[g.groupId].nickname : '',
        adminIsInGroupDetail: !!(at && now - at < presenceTtlMs)
      };
    });

  return {
    success: true,
    mineGroups,
    allGroups,
    activeGroupId: mineGroups[0] ? mineGroups[0].id : ''
  };
}

async function adminDetailPresence(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  const inDetail = !!payload.inDetail;

  if (!groupId) {
    return { success: false, message: '参数无效' };
  }

  const roleRes = await db.collection('group_members').where({ groupId, openid }).limit(1).get();
  if (roleRes.data.length === 0 || roleRes.data[0].role !== 'admin') {
    return { success: false, message: '仅管理员可上报' };
  }

  const ts = Date.now();
  const data = inDetail
    ? { adminInDetailAt: ts, lastAdminActiveAt: ts, updatedAt: ts }
    : { adminInDetailAt: 0, updatedAt: ts };
  await db.collection('groups').where({ groupId }).update({ data });

  return { success: true, message: inDetail ? '已进入' : '已离开' };
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

  const groupDoc = await db.collection('groups').where({ groupId }).limit(1).get();
  if (groupDoc.data.length === 0) {
    return { success: false, message: '群组不存在' };
  }
  const { hue, saturation } = resolveHueSat(payload, groupDoc.data[0].controlState);
  const dispatchIdRaw = Number(payload.dispatchId);
  const dispatchId = Number.isFinite(dispatchIdRaw) && dispatchIdRaw > 0 ? dispatchIdRaw : Date.now();
  const ts = Date.now();
  const isDyn = isDynamicLoopEffect(effect);
  /** 平铺字段，避免部分环境下嵌套对象写入触发校验/写入失败（如 -502001） */
  const syncSeed = isDyn
    ? Number.isFinite(Number(payload.seed))
      ? (Math.round(Number(payload.seed)) % 256 + 256) % 256
      : Math.floor(Math.random() * 256)
    : null;
  const syncStartAt = isDyn ? ts : null;
  const syncStepMs = isDyn ? normalizeStepMs(payload.stepMs) : null;

  await db.collection('groups').where({ groupId }).update({
    data: {
      controlState: {
        effect,
        brightness,
        hue,
        saturation,
        dispatchId,
        syncSeed,
        syncStartAt,
        syncStepMs
      },
      /** 统一下发成功即视为管理员正在操作本群，成员端可显示「正在本群组页面」 */
      adminInDetailAt: ts,
      lastAdminActiveAt: ts,
      updatedAt: ts
    }
  });

  await db.collection('group_members').where({
    groupId
  }).update({
    data: {
      effect,
      brightness,
      hue,
      saturation
    }
  });

  return { success: true, message: '已统一下发灯光效果' };
}

async function dismissGroup(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  if (!groupId) {
    return { success: false, message: '参数无效' };
  }

  const roleRes = await db.collection('group_members').where({
    groupId,
    openid
  }).limit(1).get();
  if (roleRes.data.length === 0 || roleRes.data[0].role !== 'admin') {
    return { success: false, message: '仅管理员可解散群组' };
  }

  await db.collection('groups').where({ groupId }).remove();
  await db.collection('group_members').where({ groupId }).remove();
  return { success: true, message: '群组已解散' };
}

async function leaveGroup(openid, payload) {
  const groupId = (payload.groupId || '').trim();
  if (!groupId) {
    return { success: false, message: '参数无效' };
  }

  const roleRes = await db.collection('group_members').where({
    groupId,
    openid
  }).limit(1).get();
  if (roleRes.data.length === 0) {
    return { success: true, message: '已退出群组' };
  }
  if (roleRes.data[0].role === 'admin') {
    return { success: false, message: '管理员请使用解散群组' };
  }

  await db.collection('group_members').where({ groupId, openid }).remove();
  return { success: true, message: '已退出群组' };
}
