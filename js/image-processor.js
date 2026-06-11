function mkcanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext("2d") };
}

function clamp(v, mn, mx) { return v < mn ? mn : (v > mx ? mx : v); }

function cloneImageData(src) {
  const dst = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i++) dst.data[i] = src.data[i];
  return dst;
}

function getImageData(img) {
  const c = mkcanvas(img.naturalWidth, img.naturalHeight);
  c.ctx.imageSmoothingEnabled = false;
  c.ctx.drawImage(img, 0, 0);
  return c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
}

function smoothScale(imageData, dstW, dstH) {
  const srcC = mkcanvas(imageData.width, imageData.height);
  srcC.ctx.imageSmoothingEnabled = true;
  srcC.ctx.imageSmoothingQuality = "high";
  srcC.ctx.putImageData(imageData, 0, 0);
  const dstC = mkcanvas(dstW, dstH);
  dstC.ctx.imageSmoothingEnabled = true;
  dstC.ctx.imageSmoothingQuality = "high";
  dstC.ctx.drawImage(srcC.canvas, 0, 0, dstW, dstH);
  const r = dstC.ctx.getImageData(0, 0, dstW, dstH);
  for (let i = 3; i < r.data.length; i += 4) r.data[i] = 255;
  return r;
}

function nnScale(imageData, dstW, dstH) {
  const srcC = mkcanvas(imageData.width, imageData.height);
  srcC.ctx.imageSmoothingEnabled = false;
  srcC.ctx.putImageData(imageData, 0, 0);
  const dstC = mkcanvas(dstW, dstH);
  dstC.ctx.imageSmoothingEnabled = false;
  dstC.ctx.drawImage(srcC.canvas, 0, 0, dstW, dstH);
  const r = dstC.ctx.getImageData(0, 0, dstW, dstH);
  for (let i = 3; i < r.data.length; i += 4) r.data[i] = 255;
  return r;
}

function scaleToPixel(imageData, dstW, dstH) {
  // Always bicubic to 2x target for proper color averaging, then NN for sharp pixels
  var iw = Math.min(imageData.width, dstW * 2);
  var ih = Math.min(imageData.height, dstH * 2);
  return nnScale(smoothScale(imageData, iw, ih), dstW, dstH);
}

function directPerlerMap(imageData, colorTable) {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const bead = findNearestBeadColor({ r: data[idx], g: data[idx + 1], b: data[idx + 2] }, colorTable);
    out.data[idx] = bead.r; out.data[idx + 1] = bead.g; out.data[idx + 2] = bead.b; out.data[idx + 3] = 255;
  }
  return out;
}

function reduceToTopNColors(imageData, colorTable, n) {
  if (n >= colorTable.length) return directPerlerMap(imageData, colorTable);
  if (n < 1) n = 1;
  const { width, height, data } = imageData;
  const total = width * height;
  const usage = {};
  const assignments = new Uint16Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const nearest = findNearestBeadColor({ r: data[idx], g: data[idx + 1], b: data[idx + 2] }, colorTable);
    assignments[i] = nearest.id;
    usage[nearest.id] = (usage[nearest.id] || 0) + 1;
  }
  const sorted = colorTable.slice().sort(function(a, b) { return (usage[b.id] || 0) - (usage[a.id] || 0); });
  const keptIds = new Set();
  for (let i = 0; i < n && i < sorted.length; i++) keptIds.add(sorted[i].id);
  const keptColors = colorTable.filter(function(c) { return keptIds.has(c.id); });
  const out = new ImageData(width, height);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    let bead;
    if (keptIds.has(assignments[i])) {
      bead = colorTable.find(function(c) { return c.id === assignments[i]; });
    } else {
      bead = findNearestBeadColor({ r: data[idx], g: data[idx + 1], b: data[idx + 2] }, keptColors);
    }
    out.data[idx] = bead.r; out.data[idx + 1] = bead.g; out.data[idx + 2] = bead.b; out.data[idx + 3] = 255;
  }
  return out;
}

