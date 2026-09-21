/* AURELION 时光 · 农历与节假日引擎
   数据：公开农历信息表（1900-2100，201 项，紫金山天文台历表换算的通用数据）
   算法：本项目原生实现；放假/调休表按国务院历年通知整理，2026 年为公开预告，可按通知更新 */
window.LUNAR = (() => {
"use strict";

/* ---------- 农历信息表：每年 16 位 = 闰月(低4位) + 12/13 个月大小位 + 闰月大小位 ---------- */
const INFO = [
0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2, /* 1900-1909 */
0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977, /* 1910-1919 */
0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970, /* 1920-1929 */
0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950, /* 1930-1939 */
0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557, /* 1940-1949 */
0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0, /* 1950-1959 */
0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0, /* 1960-1969 */
0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6, /* 1970-1979 */
0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570, /* 1980-1989 */
0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0, /* 1990-1999 */
0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5, /* 2000-2009 */
0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930, /* 2010-2019 */
0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530, /* 2020-2029 */
0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45, /* 2030-2039 */
0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0, /* 2040-2049 */
0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0, /* 2050-2059 */
0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4, /* 2060-2069 */
0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0, /* 2070-2079 */
0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160, /* 2080-2089 */
0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252, /* 2090-2099 */
0x0d520                                                                          /* 2100 */
];

const leapMonth = (y) => INFO[y - 1900] & 0xf;
const leapDays = (y) => (leapMonth(y) ? ((INFO[y - 1900] & 0x10000) ? 30 : 29) : 0);
const monthDays = (y, m) => ((INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29);
function yearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (INFO[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}

/* ---------- 公历 → 农历 ---------- */
const MCN = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const DNUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ZODIAC = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
function dayCn(d) {
  if (d === 10) return "初十";
  if (d === 20) return "二十";
  if (d === 30) return "三十";
  if (d < 10) return "初" + DNUM[d - 1];
  if (d < 20) return "十" + DNUM[d - 11];
  return "廿" + DNUM[d - 21];
}
function solarToLunar(dt) {
  const y = dt.getFullYear(), mo = dt.getMonth() + 1, d = dt.getDate();
  if (y < 1900 || y > 2100) return null;
  let rest = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
  if (rest < 0) return null;
  let ly = 1900;
  for (; ly < 2100; ly++) {
    const dy = yearDays(ly);
    if (rest < dy) break;
    rest -= dy;
  }
  const leap = leapMonth(ly);
  let lm = 1, leapDone = false, isLeapBreak = false;
  for (;;) {
    let days, isLeapIter = false;
    if (!leapDone && leap > 0 && lm === leap + 1) { days = leapDays(ly); isLeapIter = true; }
    else days = monthDays(ly, lm);
    if (rest < days) { isLeapBreak = isLeapIter; break; }
    rest -= days;
    if (isLeapIter) leapDone = true; /* 闰 X 月插在 X 月之后，月号不推进 */
    else { lm++; if (lm > 12) { lm = 12; break; } }
  }
  const mShown = isLeapBreak ? leap : lm;
  const gz = GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12];
  return {
    lY: ly,
    lM: mShown,
    lD: rest + 1,
    isLeap: isLeapBreak,
    mCn: (isLeapBreak ? "闰" : "") + MCN[mShown - 1] + "月",
    dCn: dayCn(rest + 1),
    gzYear: gz,
    zodiac: ZODIAC[(ly - 4) % 12],
  };
}

/* ---------- 传统节日（农历） ---------- */
const LUNAR_FESTS = { "1-1": "春节", "1-15": "元宵节", "2-2": "龙抬头", "5-5": "端午节", "7-7": "七夕节", "8-15": "中秋节", "9-9": "重阳节", "12-8": "腊八节" };

/* ---------- 公历节日 ---------- */
const SOLAR_FESTS = { "1-1": "元旦", "2-14": "情人节", "3-8": "妇女节", "3-12": "植树节", "5-1": "劳动节", "5-4": "青年节", "6-1": "儿童节", "7-1": "建党节", "8-1": "建军节", "9-10": "教师节", "10-1": "国庆节", "12-24": "平安夜", "12-25": "圣诞节" };

/* ---------- 清明（节气日，公式法） ---------- */
function qingmingDay(y) {
  if (y < 1900 || y > 2099) return 5;
  const yy = y % 100;
  return Math.floor(yy * 0.2422 + 4.81 - Math.floor(yy / 4)) || 5;
}

/* ---------- 法定假日/调休表（年份区间 key: MM-DD）----------
   ※ 2026 年为公开预告整理，如国务院通知有调整，直接修改本表即可 ---------- */
const VACATIONS = [
  { name: "元旦", y: 2025, from: "01-01", to: "01-01", work: [] },
  { name: "春节", y: 2025, from: "01-28", to: "02-04", work: ["01-26", "02-08"] },
  { name: "清明节", y: 2025, from: "04-04", to: "04-06", work: [] },
  { name: "劳动节", y: 2025, from: "05-01", to: "05-05", work: ["04-27"] },
  { name: "端午节", y: 2025, from: "05-31", to: "06-02", work: [] },
  { name: "国庆节·中秋节", y: 2025, from: "10-01", to: "10-08", work: ["09-28", "10-11"] },
  { name: "元旦", y: 2026, from: "01-01", to: "01-03", work: [] },
  { name: "春节", y: 2026, from: "02-15", to: "02-22", work: ["02-07", "02-28"] },
  { name: "清明节", y: 2026, from: "04-04", to: "04-06", work: [] },
  { name: "劳动节", y: 2026, from: "05-01", to: "05-05", work: ["04-26"] },
  { name: "端午节", y: 2026, from: "06-19", to: "06-21", work: [] },
  { name: "中秋节", y: 2026, from: "09-25", to: "09-27", work: [] },
  { name: "国庆节", y: 2026, from: "10-01", to: "10-07", work: ["10-10"] },
];
const p2 = (n) => String(n).padStart(2, "0");
const dayDiff = (a, b) => Math.round((Date.parse(b.getFullYear() + "-" + p2(b.getMonth() + 1) + "-" + p2(b.getDate())) -
  Date.parse(a.getFullYear() + "-" + p2(a.getMonth() + 1) + "-" + p2(a.getDate()))) / 86400000);

/* ---------- 法定假日兜底（表未收录的年份，2027-2100）----------
   按法定基准日自动生成：元旦/春节（除夕+初一至初三）/清明/劳动/端午/中秋/国庆（10-01~10-03），
   未含周末挪假与调休（国务院通知公布后请把该年数据补进上方 VACATIONS 表） */
const _genericVacCache = new Map();
function genericVacations(y) {
  if (y < 2027 || y > 2100) return null;
  if (_genericVacCache.has(y)) return _genericVacCache.get(y);
  const list = [];
  const add = (name, from, to) => { if (from && to) list.push({ name, y, from, to, work: [], generic: true }); };
  const fmt = (d) => d ? p2(d.getMonth() + 1) + "-" + p2(d.getDate()) : null;
  add("元旦", "01-01", "01-01");
  add("清明节", "04-" + p2(qingmingDay(y)), "04-" + p2(qingmingDay(y)));
  add("劳动节", "05-01", "05-01");
  add("国庆节", "10-01", "10-03");
  /* 农历节日日期：全年扫描正月初一 / 五月初五 / 八月十五 */
  let cny = null, duanwu = null, zhongqiu = null;
  for (let i = 0; i < 366; i++) {
    const d = new Date(y, 0, 1 + i);
    if (d.getFullYear() !== y) break;
    const l = solarToLunar(d);
    if (!l || l.isLeap) continue;
    if (!cny && l.lM === 1 && l.lD === 1) cny = d;
    if (!duanwu && l.lM === 5 && l.lD === 5) duanwu = d;
    if (!zhongqiu && l.lM === 8 && l.lD === 15) zhongqiu = d;
    if (cny && duanwu && zhongqiu) break;
  }
  if (cny) add("春节", fmt(new Date(cny.getTime() - 86400000)), fmt(new Date(cny.getTime() + 2 * 86400000))); /* 除夕+初一~初三 */
  add("端午节", fmt(duanwu), fmt(duanwu));
  add("中秋节", fmt(zhongqiu), fmt(zhongqiu));
  _genericVacCache.set(y, list);
  return list;
}
function vacTableFor(y) {
  return VACATIONS.concat(genericVacations(y) || []);
}

function vacState(dt) {
  const key = p2(dt.getMonth() + 1) + "-" + p2(dt.getDate());
  const y = dt.getFullYear();
  for (const v of vacTableFor(y)) {
    if (v.y !== y) continue;
    if (v.work.indexOf(key) >= 0) return { kind: "work", name: v.name };
    if (key >= v.from && key <= v.to) {
      const from = new Date(y, parseInt(v.from.slice(0, 2), 10) - 1, parseInt(v.from.slice(3), 10));
      const to = new Date(y, parseInt(v.to.slice(0, 2), 10) - 1, parseInt(v.to.slice(3), 10));
      return { kind: "off", name: v.name, dayN: dayDiff(from, dt) + 1, total: dayDiff(from, to) + 1, generic: !!v.generic };
    }
  }
  return null;
}

/* ---------- 节日判定：法定 > 农历传统节日（含除夕）> 公历节日 > 清明 ---------- */
function festOf(dt) {
  const vac = vacState(dt);
  if (vac && vac.kind === "work") return vac.name + "补班";
  const l = solarToLunar(dt);
  if (!l) return vac ? vac.name : null;
  const lkey = l.lM + "-" + l.lD;
  let name = (l.isLeap ? null : LUNAR_FESTS[lkey]) || null;
  if (!name && l.lM === 12 && !l.isLeap) {
    const nx = solarToLunar(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1));
    if (nx && nx.lY === l.lY + 1 && nx.lM === 1 && nx.lD === 1) name = "除夕";
  }
  if (!name) {
    const skey = p2(dt.getMonth() + 1) + "-" + p2(dt.getDate());
    name = SOLAR_FESTS[skey] || null;
  }
  if (!name && dt.getMonth() === 3 && dt.getDate() === qingmingDay(dt.getFullYear())) name = "清明节";
  if (vac && vac.kind === "off") {
    if (name && name !== vac.name && vac.name.indexOf(name) < 0) return name + "（" + vac.name + "假期第 " + vac.dayN + " 天）";
    return vac.name + (vac.total > 1 ? "假期第 " + vac.dayN + " 天" : "");
  }
  return name;
}

/* ---------- 聚合描述 ---------- */
function describe(dt) {
  const l = solarToLunar(dt);
  return { lunar: l, vac: vacState(dt), fest: festOf(dt) };
}

/* ---------- 未来节假日预告（供抽屉展示） ---------- */
function nextVacation(dt, maxDays) {
  const N = maxDays || 120;
  for (let i = 0; i <= N; i++) {
    const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + i);
    const v = vacState(d);
    if (v && v.kind === "off") {
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      let start = null;
      const yy = d.getFullYear();
      for (const v2 of vacTableFor(yy)) {
        if (v2.y === yy && v2.name === v.name) {
          start = new Date(yy, parseInt(v2.from.slice(0, 2), 10) - 1, parseInt(v2.from.slice(3), 10));
          break;
        }
      }
      const left = dayDiff(dt, from);
      return { name: v.name, from, total: v.total, left: Math.max(0, left), today: i === 0, generic: !!v.generic };
    }
  }
  return null;
}

return { solarToLunar, festOf, vacState, describe, nextVacation };
})();
