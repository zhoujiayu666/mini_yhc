const PROVINCES = [
  ['内蒙古自治区', '内蒙古'],
  ['广西壮族自治区', '广西'],
  ['西藏自治区', '西藏'],
  ['宁夏回族自治区', '宁夏'],
  ['新疆维吾尔自治区', '新疆'],
  ['香港特别行政区', '香港'],
  ['澳门特别行政区', '澳门'],
  ['黑龙江省', '黑龙江'],
  ['北京市', '北京'],
  ['天津市', '天津'],
  ['上海市', '上海'],
  ['重庆市', '重庆'],
  ['河北省', '河北'],
  ['山西省', '山西'],
  ['辽宁省', '辽宁'],
  ['吉林省', '吉林'],
  ['江苏省', '江苏'],
  ['浙江省', '浙江'],
  ['安徽省', '安徽'],
  ['福建省', '福建'],
  ['江西省', '江西'],
  ['山东省', '山东'],
  ['河南省', '河南'],
  ['湖北省', '湖北'],
  ['湖南省', '湖南'],
  ['广东省', '广东'],
  ['海南省', '海南'],
  ['四川省', '四川'],
  ['贵州省', '贵州'],
  ['云南省', '云南'],
  ['陕西省', '陕西'],
  ['甘肃省', '甘肃'],
  ['青海省', '青海'],
  ['台湾省', '台湾']
];
const MUNICIPALITIES = new Set(['北京市', '天津市', '上海市', '重庆市']);

function compact(text) {
  return String(text || '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[，,;；|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickPhone(text) {
  const m = text.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/);
  return m ? m[1] : '';
}

function pickProvince(text) {
  for (const [full, short] of PROVINCES) {
    if (text.includes(full)) return { full, index: text.indexOf(full), length: full.length };
    const idx = text.indexOf(short);
    if (idx >= 0) {
      const after = text.slice(idx + short.length, idx + short.length + 1);
      if (after === '省' || after === '市') return { full, index: idx, length: short.length + (after === '省' || after === '市' ? 1 : 0) };
      if ('省市自治区'.indexOf(after) < 0) return { full, index: idx, length: short.length };
    }
  }
  return null;
}

function takeMatch(text, re) {
  const m = text.match(re);
  return m ? m[0] : '';
}

function pickName(text, phone, addressPart) {
  const cleaned = compact(text.replace(phone, ' '));
  const labeled = cleaned.match(/(?:收货人|联系人|姓名)[:：\s]*([\u4e00-\u9fa5]{2,4})/);
  if (labeled) return labeled[1];
  const tokens = cleaned.split(' ').filter(Boolean);
  const isName = (t) => /^[\u4e00-\u9fa5]{2,4}$/.test(t) && !/省|市|区|县|旗|镇|乡|街道|路|号/.test(t);
  const before = tokens.find(isName);
  if (before && (!addressPart || !addressPart.includes(before))) return before;
  const leftover = compact(cleaned.replace(addressPart || '', ' '));
  const leftoverName = leftover.split(' ').find(isName);
  return leftoverName || '';
}

function parseAddress(raw) {
  const text = compact(raw);
  if (!text) return {};
  const phone = pickPhone(text);
  const provinceHit = pickProvince(text);
  let province = '';
  let city = '';
  let district = '';
  let detail = '';
  let rest = text.replace(phone, ' ');

  if (provinceHit) {
    province = provinceHit.full;
    rest = compact(text.slice(provinceHit.index + provinceHit.length).replace(phone, ' '));
    if (MUNICIPALITIES.has(province)) {
      city = province;
      district = takeMatch(rest, /^[\u4e00-\u9fa5]{1,8}(?:区|县)/);
      detail = compact(district ? rest.slice(district.length) : rest);
    } else {
      city = takeMatch(rest, /^[\u4e00-\u9fa5]{1,10}(?:市|州|盟)/);
      const afterCity = city ? rest.slice(city.length) : rest;
      district = takeMatch(afterCity, /^[\u4e00-\u9fa5]{1,8}(?:区|县)/);
      detail = compact(district ? afterCity.slice(district.length) : afterCity);
    }
  } else {
    city = takeMatch(rest, /[\u4e00-\u9fa5]{1,10}(?:市|州|盟)/);
    const idx = city ? rest.indexOf(city) : -1;
    const afterCity = idx >= 0 ? rest.slice(idx + city.length) : rest;
    district = takeMatch(afterCity, /^[\u4e00-\u9fa5]{1,8}(?:区|县)/);
    detail = compact(district ? afterCity.slice(district.length) : afterCity);
  }

  detail = detail.replace(/^(?:地址|详细地址)[:：\s]*/, '');
  const name = pickName(text, phone, [province, city, district, detail].join(''));
  if (name) detail = compact(detail.replace(name, ' '));
  if (phone) detail = compact(detail.replace(phone, ' '));

  return { name, phone, province, city, district, detail };
}

module.exports = { parseAddress };