function collectColors(imageData) {
  const { width, height, data } = imageData;
  const map = new Map();
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const key = data[idx] + "," + data[idx + 1] + "," + data[idx + 2];
    map.set(key, (map.get(key) || 0) + 1);
  }
  const r = [];
  for (const [k, count] of map) {
    const p = k.split(",");
    r.push({ r: +p[0], g: +p[1], b: +p[2], count: count });
  }
  return r;
}

function getRange(pixels) {
  let mnR = 255, mxR = 0, mnG = 255, mxG = 0, mnB = 255, mxB = 0;
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    if (p.r < mnR) mnR = p.r; if (p.r > mxR) mxR = p.r;
    if (p.g < mnG) mnG = p.g; if (p.g > mxG) mxG = p.g;
    if (p.b < mnB) mnB = p.b; if (p.b > mxB) mxB = p.b;
  }
  const rr = mxR - mnR, rg = mxG - mnG, rb = mxB - mnB;
  if (rr >= rg && rr >= rb) return { range: rr, channel: "r" };
  if (rg >= rr && rg >= rb) return { range: rg, channel: "g" };
  return { range: rb, channel: "b" };
}

function medianCutQuantize(imageData, maxColors) {
  if (maxColors < 2) maxColors = 2;
  if (maxColors > 256) maxColors = 256;
  const colors = collectColors(imageData);
  if (colors.length <= maxColors) {
    const palette = colors.map(function(p) { return { r: p.r, g: p.g, b: p.b }; });
    return { quantized: mapColors(imageData, palette), palette: palette };
  }
  let leaves = [colors];
  while (leaves.length < maxColors) {
    let bi = -1, br = -1, bc = "r";
    for (let i = 0; i < leaves.length; i++) {
      if (leaves[i].length < 2) continue;
      const info = getRange(leaves[i]);
      if (info.range > br) { br = info.range; bc = info.channel; bi = i; }
    }
    if (bi === -1 || br === 0) break;
    const leaf = leaves[bi];
    leaf.sort(function(a, b) { return a[bc] - b[bc]; });
    let total = 0;
    for (let i = 0; i < leaf.length; i++) total += leaf[i].count;
    let acc = 0, si = leaf.length;
    for (let i = 0; i < leaf.length - 1; i++) {
      acc += leaf[i].count;
      if (acc >= total / 2) { si = i + 1; break; }
    }
    if (si === 0) si = 1;
    if (si >= leaf.length) si = leaf.length - 1;
    leaves.splice(bi, 1, leaf.slice(0, si), leaf.slice(si));
  }
  const palette = leaves.map(function(leaf) {
    let total = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < leaf.length; i++) {
      total += leaf[i].count;
      sr += leaf[i].r * leaf[i].count;
      sg += leaf[i].g * leaf[i].count;
      sb += leaf[i].b * leaf[i].count;
    }
    return { r: Math.round(sr / total), g: Math.round(sg / total), b: Math.round(sb / total) };
  });
  return { quantized: mapColors(imageData, palette), palette: palette };
}


function kmeansRefine(imageData, initialPalette, maxIter) {
  const { width, height, data } = imageData;
  const n = width * height, k = initialPalette.length;
  var palette = [];
  for (var pi = 0; pi < k; pi++) palette.push({ r: initialPalette[pi].r, g: initialPalette[pi].g, b: initialPalette[pi].b });
  const assign = new Uint16Array(n);
  for (var iter = 0; iter < maxIter; iter++) {
    var changed = false;
    for (var i = 0; i < n; i++) {
      var idx = i * 4;
      var md = Infinity, bk = 0;
      for (var j = 0; j < k; j++) {
        var dr = data[idx] - palette[j].r, dg = data[idx+1] - palette[j].g, db = data[idx+2] - palette[j].b;
        var d = dr * dr + dg * dg + db * db;
        if (d < md) { md = d; bk = j; }
      }
      if (assign[i] !== bk) { assign[i] = bk; changed = true; }
    }
    if (iter > 0 && !changed) break;
    var sums = [];
    var cnts = [];
    for (var j = 0; j < k; j++) { sums.push({ r: 0, g: 0, b: 0 }); cnts.push(0); }
    for (var i = 0; i < n; i++) {
      var idx = i * 4, j = assign[i];
      sums[j].r += data[idx]; sums[j].g += data[idx+1]; sums[j].b += data[idx+2];
      cnts[j]++;
    }
    for (var j = 0; j < k; j++) {
      if (cnts[j] > 0) palette[j] = { r: Math.round(sums[j].r / cnts[j]), g: Math.round(sums[j].g / cnts[j]), b: Math.round(sums[j].b / cnts[j]) };
    }
  }
  return palette;
}

