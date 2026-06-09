/**
 * exporter.js - 导出功能 (PNG / PDF / CSV)
 */

/**
 * 尝试用 Web Share API 分享文件（手机端），失败则回到下载
 */
function tryShareOrDownload(blob, fileName, mimeType) {
  var file = new File([blob], fileName, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: fileName }).catch(function(){});
    return true;
  }
  // Fallback: create download link
  var link = document.createElement("a");
  link.download = fileName;
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
  return false;
}

/**
 * 导出 PNG (真实像素尺寸，非放大尺寸)
 * @param {ImageData} pixelData
 */
function exportPNG(pixelData) {
  var canvas = document.createElement("canvas");
  canvas.width = pixelData.width;
  canvas.height = pixelData.height;
  var ctx = canvas.getContext("2d");
  ctx.putImageData(pixelData, 0, 0);
  
  canvas.toBlob(function(blob) {
    tryShareOrDownload(blob, "pixel-art.png", "image/png");
  }, "image/png");
}

/**
 * 导出拼豆图纸 PDF
 * A4 格式，每个像素对应一个带颜色代码的方格
 * @param {ImageData} pixelData - 像素数据
 * @param {Array} colorMap - 颜色统计
 * @param {string} brand - 品牌名
 */
function exportPDF(pixelData, colorMap, brand) {
  const { jsPDF } = window.jspdf;
  const { width, height, data } = pixelData;
  
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "mm",
    format: "a4"
  });
  
  const pageW = width > height ? 297 : 210;
  const pageH = width > height ? 210 : 297;
  const margin = 10;
  
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - 8;
  const cellW = availW / width;
  const cellH = availH / height;
  const cellSize = Math.min(cellW, cellH, 4);
  
  const drawW = cellSize * width;
  const drawH = cellSize * height;
  const offsetX = (pageW - drawW) / 2;
  const offsetY = margin + 4;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;
      
      pdf.setFillColor(r, g, b);
      pdf.rect(px, py, cellSize, cellSize, "F");
      
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
      if (brightness > 180) {
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.1);
        pdf.rect(px, py, cellSize, cellSize, "S");
      }
    }
  }
  
  if (cellSize >= 2) {
    pdf.setFontSize(Math.min(cellSize * 0.7, 2.5));
    const beadIdMap = new Map();
    for (const entry of colorMap) {
      const key = entry.bead.r + "," + entry.bead.g + "," + entry.bead.b;
      beadIdMap.set(key, entry.bead.id);
    }
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const key = data[idx] + "," + data[idx+1] + "," + data[idx+2];
        const beadId = beadIdMap.get(key);
        if (!beadId) continue;
        
        const brightness = (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
        pdf.setTextColor(brightness > 140 ? 50 : 255);
        
        const px = offsetX + x * cellSize;
        const py = offsetY + y * cellSize + cellSize * 0.8;
        pdf.text(beadId, px + cellSize/2, py, { align: "center", baseline: "middle" });
      }
    }
  }
  
  let legendY = offsetY + drawH + 6;
  pdf.setFontSize(6);
  pdf.setTextColor(100);
  pdf.text(brand.charAt(0).toUpperCase() + brand.slice(1) + " Beads - " + width + "x" + height, margin, legendY);
  
  legendY += 4;
  pdf.setFontSize(5);
  
  const legendPerRow = Math.min(colorMap.length, Math.floor((pageW - margin * 2) / 24));
  const legendSize = 3;
  
  for (let i = 0; i < colorMap.length; i++) {
    const entry = colorMap[i];
    const col = i % legendPerRow;
    const row = Math.floor(i / legendPerRow);
    
    const lx = margin + col * (pageW / legendPerRow);
    const ly = legendY + row * 5;
    
    pdf.setFillColor(entry.bead.r, entry.bead.g, entry.bead.b);
    pdf.rect(lx, ly, legendSize, legendSize, "F");
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.1);
    pdf.rect(lx, ly, legendSize, legendSize, "S");
    
    pdf.setTextColor(120);
    pdf.text("#" + entry.bead.id + " " + entry.bead.name + " x" + entry.count, lx + legendSize + 1, ly + legendSize - 0.5);
  }
  
  // Use share on mobile, save on desktop
  var pdfBlob = pdf.output("blob");
  tryShareOrDownload(pdfBlob, "perler-beads-chart.pdf", "application/pdf");
}

/**
 * 导出颜色清单 CSV
 * @param {Array} colorMap - 颜色统计
 * @param {number} totalPixels - 总像素数
 */
function exportCSV(colorMap, totalPixels) {
  const BOM = "\uFEFF";
  let csv = BOM + "颜色名称,豆子编号,R,G,B,所需数量\n";
  
  for (const entry of colorMap) {
    csv += entry.bead.name + ",#" + entry.bead.id + "," + entry.bead.r + "," + entry.bead.g + "," + entry.bead.b + "," + entry.count + "\n";
  }
  
  csv += ",,,合计," + totalPixels + "\n";
  
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  tryShareOrDownload(blob, "bead-color-list.csv", "text/csv");
}
