/**
 * 数据备份 / 导出
 *
 * 把 life_ben_v1 的全部数据（笔记/打卡/记账/分类/预算）+ 用户上传的本地图片
 * 打包成一个自包含的 JSON 文件，方便用户保存到微信文件传输助手/收藏。
 *
 * 设计原则：
 *   1. 自包含 — 图片转 base64 嵌入对应 note，重建时不需要外部文件
 *   2. 向前兼容 — 顶层带 version / appName / exportedAt，未来导入可识别
 *   3. 失败安全 — 单张图片读失败不影响整批；统计里记录 imageFailures
 *   4. 写入 fs 后再返回路径 — 用户能直接在「微信文件」里找到
 */

const repo = require('./repository');

const EXPORT_VERSION = 1;
const APP_NAME = 'life-ben';

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function formatStamp(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

/**
 * 读一张本地图片转 base64 dataURL。读不到返回 null（不让整批挂掉）。
 */
function readImageAsDataURL(filePath) {
  return new Promise((resolve) => {
    if (!filePath) return resolve(null);
    try {
      const fsm = wx.getFileSystemManager();
      // 微信的 readFile 不支持直接拿 base64，需要 arraybuffer 然后转
      fsm.readFile({
        filePath,
        success: (res) => {
          try {
            const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
            const mime =
              ext === 'png' ? 'image/png'
              : ext === 'gif' ? 'image/gif'
              : ext === 'webp' ? 'image/webp'
              : 'image/jpeg';
            // wx.arrayBufferToBase64 微信小程序原生支持
            const b64 = wx.arrayBufferToBase64(res.data);
            resolve(`data:${mime};base64,${b64}`);
          } catch (e) {
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * 收集所有需要打包的本地图片路径（去重）。目前来源：note.imagePath
 * 未来如果新增字段（如步骤配图 stepItems[i].imagePath），在这里追加
 */
function collectImagePaths(doc) {
  const set = new Set();
  for (const n of doc.notes || []) {
    if (n.imagePath) set.add(n.imagePath);
    if (Array.isArray(n.stepItems)) {
      for (const s of n.stepItems) {
        if (s && s.imagePath) set.add(s.imagePath);
      }
    }
  }
  return Array.from(set);
}

/**
 * 把图片打包到 note 上：note.imageBase64 / note.imageMime（如有原图）；
 * 步骤图的 imageBase64 同样打进去。
 * 不修改原 doc，返回新的 notes 数组。
 */
async function packImagesIntoNotes(notes) {
  const out = [];
  for (const n of notes) {
    const copy = { ...n };
    if (n.imagePath) {
      const dataURL = await readImageAsDataURL(n.imagePath);
      if (dataURL) {
        copy.imageBase64 = dataURL;
      } else {
        copy.imageBase64 = null;
        copy.imageError = '图片读取失败（可能已被微信清理）';
      }
    }
    if (Array.isArray(n.stepItems)) {
      copy.stepItems = [];
      for (const s of n.stepItems) {
        const sc = { ...s };
        if (s && s.imagePath) {
          const dataURL = await readImageAsDataURL(s.imagePath);
          sc.imageBase64 = dataURL;
        }
        copy.stepItems.push(sc);
      }
    }
    out.push(copy);
  }
  return out;
}

/**
 * 导出全部数据，返回 { filePath, sizeBytes, stats }
 * 不弹分享 UI，方便上层决定怎么分享。
 */
async function exportToFile() {
  const doc = repo.load();
  const stats = {
    notes: (doc.notes || []).length,
    expenses: (doc.expenses || []).length,
    checkins: (doc.checkins || []).length,
    categories: (doc.categories || []).length,
    budgets: (doc.budgets || []).length,
    imageCount: 0,
    imageFailures: 0,
  };

  const notes = await packImagesIntoNotes(doc.notes || []);
  // 统计图片成功 / 失败
  for (const n of notes) {
    if (n.imagePath) stats.imageCount += 1;
    if (n.imageError) stats.imageFailures += 1;
    if (Array.isArray(n.stepItems)) {
      for (const s of n.stepItems) {
        if (s && s.imagePath) stats.imageCount += 1;
      }
    }
  }

  const payload = {
    appName: APP_NAME,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    stats,
    notes,
    checkins: doc.checkins || [],
    expenses: doc.expenses || [],
    categories: doc.categories || [],
    budgets: doc.budgets || [],
  };

  const json = JSON.stringify(payload, null, 2);
  const fsm = wx.getFileSystemManager();
  const stamp = formatStamp(new Date());
  const fileName = `${APP_NAME}_backup_${stamp}.json`;
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

  await new Promise((resolve, reject) => {
    fsm.writeFile({
      filePath,
      data: json,
      encoding: 'utf8',
      success: () => resolve(),
      fail: (e) => reject(e),
    });
  });

  return {
    filePath,
    fileName,
    sizeBytes: json.length,
    stats,
  };
}

/**
 * 导出 + 弹分享。返回 { filePath, sizeBytes, stats, shared: boolean }
 */
async function exportAndShare() {
  const result = await exportToFile();
  return new Promise((resolve) => {
    try {
      wx.shareFileMessage({
        filePath: result.filePath,
        success: () => resolve({ ...result, shared: true }),
        fail: () => resolve({ ...result, shared: false }),
      });
    } catch (e) {
      resolve({ ...result, shared: false });
    }
  });
}

/** 把字节数转成 "1.2 MB" 风格 */
function humanSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

module.exports = {
  EXPORT_VERSION,
  APP_NAME,
  exportToFile,
  exportAndShare,
  humanSize,
};
