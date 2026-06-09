/**
 * perler-mapper.js - 拼豆颜色映射
 * 使用 CIE76 Delta E (Lab) 颜色差异公式
 * 比 RGB 欧氏距离更符合人眼感知
 */

/**
 * sRGB -> CIE Lab 转换
 */
function rgbToLab(r, g, b) {
  var rl = r / 255, gl = g / 255, bl = b / 255;
  rl = rl <= 0.04045 ? rl / 12.92 : Math.pow((rl + 0.055) / 1.055, 2.4);
  gl = gl <= 0.04045 ? gl / 12.92 : Math.pow((gl + 0.055) / 1.055, 2.4);
  bl = bl <= 0.04045 ? bl / 12.92 : Math.pow((bl + 0.055) / 1.055, 2.4);
  var x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  var y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  var z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  x /= 0.95047; y /= 1.00000; z /= 1.08883;
  function f(t) { return t > 0.008856 ? Math.pow(t, 1/3) : 7.787 * t + 16/116; }
  var fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// Lab 缓存 (每个调色板计算一次)
var _labCache = null;
var _cacheTable = null;

function getLabCache(colorTable) {
  if (_cacheTable === colorTable && _labCache) return _labCache;
  var n = colorTable.length;
  _labCache = new Float64Array(n * 3);
  for (var i = 0; i < n; i++) {
    var c = colorTable[i];
    var lab = rgbToLab(c.r, c.g, c.b);
    _labCache[i * 3] = lab.L;
    _labCache[i * 3 + 1] = lab.a;
    _labCache[i * 3 + 2] = lab.b;
  }
  _cacheTable = colorTable;
  return _labCache;
}

/**
 * 用 Delta E (CIE76) 查找最接近的拼豆颜色
 * Lab 颜色空间中的欧氏距离更符合人眼感知
 */
function findNearestBeadColor(pixel, colorTable) {
  var pLab = rgbToLab(pixel.r, pixel.g, pixel.b);
  var cache = getLabCache(colorTable);
  var minDist = Infinity;
  var best = colorTable[0];
  
  for (var i = 0; i < colorTable.length; i++) {
    var dL = pLab.L - cache[i * 3];
    var da = pLab.a - cache[i * 3 + 1];
    var db = pLab.b - cache[i * 3 + 2];
    var dist = dL * dL + da * da + db * db;
    if (dist < minDist) { minDist = dist; best = colorTable[i]; }
  }
  return best;
}

function mapToBeadColors(pixelData, colorTable) {
  const { width, height, data } = pixelData;
  const mapped = new ImageData(width, height);
  const colorCountMap = new Map();

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const pixel = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    const nearest = findNearestBeadColor(pixel, colorTable);
    mapped.data[idx] = nearest.r;
    mapped.data[idx + 1] = nearest.g;
    mapped.data[idx + 2] = nearest.b;
    mapped.data[idx + 3] = 255;

    const key = pixel.r + "," + pixel.g + "," + pixel.b;
    if (colorCountMap.has(key)) {
      colorCountMap.get(key).count++;
    } else {
      colorCountMap.set(key, { from: pixel, to: { id: nearest.id, name: nearest.name, r: nearest.r, g: nearest.g, b: nearest.b }, count: 1 });
    }
  }

  const beadColorMap = new Map();
  for (const entry of colorCountMap.values()) {
    const beadId = entry.to.id;
    if (beadColorMap.has(beadId)) {
      beadColorMap.get(beadId).count += entry.count;
    } else {
      beadColorMap.set(beadId, { bead: entry.to, count: entry.count });
    }
  }

  return { mapped, colorMap: Array.from(beadColorMap.values()).sort(function(a, b) { return b.count - a.count; }) };
}
