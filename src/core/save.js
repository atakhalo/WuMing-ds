// 存档：localStorage 持久化

const SAVE_KEY = 'wumingjian_save_v1';
const META_KEY = 'wumingjian_meta_v1';

export function loadRaw() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.warn('存档读取失败', e);
    return null;
  }
}

export function writeRaw(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('存档写入失败', e);
    return false;
  }
}

export function clearRaw() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}

// 记录局外累计数据（死亡次数、最远层数等）
export function loadMeta() {
  try {
    const s = localStorage.getItem(META_KEY);
    return s ? JSON.parse(s) : { runs: 0, deaths: 0, bestFloor: 0 };
  } catch (e) {
    return { runs: 0, deaths: 0, bestFloor: 0 };
  }
}

export function writeMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (e) { /* ignore */ }
}
