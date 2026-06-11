// Fallback export functions
if (typeof window.exportPNG === "undefined") {
  window.exportPNG = function(d) { var c=document.createElement("canvas");c.width=d.width;c.height=d.height;c.getContext("2d").putImageData(d,0,0);var a=document.createElement("a");a.download="pixel-art.png";a.href=c.toDataURL("image/png");a.click(); };
}
if (typeof window.exportPDF === "undefined") {
  window.exportPDF = function(d,cm,b) { alert("PDF导出失败：缺少jsPDF库，请刷新页面后重试"); };
}
if (typeof window.exportCSV === "undefined") {
  window.exportCSV = function(cm,t) { var csv="\ufeff颜色名称,豆子编号,R,G,B,所需数量\n";for(var i=0;i<cm.length;i++){var e=cm[i];csv+=e.bead.name+",#"+e.bead.id+","+e.bead.r+","+e.bead.g+","+e.bead.b+","+e.count+"\n";}var b=new Blob([csv],{type:"text/csv;charset=utf-8"});var a=document.createElement("a");a.download="bead-list.csv";a.href=URL.createObjectURL(b);a.click();URL.revokeObjectURL(a.href); };
}

void function() {
  "use strict";
  const $ = function(id) { return document.getElementById(id); };

  const uploadArea = $("uploadArea");
  const fileInput = $("fileInput");
  const originalImage = $("originalImage");
  const changeImageBtn = $("changeImageBtn");
  const uploadPlaceholder = $("uploadPlaceholder");
  const uploadPreview = $("uploadPreview");
  const imageInfo = $("imageInfo");
  const imageInfoText = $("imageInfoText");
  const pixelWidthGroup = $("pixelWidthGroup");
  const brandSelect = $("brandSelect");
  const generateBtn = $("generateBtn");
  const resultArea = $("resultArea");
  const pixelCanvasWrapper = $("pixelCanvasWrapper");
  const canvasInfo = $("canvasInfo");
  const paletteDiv = $("palette");
  const beadPaletteDiv = $("beadPalette");
  const editToolbar = $("editToolbar");
  const undoBtn = $("undoBtn");
  const toolPencil = $("toolPencil");
  const toolEraser = $("toolEraser");
  const toolFill = $("toolFill");
  const currentColorSwatch = $("currentColor");
  const beadMappingToggle = $("beadMappingToggle") || { checked: true, addEventListener: function() {} };
  const zoomInBtn = $("zoomIn");
  const zoomOutBtn = $("zoomOut");
  const zoomLabel = $("zoomLabel");
  const exportPngBtn = $("exportPngBtn");
  const exportPdfBtn = $("exportPdfBtn");
  const exportCsvBtn = $("exportCsvBtn");
  const statusTool = $("statusTool");
  const statusPos = $("statusPos");
  const statusCanvas = $("statusCanvas");
  const statusZoom = $("statusZoom");

  let currentBrand = 'artkal-5mm';
  // === 联盟导购链接（修改这里的 URL 为你自己的淘宝/京东推广链接）===
  var AFFILIATE_URL = 'https://s.click.taobao.com/YOUR_ID_HERE';
  var AFFILIATE_TEXT = '在淘宝购买这些颜色';
  // =============================================
  let originalImgData = null;
  let originalFileSize = 0;
  let editImageData = null;
  let showBeadMapping = true;
  let undoStack = [];
  let isDrawing = false;
  let currentTool = "pencil";
  let selectedBeadColor = null;
  var currentZoom = 0;
  let isSpaceDown = false, isPanning = false;
  let panStartX = 0, panStartY = 0, panOffsetX = 0, panOffsetY = 0;
  let centerX = 0, centerY = 0;

  // --- Status bar helpers (inside IIFE, so they can access consts) ---
  function setStatusTool(t) { if(statusTool){var n={pencil:"画笔",eraser:"橡皮",fill:"填充"};statusTool.textContent=n[t]||t;} }
  function setStatusZoom() { if(statusZoom) statusZoom.textContent = currentZoom > 0 ? currentZoom + "x" : "自动"; }
  function setStatusCanvas(w,h) { if(statusCanvas) statusCanvas.textContent = w + " x " + h; }
  function setStatusPos(px,py) { if(statusPos) statusPos.textContent = "X:" + px + " Y:" + py; }
  function clearStatusPos() { if(statusPos) statusPos.textContent = "X:- Y:-"; }

  // Manually call the global fallback variable check from inside IIFE
  function hasJsPdf() { return typeof window.jspdf !== "undefined" && window.jspdf !== null; }

  // Brand selection helpers
  function getSelectedBrand() {
    var s = document.getElementById("brandSelect");
    return s ? s.value : "artkal-5mm";
  }
  function maxColorsForBrand(ct) {
    return ct.length; // Use all available colors for the selected brand
  }

  function setupSegmented(group) { if (!group) return;
    group.querySelectorAll(".seg-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        group.querySelectorAll(".seg-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
    });
  }
  setupSegmented(pixelWidthGroup);
  
  var satSlider = document.getElementById("saturateSlider");
  var satLabel = document.getElementById("saturateVal");
  if (satSlider && satLabel) {
    satSlider.addEventListener("input", function() { satLabel.textContent = parseFloat(this.value).toFixed(1); });
  }
  

  function getSelectedValue(g) { return parseInt(g.querySelector(".seg-btn.active").dataset.value); }

  var dragCounter = 0;
  function setupUpload() {
    uploadArea.addEventListener("click", function() { fileInput.click(); });
    fileInput.addEventListener("change", function(e) { if (e.target.files.length > 0) handleFile(e.target.files[0]); });
    function onDragEnter(e) { e.preventDefault(); dragCounter++; if (dragCounter === 1) uploadArea.classList.add("dragover"); }
    function onDragLeave(e) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; uploadArea.classList.remove("dragover"); } }
    function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
    function onDrop(e) { e.preventDefault(); dragCounter = 0; uploadArea.classList.remove("dragover"); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    changeImageBtn.addEventListener("click", function(e) { e.stopPropagation(); fileInput.click(); });
  }
  setupUpload();

  function handleFile(file) {
    if (!file.type.match(/^image\/(jpeg|png)$/)) { alert("请上传 JPG 或 PNG 格式的图片"); return; }
    originalFileSize = file.size;
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        originalImgData = getImageData(img);
        originalImage.src = e.target.result;
        uploadPlaceholder.classList.add("hidden");
        uploadPreview.classList.remove("hidden");
        imageInfo.classList.remove("hidden");
        imageInfoText.textContent = img.naturalWidth + " x " + img.naturalHeight + " px | " + formatSize(originalFileSize);
        generateBtn.disabled = false;
        resultArea.classList.add("hidden");
        editToolbar.classList.add("hidden");
        editImageData = null;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  toolPencil.addEventListener("click", function() { setTool("pencil"); });
  toolEraser.addEventListener("click", function() { setTool("eraser"); });
  toolFill.addEventListener("click", function() { setTool("fill"); });
  zoomInBtn.addEventListener("click", zoomIn);
  zoomOutBtn.addEventListener("click", zoomOut);

  function setTool(tool) {
    currentTool = tool;
    toolPencil.classList.toggle("active", tool === "pencil");
    toolEraser.classList.toggle("active", tool === "eraser");
    toolFill.classList.toggle("active", tool === "fill");
    setStatusTool(tool);
    var canvas = pixelCanvasWrapper.querySelector("canvas");
    if (canvas) canvas.style.cursor = tool === "eraser" ? "cell" : "crosshair";
  }

  function getViewData() {
    if (!editImageData) return null;
    if (showBeadMapping) {
      try {
        var ct = getColorTable(currentBrand);
        return reduceToTopNColors(editImageData, ct, Math.min(ct.length, maxColorsForBrand(ct)));
        return r;
      } catch(e) { console.error("Mapping error:", e); return editImageData; }
    }
    return editImageData;
  }

  beadMappingToggle.addEventListener("change", function() { showBeadMapping = beadMappingToggle.checked; renderAll(); });
  

  generateBtn.addEventListener("click", generatePixelArt);

  async function generatePixelArt() {
    if (!originalImgData) { return; }
    generateBtn.disabled = true;
    var bt = generateBtn.querySelector(".btn-text");
    var bl = generateBtn.querySelector(".btn-loading");
    bt.classList.add("hidden"); bl.classList.remove("hidden");
    await sleep(50);
    try {
      var pixelW = getSelectedValue(pixelWidthGroup);
      var maxCol = 256; // Use all available colors (no limit)
      currentBrand = getSelectedBrand(); // "artkal-5mm", "artkal-2.6mm", or "combined"
      var pixelH = Math.max(1, Math.round(pixelW * (originalImgData.height / originalImgData.width)));
      var scaled = scaleToPixel(originalImgData, pixelW, pixelH);
      var satVal = parseFloat(document.getElementById("saturateSlider").value) || 1.0;
      if (satVal > 1.0) boostSaturation(scaled, satVal);
      var q = medianCutQuantize(scaled, maxCol);
      var refined = kmeansRefine(scaled, q.palette, 5);
      editImageData = cloneImageData(mapColors(scaled, refined));
      undoStack = [{ data: cloneImageData(editImageData) }];


      var ct = getColorTable(currentBrand);
      var firstBead = findNearestBeadColor({ r: editImageData.data[0], g: editImageData.data[1], b: editImageData.data[2] }, ct);
      selectedBeadColor = { id: firstBead.id, name: firstBead.name, r: firstBead.r, g: firstBead.g, b: firstBead.b };
      // Show editor module first so elements have proper dimensions
      var ed = document.getElementById("moduleEditor"); if (ed) { ed.style.display = "flex"; }
      canvasInfo.textContent = pixelW + " x " + pixelH + " 像素";
      canvasInfo.classList.remove("hidden");
      resultArea.classList.remove("hidden");
      editToolbar.classList.remove("hidden");
      // Now render (wrapper has real dimensions)
      renderAll();
      // Switch to editor page and scroll to top
      switchToPage(1);
      var pe = document.getElementById("pageEditor");
      if (pe) pe.scrollTop = 0;
    } catch(err) { console.error("生成失败:", err); alert("生成失败:\n" + err.message + "\n\n" + err.stack); }
    finally { bt.classList.remove("hidden"); bl.classList.add("hidden"); generateBtn.disabled = false; }
  }


  function renderAll() {
    var vd = getViewData(); if (!vd) return;
    renderPreview(vd); renderUsedPalette(vd); renderBeadPalette(); updateColorIndicator();
    setStatusCanvas(vd.width, vd.height);
    setStatusZoom();
    if (zoomLabel) zoomLabel.textContent = currentZoom > 0 ? currentZoom + "x" : "自动";
  }

  function renderPreview(vd) {
    var scale = currentZoom > 0 ? currentZoom : Math.max(1, Math.floor(Math.min(pixelCanvasWrapper.clientWidth - 24, pixelCanvasWrapper.clientHeight - 24, 600) / Math.max(vd.width, vd.height)));
    if (window.innerWidth <= 500) scale = Math.max(1, Math.floor(scale * 0.55));
    var canvas = renderPixelCanvas(vd, scale, true);
    canvas.id = "pixelCanvas";
    canvas.style.position = "absolute";
    canvas.style.imageRendering = "pixelated";
    canvas.style.cursor = currentTool === "eraser" ? "cell" : "crosshair";
    canvas.style.width = vd.width * scale + "px";
    canvas.style.height = vd.height * scale + "px";
    // Center canvas in wrapper and apply pan offset
    centerX = Math.max(0, (pixelCanvasWrapper.clientWidth - vd.width * scale) / 2);
    centerY = Math.max(0, (pixelCanvasWrapper.clientHeight - vd.height * scale) / 2);
    canvas.style.left = centerX + "px";
    canvas.style.top = centerY + "px";
    var old = pixelCanvasWrapper.querySelector("canvas");
    if (old) old.remove();
    pixelCanvasWrapper.appendChild(canvas);
    applyPan();
    bindCanvasEvents(canvas, vd, scale);
  }

  function renderUsedPalette(vd) {
    var ct = getColorTable(currentBrand);
    var cm = buildColorStats(vd, ct);
    paletteDiv.innerHTML = "";
    var total = 0;
    for (var ei = 0; ei < cm.length; ei++) {
      total += cm[ei].count;
      var c = cm[ei].bead;
      var div = document.createElement("div"); div.className = "palette-item";
      var sw = document.createElement("div"); sw.className = "palette-swatch"; sw.style.background = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
      var lb = document.createElement("div"); lb.className = "palette-label";
      lb.innerHTML = (showBeadMapping ? "#" + c.id + " " + c.name : c.r + "," + c.g + "," + c.b) + "<br>x" + cm[ei].count;
      div.appendChild(sw); div.appendChild(lb); paletteDiv.appendChild(div);
    }
    // 更新右侧购买面板
    var tb = document.getElementById("totalBeads");
    var pb = document.getElementById("purchaseBtn");
    if (tb) tb.textContent = total;
    if (pb) pb.href = AFFILIATE_URL;
  }

  function renderBeadPalette() {
    beadPaletteDiv.innerHTML = "";
    var ct = getColorTable(currentBrand);
    for (var ci = 0; ci < ct.length; ci++) {
      var c = ct[ci];
      var sw = document.createElement("div"); sw.className = "bead-swatch";
      if (selectedBeadColor && selectedBeadColor.id === c.id) sw.classList.add("selected");
      sw.style.background = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
      sw.title = "#" + c.id + " " + c.name;
      var lb = document.createElement("span"); lb.className = "bead-label"; lb.textContent = c.id;
      lb.style.color = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 160 ? "#333" : "#fff";
      sw.appendChild(lb);
      (function(color) {
        sw.addEventListener("click", function(e) {
          e.stopPropagation();
          selectedBeadColor = { id: color.id, name: color.name, r: color.r, g: color.g, b: color.b };
          beadPaletteDiv.querySelectorAll(".bead-swatch").forEach(function(s) { s.classList.remove("selected"); });
          sw.classList.add("selected");
          updateColorIndicator();
        });
      })(c);
      beadPaletteDiv.appendChild(sw);
    }
  }

  function updateColorIndicator() {
    if (selectedBeadColor) currentColorSwatch.style.background = "rgb(" + selectedBeadColor.r + "," + selectedBeadColor.g + "," + selectedBeadColor.b + ")";
  }

  function bindCanvasEvents(canvas, vd, scale) {
    var w = vd.width, h = vd.height;
    function getPixel(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX || (e.touches ? e.touches[0].clientX : 0) || 0) - rect.left;
      var my = (e.clientY || (e.touches ? e.touches[0].clientY : 0) || 0) - rect.top;
      var px = Math.floor(mx * w / rect.width), py = Math.floor(my * h / rect.height);
      if (px >= 0 && px < w && py >= 0 && py < h) return { px: px, py: py };
      return null;
    }
    function paintPixel(px, py) {
      if (!editImageData) return false;
      var w = editImageData.width, h = editImageData.height;
      var idx = (py * w + px) * 4;
      var tr = 255, tg = 255, tb = 255;
      if (currentTool !== "eraser" && selectedBeadColor) { tr = selectedBeadColor.r; tg = selectedBeadColor.g; tb = selectedBeadColor.b; }
      if (editImageData.data[idx] === tr && editImageData.data[idx+1] === tg && editImageData.data[idx+2] === tb) return false;
      editImageData.data[idx] = tr; editImageData.data[idx+1] = tg; editImageData.data[idx+2] = tb; editImageData.data[idx+3] = 255;
      return true;
    }function onStart(e) {
      if (_touchFired) { _touchFired=false; return; }
      if (e.button === 2) return;
      // Middle mouse button or Space + left drag = pan
      if (e.button === 1) {
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX - panOffsetX;
        panStartY = e.clientY - panOffsetY;
        pixelCanvasWrapper.classList.add("panning");
        return;
      }
      if (isSpaceDown) {
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX - panOffsetX;
        panStartY = e.clientY - panOffsetY;
        pixelCanvasWrapper.classList.add("panning");
        return;
      }
      e.preventDefault();
      var coord = getPixel(e); if (!coord) return;
      undoStack.push({ data: cloneImageData(editImageData) });
      if (undoStack.length > 30) undoStack.shift();
      if (currentTool === "fill") {
        if (selectedBeadColor) { var vd2 = getViewData(); if (vd2 && floodFill(editImageData, vd2, coord.px, coord.py, selectedBeadColor)) renderAll(); }
      } else {
        if (paintPixel(coord.px, coord.py)) renderAll();
      }
      isDrawing = true;
    }
    function onMove(e) {
      if (isPanning) {
        e.preventDefault();
        var cx = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        var cy = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        panOffsetX = cx - panStartX;
        panOffsetY = cy - panStartY;
        var cnv = pixelCanvasWrapper.querySelector("canvas");
        if (cnv) { cnv.style.transform = "translate(" + panOffsetX + "px," + panOffsetY + "px)"; }
        return;
      }
      if (!isDrawing) return; e.preventDefault(); var coord = getPixel(e); if (!coord) return; if (paintPixel(coord.px, coord.py)) renderAll(); }
    function onEnd() { isDrawing = false; isPanning = false; pixelCanvasWrapper.classList.remove("panning"); }
    canvas.addEventListener("contextmenu", function(e) {
      e.preventDefault();
      var coord = getPixel(e); if (!coord || !editImageData) return;
      var idx = (coord.py * w + coord.px) * 4;
      var r = editImageData.data[idx], g = editImageData.data[idx+1], b = editImageData.data[idx+2];
      var ct = getColorTable(currentBrand);
      var bead = findNearestBeadColor({ r: r, g: g, b: b }, ct);
      if (bead) { selectedBeadColor = { id: bead.id, name: bead.name, r: bead.r, g: bead.g, b: bead.b }; setTool("pencil"); renderBeadPalette(); updateColorIndicator(); }
    });
    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    // ---- 手机触控：单指拖拽 = 平移画布，点击 = 画像素，双指捏合 = 缩放 ----
    var _tx=0,_ty=0,_tm=false,_touchFired=false;
    canvas.addEventListener("touchstart", function(e) {
      _touchFired=true;
      if (e.touches.length >= 2) return;
      _tx=e.touches[0].clientX; _ty=e.touches[0].clientY; _tm=false;
    }, { passive: true });
    canvas.addEventListener("touchmove", function(e) {
      if (_pageLocked) e.preventDefault();
      if (e.touches.length >= 2) return;
      var cx=e.touches[0].clientX, cy=e.touches[0].clientY;
      var dx=cx-_tx, dy=cy-_ty;
      if (dx*dx+dy*dy > 16) {
        if (!_tm) { _tm=true; isPanning=true; panStartX=cx-panOffsetX; panStartY=cy-panOffsetY; pixelCanvasWrapper.classList.add("panning"); }
        panOffsetX=cx-panStartX; panOffsetY=cy-panStartY;
        var cn=pixelCanvasWrapper.querySelector("canvas");
        if (cn) { cn.style.left=(centerX+panOffsetX)+"px"; cn.style.top=(centerY+panOffsetY)+"px"; }
      }
    }, { passive: false });
    canvas.addEventListener("touchend", function(e) {
      if (_tm) { isPanning=false; pixelCanvasWrapper.classList.remove("panning"); }
      else {
        // 点击(轻触) = 画像素
        if (e.changedTouches) {
          var ce = e.changedTouches[0];
          var rect = canvas.getBoundingClientRect();
          var mx = ce.clientX - rect.left, my = ce.clientY - rect.top;
          var px = Math.floor(mx * w / rect.width), py = Math.floor(my * h / rect.height);
          if (px >= 0 && px < w && py >= 0 && py < h) {
            undoStack.push({data:cloneImageData(editImageData)});
            if (undoStack.length>30) undoStack.shift();
            if (currentTool==="fill" && selectedBeadColor) {
              var vd2=getViewData(); if (vd2&&floodFill(editImageData,vd2,px,py,selectedBeadColor)) renderAll();
            } else { if (paintPixel(px,py)) renderAll(); }
          }
        }
      }
    }, { passive: true });
    canvas.addEventListener("touchcancel", function() { isPanning=false; pixelCanvasWrapper.classList.remove("panning"); });
    // ---- 手机触控结束 ----
    canvas.addEventListener("mousemove", function(e) { var c = getPixel(e); if (c) setStatusPos(c.px, c.py); });
    canvas.addEventListener("mouseleave", function() { clearStatusPos(); });
  }

  // 平移边界限制 + 复位
  function applyPan() {
    var cnv = pixelCanvasWrapper.querySelector("canvas");
    if (!cnv) return;
    cnv.style.transform = "translate(" + panOffsetX + "px," + panOffsetY + "px)";
  }
  var resetBtn = document.getElementById("resetViewBtn");
  if (resetBtn) resetBtn.addEventListener("click", function() { panOffsetX=0; panOffsetY=0; if (editImageData) renderAll(); });

  // 锁定按钮
  var lockBtn = document.getElementById("lockBtn");
  if (lockBtn) {
    if (window.innerWidth <= 500) { lockBtn.style.display = ""; if(resetBtn) resetBtn.style.display = ""; }
    var _lockHandler = function(e) { if (_pageLocked) e.preventDefault(); };
    lockBtn.addEventListener("click", function() {
      _pageLocked = !_pageLocked;
      lockBtn.textContent = _pageLocked ? "🔒" : "🔓";
      lockBtn.title = _pageLocked ? "页面已锁定，点击解锁" : "锁定页面，防止误触翻页";
      // 锁定后阻止全文滚动
      if (_pageLocked) { document.addEventListener("touchmove", _lockHandler, { passive: false }); }
      else { document.removeEventListener("touchmove", _lockHandler); }
    });
  }

  undoBtn.addEventListener("click", function() {
    if (undoStack.length > 1) { undoStack.pop(); editImageData = cloneImageData(undoStack[undoStack.length - 1].data); renderAll(); }
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === " " || e.code === "Space") { isSpaceDown = true; e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { if (undoStack.length > 1) { e.preventDefault(); undoBtn.click(); } }
    if (!e.ctrlKey && !e.metaKey) { if (e.key === "b" || e.key === "B") setTool("pencil"); if (e.key === "e" || e.key === "E") setTool("eraser");
    if (e.key === "f" || e.key === "F") setTool("fill"); }
  });
  document.addEventListener("keyup", function(e) {
    if (e.key === " " || e.code === "Space") { isSpaceDown = false; pixelCanvasWrapper.classList.remove("panning"); }
  });

  function floodFill(imgData, viewData, sx, sy, fc) {
    if (!fc) return false;
    var w = imgData.width, h = imgData.height;
    var si = (sy * w + sx) * 4;
    var tr = viewData.data[si], tg = viewData.data[si+1], tb = viewData.data[si+2];
    if (tr === fc.r && tg === fc.g && tb === fc.b) return false;
    var stack = [[sx, sy]], visited = new Uint8Array(w * h), changed = false;
    while (stack.length > 0) {
      var p = stack.pop(), x = p[0], y = p[1], pi = y * w + x;
      if (visited[pi]) continue; visited[pi] = 1;
      var idx = pi * 4;
      if (viewData.data[idx] !== tr || viewData.data[idx+1] !== tg || viewData.data[idx+2] !== tb) continue;
      imgData.data[idx] = fc.r; imgData.data[idx+1] = fc.g; imgData.data[idx+2] = fc.b; changed = true;
      if (x > 0) stack.push([x-1, y]);
      if (x < w-1) stack.push([x+1, y]);
      if (y > 0) stack.push([x, y-1]);
      if (y < h-1) stack.push([x, y+1]);
    }
    return changed;
  }

  exportPngBtn.addEventListener("click", function() { try { var d = getViewData(); if (d) exportPNG(d); else alert("请先生成像素画"); } catch(e) { alert("导出PNG失败: " + e.message); } });
  exportPdfBtn.addEventListener("click", function() {
    try {
      if (!hasJsPdf()) { alert("jsPDF库尚未加载完成，请稍后重试"); return; }
      var d = getViewData(); if (d) exportPDF(d, buildColorStats(d, getColorTable(currentBrand)), "Combined"); else alert("请先生成像素画");
    } catch(e) { alert("导出PDF失败: " + e.message); }
  });
  exportCsvBtn.addEventListener("click", function() { try { var d = getViewData(); if (d) exportCSV(buildColorStats(d, getColorTable(currentBrand)), d.width * d.height); else alert("请先生成像素画"); } catch(e) { alert("导出CSV失败: " + e.message); } });

  function buildColorStats(imageData, ct) {
    var w = imageData.width, h = imageData.height, d = imageData.data;
    var lookup = {}; for (var ci = 0; ci < ct.length; ci++) lookup[ct[ci].r + "," + ct[ci].g + "," + ct[ci].b] = ct[ci];
    var usage = {}; var key;
    for (var i = 0; i < w * h; i++) { key = d[i*4] + "," + d[i*4+1] + "," + d[i*4+2]; usage[key] = (usage[key] || 0) + 1; }
    var result = [];
    for (key in usage) { var p = key.split(",");
      result.push({ bead: lookup[key] || { id: "?", name: "Custom", r: +p[0], g: +p[1], b: +p[2] }, count: usage[key] });
    }
    return result.sort(function(a, b) { return b.count - a.count; });
  }

  function zoomIn() {
    var lv = [0,4,6,8,10,14,20,30,40];
    var idx = lv.indexOf(currentZoom);
    if (idx < lv.length - 1) currentZoom = lv[idx + 1];
    if (editImageData) renderAll();
  }
  function zoomOut() {
    var lv = [0,4,6,8,10,14,20];
    var idx = lv.indexOf(currentZoom);
    if (idx > 0) currentZoom = lv[idx - 1];
    else currentZoom = 0;
    if (editImageData) { renderAll(); }
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function formatSize(b) { if (b < 1024) return b + " B"; if (b < 1048576) return (b / 1024).toFixed(1) + " KB"; return (b / 1048576).toFixed(1) + " MB"; }

  var rt;
  window.addEventListener("resize", function() { clearTimeout(rt); rt = setTimeout(function() { if (editImageData) renderAll(); }, 300); });

// ===== Page Switch =====
var _pageIdx = 0;
var _pageAnim = false;
var _pageLocked = false;
var _touchY = 0;

document.addEventListener("touchstart", function(e) { _touchY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", function(e) {
  if (_pageAnim || _pageLocked) return;
  if (window.innerWidth > 500) return;
  // Upload page: swipe down -> editor
  if (_pageIdx === 0) {
    var dy = _touchY - e.changedTouches[0].clientY;
    if (dy > 30) {
      switchToPage(1);
    }
    return;
  }
  // Editor page: swipe up at top -> upload
  if (_pageIdx === 1) {
    var pe = document.getElementById("pageEditor");
    if (pe && pe.scrollTop > 0) return;
    var dy = _touchY - e.changedTouches[0].clientY;
    if (dy < -30) {
      switchToPage(0);
    }
    return;
  }
}, { passive: true });

function switchToPage(idx) {
  if (_pageAnim || idx === _pageIdx) return;
  var stack = document.getElementById("pageStack");
  if (!stack || idx < 0 || idx > 1) return;
  _pageAnim = true;
  _pageIdx = idx;
  stack.classList.toggle("at-editor", idx === 1);
  setTimeout(function() { _pageAnim = false; }, 500);
}

document.addEventListener("wheel", function(e) {
  if (_pageLocked) return;
  if (_pageIdx === 0) {
    // Upload page: scroll down → editor
    if (e.deltaY > 0 && !_pageAnim && originalImgData) {
      _pageAnim = true;
      _pageIdx = 1;
      var stack = document.getElementById("pageStack");
      if (stack) stack.classList.toggle("at-editor", true);
      setTimeout(function() { _pageAnim = false; }, 500);
    }
    return;
  }
  // Editor page: zoom on canvas, switch on background
  if (_pageIdx === 1) {
    var cw = document.getElementById("pixelCanvasWrapper");
    if (cw && cw.contains(e.target)) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
      return;
    }
    // Don't switch pages when scrolling inside content area
    var ra = document.getElementById("resultArea");
    if (ra && ra.contains(e.target)) {
      // On mobile: scrolling up at top of page → go back to upload
      if (e.deltaY < 0 && window.innerWidth <= 500) {
        var pe = document.getElementById("pageEditor");
        if (pe && pe.scrollTop <= 0) {
          e.preventDefault();
          if (!_pageAnim) { _pageAnim = true; _pageIdx = 0; var s = document.getElementById("pageStack"); if (s) s.classList.toggle("at-editor", false); setTimeout(function() { _pageAnim = false; }, 500); }
          return;
        }
      }
      return;
    }
    // Outside content area → switch back to upload
    if (!_pageAnim) {
      _pageAnim = true;
      _pageIdx = 0;
      var stack = document.getElementById("pageStack");
      if (stack) stack.classList.toggle("at-editor", false);
      setTimeout(function() { _pageAnim = false; }, 500);
    }
    return;
  }
}, { passive: false });

  window._app = {};
  Object.defineProperty(window._app, "editImageData", { get: function() { return editImageData; }, set: function(v) { editImageData = v; } });
  Object.defineProperty(window._app, "currentBrand", { get: function() { return currentBrand; }, set: function(v) { currentBrand = v; } });
  Object.defineProperty(window._app, "undoStack", { get: function() { return undoStack; }, set: function(v) { undoStack = v; } });
  window._cloneImageData = function(v) { return cloneImageData(v); };
  window._renderAll = function() { renderAll(); };
  window._switchToPage = function(i) { switchToPage(i); };

}();