function mapColors(imageData, palette) {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    let md = Infinity, bi = 0;
    for (let j = 0; j < palette.length; j++) {
      const dr = data[idx] - palette[j].r, dg = data[idx + 1] - palette[j].g, db = data[idx + 2] - palette[j].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < md) { md = d; bi = j; }
    }
    out.data[idx] = palette[bi].r;
    out.data[idx + 1] = palette[bi].g;
    out.data[idx + 2] = palette[bi].b;
    out.data[idx + 3] = 255;
  }
  return out;
}

function renderPixelCanvas(pixelData, scale, showGrid) {
  const { width, height } = pixelData;
  const cw = width * scale, ch = height * scale;
  const dstC = mkcanvas(cw, ch);
  dstC.ctx.imageSmoothingEnabled = false;
  const srcC = mkcanvas(width, height);
  srcC.ctx.putImageData(pixelData, 0, 0);
  dstC.ctx.drawImage(srcC.canvas, 0, 0, cw, ch);

  // 缃戞牸绾?(Aseprite椋庢牸)
  if (showGrid && scale >= 2) {
    dstC.ctx.globalAlpha = 0.25;
    dstC.ctx.strokeStyle = "#000";
    dstC.ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
      dstC.ctx.beginPath();
      dstC.ctx.moveTo(x * scale + 0.5, 0);
      dstC.ctx.lineTo(x * scale + 0.5, ch);
      dstC.ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      dstC.ctx.beginPath();
      dstC.ctx.moveTo(0, y * scale + 0.5);
      dstC.ctx.lineTo(cw, y * scale + 0.5);
      dstC.ctx.stroke();
    }
    // 娴呰壊鍍忕礌涓婄殑缃戞牸鐢ㄦ繁鑹诧紝娣辫壊涓婄殑缃戞牸宸插彲瑙?
    dstC.ctx.globalAlpha = 1;
  }
  return dstC.canvas;
}



/**
 * Floyd-Steinberg 误差扩散抖动量化
 * 比纯最近色映射保留更多细节，消除色块边界
 */
function mapColorsWithDither(imageData, palette) {
  var w = imageData.width, h = imageData.height;
  var src = imageData.data;
  var out = new ImageData(w, h);
  var outData = out.data;
  
  // 工作副本用浮点数以累计误差
  var work = new Float64Array(src.length);
  for (var i = 0; i < src.length; i++) work[i] = src[i];
  
  var k = palette.length;
  // 预计算色盘颜色的 RGB 平方，避免循环内重复计算
  var palR = new Array(k), palG = new Array(k), palB = new Array(k);
  for (var pi = 0; pi < k; pi++) {
    palR[pi] = palette[pi].r;
    palG[pi] = palette[pi].g;
    palB[pi] = palette[pi].b;
  }
  
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var r = work[idx], g = work[idx + 1], b = work[idx + 2];
      // 裁剪到 0-255
      r = r < 0 ? 0 : (r > 255 ? 255 : r);
      g = g < 0 ? 0 : (g > 255 ? 255 : g);
      b = b < 0 ? 0 : (b > 255 ? 255 : b);
      
      // 找最近色
      var md = Infinity, bi = 0;
      for (var j = 0; j < k; j++) {
        var dr = r - palR[j], dg = g - palG[j], db = b - palB[j];
        var d = dr * dr + dg * dg + db * db;
        if (d < md) { md = d; bi = j; }
      }
      var qr = palR[bi], qg = palG[bi], qb = palB[bi];
      
      outData[idx] = qr; outData[idx + 1] = qg; outData[idx + 2] = qb; outData[idx + 3] = 255;
      
      // 量化误差
      var errR = r - qr, errG = g - qg, errB = b - qb;
      
      // 扩散到邻居 (Floyd-Steinberg 系数)
      // 右 (x+1, y): 7/16
      if (x + 1 < w) {
        var ri = idx + 4;
        work[ri] += errR * 7 / 16;
        work[ri + 1] += errG * 7 / 16;
        work[ri + 2] += errB * 7 / 16;
      }
      // 左下 (x-1, y+1): 3/16
      if (x > 0 && y + 1 < h) {
        var li = ((y + 1) * w + (x - 1)) * 4;
        work[li] += errR * 3 / 16;
        work[li + 1] += errG * 3 / 16;
        work[li + 2] += errB * 3 / 16;
      }
      // 下 (x, y+1): 5/16
      if (y + 1 < h) {
        var di = ((y + 1) * w + x) * 4;
        work[di] += errR * 5 / 16;
        work[di + 1] += errG * 5 / 16;
        work[di + 2] += errB * 5 / 16;
      }
      // 右下 (x+1, y+1): 1/16
      if (x + 1 < w && y + 1 < h) {
        var ri2 = ((y + 1) * w + (x + 1)) * 4;
        work[ri2] += errR * 1 / 16;
        work[ri2 + 1] += errG * 1 / 16;
        work[ri2 + 2] += errB * 1 / 16;
      }
    }
  }
  return out;
}


/**
 * 品牌豆颜色映射 + Floyd-Steinberg 抖动
 * 将 editImageData（调色板映射后）映射到品牌豆颜色，带误差扩散
 * rawData: ImageData (editImageData)
 * beadTable: 品牌色盘 (getColorTable 返回值)
 */
function mapToBeadColorsWithDither(rawData, beadTable) {
  var w = rawData.width, h = rawData.height;
  var src = rawData.data;
  var out = new ImageData(w, h);
  var outData = out.data;
  
  // 工作副本用浮点数
  var work = new Float64Array(src.length);
  for (var i = 0; i < src.length; i++) work[i] = src[i];
  
  // 预计算色盘 Lab 值（findNearestBeadColor 内部会缓存）
  var k = beadTable.length;
  
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var r = work[idx], g = work[idx + 1], b = work[idx + 2];
      r = r < 0 ? 0 : (r > 255 ? 255 : r);
      g = g < 0 ? 0 : (g > 255 ? 255 : g);
      b = b < 0 ? 0 : (b > 255 ? 255 : b);
      
      // 用 Lab 色差找最近品牌豆颜色
      var bead = findNearestBeadColor({ r: Math.round(r), g: Math.round(g), b: Math.round(b) }, beadTable);
      var qr = bead.r, qg = bead.g, qb = bead.b;
      
      outData[idx] = qr; outData[idx + 1] = qg; outData[idx + 2] = qb; outData[idx + 3] = 255;
      
      var errR = r - qr, errG = g - qg, errB = b - qb;
      
      // Floyd-Steinberg 扩散
      if (x + 1 < w) {
        var ri = idx + 4;
        work[ri] += errR * 7 / 16;
        work[ri + 1] += errG * 7 / 16;
        work[ri + 2] += errB * 7 / 16;
      }
      if (x > 0 && y + 1 < h) {
        var li = ((y + 1) * w + (x - 1)) * 4;
        work[li] += errR * 3 / 16;
        work[li + 1] += errG * 3 / 16;
        work[li + 2] += errB * 3 / 16;
      }
      if (y + 1 < h) {
        var di = ((y + 1) * w + x) * 4;
        work[di] += errR * 5 / 16;
        work[di + 1] += errG * 5 / 16;
        work[di + 2] += errB * 5 / 16;
      }
      if (x + 1 < w && y + 1 < h) {
        var ri2 = ((y + 1) * w + (x + 1)) * 4;
        work[ri2] += errR * 1 / 16;
        work[ri2 + 1] += errG * 1 / 16;
        work[ri2 + 2] += errB * 1 / 16;
      }
    }
  }
  return out;
}


/**
 * 饱和度增强 (简单 RGB 空间扩展)
 * factor: 1.0 = 不变, 1.2~1.5 = 增强, 0.5~0.8 = 减弱
 * 每个像素的颜色向纯色方向推，让拼豆最终颜色更鲜艳
 */
function boostSaturation(imageData, factor) {
  var w = imageData.width, h = imageData.height;
  var data = imageData.data;
  for (var i = 0; i < w * h; i++) {
    var idx = i * 4;
    var r = data[idx], g = data[idx + 1], b = data[idx + 2];
    var avg = (r + g + b) / 3;
    data[idx] = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * factor)));
    data[idx + 1] = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * factor)));
    data[idx + 2] = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * factor)));
  }
}


/**
 * Unsharp Mask 锐化
 * 增强图像边缘，让像素画轮廓更清晰
 * intensity: 1.0~3.0，越大边缘越锐
 */
function sharpen(imageData, intensity) {
  var w = imageData.width, h = imageData.height;
  var src = imageData.data;
  var copy = new Uint8Array(src);
  // 简单 3x3 均值模糊
  var blur = new Uint8Array(src.length);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var sumR = 0, sumG = 0, sumB = 0, n = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            var pi = (ny * w + nx) * 4;
            sumR += copy[pi]; sumG += copy[pi + 1]; sumB += copy[pi + 2];
            n++;
          }
        }
      }
      blur[idx] = sumR / n; blur[idx + 1] = sumG / n; blur[idx + 2] = sumB / n;
    }
  }
  // 锐化：original + (original - blur) * intensity
  for (var i = 0; i < src.length; i += 4) {
    src[i]     = Math.max(0, Math.min(255, Math.round(copy[i]     + (copy[i] - blur[i]) * intensity)));
    src[i + 1] = Math.max(0, Math.min(255, Math.round(copy[i + 1] + (copy[i + 1] - blur[i + 1]) * intensity)));
    src[i + 2] = Math.max(0, Math.min(255, Math.round(copy[i + 2] + (copy[i + 2] - blur[i + 2]) * intensity)));
  }
}


/**
 * 轮廓增强 — 专为卡通图优化
 * 检测卡通轮廓线，强制映射为深色豆子颜色
 * 让像素画保留原始线稿的轮廓感
 */
function enhanceOutlines(viewData, beadTable) {
  var w = viewData.width, h = viewData.height;
  var data = viewData.data;
  var copy = new Uint8Array(data);
  var darkest = findNearestBeadColor({ r: 0, g: 0, b: 0 }, beadTable);
  // 如果色盘没有真正的深色，用次深色（取亮度最低的几个颜色中的第一个）
  if (darkest.r + darkest.g + darkest.b > 100) {
    var minBright = Infinity;
    for (var ti = 0; ti < beadTable.length; ti++) {
      var cb = beadTable[ti].r + beadTable[ti].g + beadTable[ti].b;
      if (cb < minBright) { minBright = cb; darkest = beadTable[ti]; }
    }
  }
  
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var r = copy[idx], g = copy[idx + 1], b = copy[idx + 2];
      var bright = r + g + b;
      // 放宽限制：只跳过很亮的像素
      if (bright > 500) continue;
      
      // 计算邻居平均亮度
      var sum = 0, n = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            var pi = (ny * w + nx) * 4;
            sum += copy[pi] + copy[pi + 1] + copy[pi + 2];
            n++;
          }
        }
      }
      var avgBright = sum / n;
      // 降低阈值：邻居比当前亮 40 以上就认为是轮廓
      if (avgBright - bright > 40) {
        data[idx] = darkest.r;
        data[idx + 1] = darkest.g;
        data[idx + 2] = darkest.b;
      }
    }
  }
}
