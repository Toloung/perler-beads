import { DEFAULT_DOWNLOAD_OUTPUT_SCALE, GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getDisplayColorKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';

// 用于获取对比色的工具函数 - 从page.tsx复制
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // Default to black
  // Simple brightness check (Luma formula Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // Dark background -> white text, Light background -> black text
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 用于排序颜色键的函数 - 从page.tsx复制
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

function getOutputScale(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DOWNLOAD_OUTPUT_SCALE;
  return Math.min(3, Math.max(1, Math.round(value || DEFAULT_DOWNLOAD_OUTPUT_SCALE)));
}

const CSV_TRANSPARENT_TOKEN = '__TRANSPARENT__';
const LEGACY_TRANSPARENT_TOKENS = new Set(['TRANSPARENT', CSV_TRANSPARENT_TOKEN, 'ERASE']);

function normalizeHexForCsv(value?: string): string {
  const normalized = (value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : '#FFFFFF';
}

function drawTransparentCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  outputScale: number
) {
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(x, y, size, size);

  const stripeGap = Math.max(8, Math.floor(size / 3));
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = Math.max(1, outputScale * 0.7);
  for (let offset = -size; offset <= size; offset += stripeGap) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + size);
    ctx.lineTo(x + offset + size, y);
    ctx.stroke();
  }
}

// 导出CSV hex数据的函数
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("导出失败: 映射数据或尺寸无效。");
    alert("无法导出CSV，数据未生成或无效。");
    return;
  }

  const { N, M } = gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
      if (cellData && !cellData.isExternal) {
        // 内部单元格，记录hex颜色值
        rowData.push(normalizeHexForCsv(cellData.color));
      } else {
        // 外部单元格或空白，使用特殊标记
        rowData.push(CSV_TRANSPARENT_TOKEN);
      }
    }
    csvLines.push(rowData.join(','));
  }

  // 创建CSV内容
  const csvContent = csvLines.join('\n');
  
  // 创建并下载CSV文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放URL对象
  URL.revokeObjectURL(url);
  
  console.log("CSV数据导出完成");
}

// 导入CSV hex数据的函数
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            const upperCellValue = cellValue.toUpperCase();
            if (LEGACY_TRANSPARENT_TOKENS.has(upperCellValue) || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: CSV_TRANSPARENT_TOKEN,
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

// 下载图片的主函数
export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}): Promise<void> {
  const downloadTarget = options.downloadTarget || 'image';

  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0) {
    console.error("下载失败: 映射数据或尺寸无效。");
    alert("无法下载图纸，数据未生成或无效。");
    return;
  }
  if (downloadTarget === 'csv') {
    exportCsvData({
      mappedPixelData,
      gridDimensions,
      selectedColorSystem
    });
    return;
  }

  if (activeBeadPalette.length === 0) {
    console.error("下载失败: 色板数据无效。");
    alert("无法下载图纸，色板数据未生成或无效。");
    return;
  }

  if (!colorCounts) {
    console.error("下载失败: 色号统计数据无效。");
    alert("无法下载图纸，色号统计数据未生成或无效。");
    return;
  }
  
  // 主要下载处理函数
  const processDownload = () => {
    const { N, M } = gridDimensions; // 此时已确保gridDimensions不为null
    const outputScale = getOutputScale(options.outputScale);
    const downloadCellSize = 30 * outputScale;
  
    // 从下载选项中获取设置
    const {
      showGrid,
      gridInterval,
      showCoordinates,
      gridLineColor,
      includeStats,
    } = options;
    const showCellNumbers = true;
    const chartVariantLabel = '有色 + 色号版';
  
    // 设置边距空间用于坐标轴标注（如果需要）
    const axisLabelSize = showCoordinates ? Math.max(42, Math.floor(downloadCellSize * 0.78)) : 0;
    
    // 定义统计区域的基本参数
    const statsPadding = Math.max(28, Math.floor(22 * outputScale));
    let statsHeight = 0;
    
    // 预先计算用于字体大小的变量
    const preCalcWidth = N * downloadCellSize + axisLabelSize;
    const preCalcAvailableWidth = preCalcWidth - (statsPadding * 2);
    
    // 计算字体大小 - 与颜色统计区域保持一致
    const baseStatsFontSize = 13;
    const widthFactor = Math.max(0, preCalcAvailableWidth - 350) / 600;
    const statsFontSize = Math.floor(baseStatsFontSize + (widthFactor * 10));
    const statsColorKeys = colorCounts
      ? Object.keys(colorCounts).sort((a, b) => {
          const countDiff = colorCounts[a].count - colorCounts[b].count;
          return countDiff || sortColorKeys(a, b);
        })
      : [];
    
    // 计算额外边距，确保坐标数字完全显示（四边都需要）
    const extraLeftMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0; // 左侧额外边距
    const extraRightMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0; // 右侧额外边距
    const extraTopMargin = showCoordinates ? Math.max(15, statsFontSize) : 0; // 顶部额外边距
    const extraBottomMargin = showCoordinates ? Math.max(15, statsFontSize) : 0; // 底部额外边距
    
    // 计算网格尺寸
    const gridWidth = N * downloadCellSize;
    const gridHeight = M * downloadCellSize;
    
    // 不预留任何水印或社交平台标识区域。
    const xiaohongshuAreaHeight = 0;
  
    // 计算标题栏高度（根据图片大小自动调整）
    const baseTitleBarHeight = 104;
    
    // 先计算一个初始下载宽度来确定缩放比例
    const initialWidth = gridWidth + axisLabelSize + extraLeftMargin;
    // 使用总宽度而不是单元格大小来计算比例，确保字体在大尺寸图片上也足够大
    const titleBarScale = Math.max(1.0, Math.min(2.0, initialWidth / 1000)); // 更激进的缩放策略
    const titleBarHeight = Math.floor(baseTitleBarHeight * titleBarScale);
    
    // 计算标题文字大小 - 与总体宽度相关而不是单元格大小
    const titleFontSize = Math.max(38, Math.floor(38 * titleBarScale));
    
    // 计算参考图风格的用料清单卡片区域。
    if (includeStats && colorCounts) {
      const statsAvailableWidth = preCalcWidth;
      const cardGap = Math.max(12, Math.floor(8 * outputScale));
      const targetCardWidth = Math.max(190, Math.floor(180 * outputScale));
      const cardColumns = Math.max(1, Math.min(10, statsColorKeys.length || 1, Math.floor((statsAvailableWidth + cardGap) / (targetCardWidth + cardGap))));
      const cardRows = Math.ceil(statsColorKeys.length / cardColumns);
      const cardHeight = Math.max(126, Math.floor(116 * outputScale));
      const titleHeight = Math.max(42, Math.floor(30 * outputScale));
      const statsTopMargin = Math.max(34, Math.floor(22 * outputScale));
      const footerHeight = Math.max(20, Math.floor(12 * outputScale));

      statsHeight = statsTopMargin + titleHeight + (cardRows * cardHeight) + (Math.max(0, cardRows - 1) * cardGap) + footerHeight + statsPadding;
    }
  
    // 调整画布大小，包含标题栏、坐标轴、统计区域和小红书标识区域（四边都有坐标）
    const downloadWidth = gridWidth + (axisLabelSize * 2) + extraLeftMargin + extraRightMargin;
    if (includeStats && colorCounts) {
      const cardGap = Math.max(12, Math.floor(8 * outputScale));
      const availableStatsWidth = downloadWidth - (statsPadding * 2);
      const targetCardWidth = Math.max(190, Math.floor(180 * outputScale));
      const cardColumns = Math.max(1, Math.min(10, statsColorKeys.length || 1, Math.floor((availableStatsWidth + cardGap) / (targetCardWidth + cardGap))));
      const cardRows = Math.ceil(statsColorKeys.length / cardColumns);
      const cardHeight = Math.max(126, Math.floor(116 * outputScale));
      const titleHeight = Math.max(42, Math.floor(30 * outputScale));
      const statsTopMargin = Math.max(34, Math.floor(22 * outputScale));
      const footerHeight = Math.max(20, Math.floor(12 * outputScale));

      statsHeight = statsTopMargin + titleHeight + (cardRows * cardHeight) + (Math.max(0, cardRows - 1) * cardGap) + footerHeight + statsPadding;
    }
    let downloadHeight = titleBarHeight + gridHeight + (axisLabelSize * 2) + statsHeight + extraTopMargin + extraBottomMargin + xiaohongshuAreaHeight;
  
    let downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = downloadWidth;
    downloadCanvas.height = downloadHeight;
    const context = downloadCanvas.getContext('2d');
    if (!context) {
      console.error("下载失败: 无法创建临时 Canvas Context。");
      alert("无法下载图纸。");
      return;
    }
    
    // 使用非空的context变量
    let ctx = context;
    ctx.imageSmoothingEnabled = false;
  
    // 设置打印友好的纸面背景
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, downloadWidth, downloadHeight);
  
    // 参考图纸页眉：大号色号系统 + 基础图纸信息。
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, downloadWidth, titleBarHeight);
    ctx.fillStyle = '#D97757';
    ctx.fillRect(0, 0, downloadWidth, Math.max(4, Math.floor(5 * titleBarScale)));

    const headerPadding = Math.max(24, Math.floor(titleBarHeight * 0.22));
    const systemFontSize = Math.max(46, Math.floor(titleFontSize * 1.34));
    const suffixFontSize = Math.max(28, Math.floor(titleFontSize * 0.7));
    const metaFontSize = Math.max(18, Math.floor(titleFontSize * 0.44));

    ctx.fillStyle = '#6F8758';
    ctx.font = `800 ${systemFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const systemY = titleBarHeight * 0.56;
    ctx.fillText(selectedColorSystem, headerPadding, systemY);

    const systemTextWidth = ctx.measureText(selectedColorSystem).width;
    ctx.fillStyle = '#A8A29E';
    ctx.font = `600 ${suffixFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText('色号', headerPadding + systemTextWidth + Math.max(10, suffixFontSize * 0.35), systemY + Math.max(2, suffixFontSize * 0.08));

    ctx.fillStyle = '#64748B';
    ctx.font = `700 ${metaFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(chartVariantLabel, headerPadding, titleBarHeight * 0.83);

    const metaItems = downloadWidth >= 620
      ? [`${N} x ${M}`, `${totalBeadCount} 颗`, `${outputScale}x`]
      : [`${N} x ${M}`];
    ctx.font = `700 ${metaFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    let metaRight = downloadWidth - headerPadding;
    metaItems.forEach((item) => {
      const chipPaddingX = Math.max(10, metaFontSize * 0.8);
      const chipWidth = ctx.measureText(item).width + chipPaddingX * 2;
      const chipHeight = Math.max(32, metaFontSize * 1.85);
      const chipY = titleBarHeight * 0.5 - chipHeight / 2;

      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.roundRect(metaRight - chipWidth, chipY, chipWidth, chipHeight, chipHeight / 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.textBaseline = 'middle';
      ctx.fillText(item, metaRight - chipPaddingX, titleBarHeight / 2);
      metaRight -= chipWidth + Math.max(8, metaFontSize * 0.7);
    });

    const separatorY = titleBarHeight - 1;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, separatorY);
    ctx.lineTo(downloadWidth, separatorY);
    ctx.stroke();
  
    console.log(`Generating download grid image: ${downloadWidth}x${downloadHeight}`);
    const fontSize = Math.max(8, Math.floor(downloadCellSize * 0.4));
    const fineLineWidth = Math.max(1, outputScale);
    const cellBorderWidth = Math.max(0.75, outputScale * 0.6);
    const majorGridLineWidth = Math.max(1.5, outputScale * 1.25);
    
    // 如果需要，先绘制坐标轴和网格背景
    if (showCoordinates) {
      // 绘制坐标轴背景
      ctx.fillStyle = '#F5F5F5'; // 浅灰色背景
      // 横轴背景 (顶部)
      ctx.fillRect(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin, gridWidth, axisLabelSize);
      // 横轴背景 (底部)
      ctx.fillRect(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight, gridWidth, axisLabelSize);
      // 纵轴背景 (左侧)
      ctx.fillRect(extraLeftMargin, titleBarHeight + extraTopMargin + axisLabelSize, axisLabelSize, gridHeight);
      // 纵轴背景 (右侧)
      ctx.fillRect(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize, axisLabelSize, gridHeight);
      
      // 绘制坐标轴数字
      ctx.fillStyle = '#333333'; // 坐标数字颜色
      const axisFontSize = Math.max(18, Math.floor(downloadCellSize * 0.34));
      ctx.font = `700 ${axisFontSize}px system-ui, -apple-system, sans-serif`;

      // X轴（顶部）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        if ((i + 1) % gridInterval === 0 || i === 0 || i === N - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在轴线之上，考虑额外边距
          const numX = extraLeftMargin + axisLabelSize + (i * downloadCellSize) + (downloadCellSize / 2);
          const numY = titleBarHeight + extraTopMargin + (axisLabelSize / 2);
          ctx.fillText((i + 1).toString(), numX, numY);
        }
      }
      
      // X轴（底部）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        if ((i + 1) % gridInterval === 0 || i === 0 || i === N - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在底部轴线上
          const numX = extraLeftMargin + axisLabelSize + (i * downloadCellSize) + (downloadCellSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + gridHeight + (axisLabelSize / 2);
          ctx.fillText((i + 1).toString(), numX, numY);
        }
      }
      
      // Y轴（左侧）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < M; j++) {
        if ((j + 1) % gridInterval === 0 || j === 0 || j === M - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在轴线之左
          const numX = extraLeftMargin + (axisLabelSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + (j * downloadCellSize) + (downloadCellSize / 2);
          ctx.fillText((j + 1).toString(), numX, numY);
        }
      }
      
      // Y轴（右侧）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < M; j++) {
        if ((j + 1) % gridInterval === 0 || j === 0 || j === M - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在右侧轴线上
          const numX = extraLeftMargin + axisLabelSize + gridWidth + (axisLabelSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + (j * downloadCellSize) + (downloadCellSize / 2);
          ctx.fillText((j + 1).toString(), numX, numY);
        }
      }
      
      // 绘制坐标轴边框
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = fineLineWidth;
      // 顶部横轴底边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.stroke();
      // 底部横轴顶边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
      // 左侧纵轴右边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
      // 右侧纵轴左边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
    }
    
    // 恢复默认文本对齐和基线，为后续绘制做准备
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 设置用于绘制单元格内容的字体
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 绘制所有单元格
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const cellData = mappedPixelData[j][i];
        // 计算绘制位置，考虑额外边距和标题栏高度
        const drawX = extraLeftMargin + i * downloadCellSize + axisLabelSize;
        const drawY = titleBarHeight + extraTopMargin + j * downloadCellSize + axisLabelSize;

        // 根据是否是外部背景确定填充颜色
        if (cellData && !cellData.isExternal) {
          // 内部单元格：使用珠子颜色填充并绘制文本
          const cellColor = cellData.color || '#FFFFFF';

          ctx.fillStyle = cellColor;
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);

          if (showCellNumbers) {
            const cellKey = getDisplayColorKey(cellData.color || '#FFFFFF', selectedColorSystem);
            ctx.fillStyle = getContrastColor(cellColor);
            ctx.fillText(cellKey, drawX + downloadCellSize / 2, drawY + downloadCellSize / 2);
          }
        } else {
          // 透明/外部区域使用浅色斜线底，避免和白色珠子混淆。
          drawTransparentCell(ctx, drawX, drawY, downloadCellSize, outputScale);
        }

        // 绘制所有单元格的边框
        ctx.strokeStyle = '#DDDDDD'; // 浅色线条作为基础网格
        ctx.lineWidth = cellBorderWidth;
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, downloadCellSize, downloadCellSize);
      }
    }

    // 如果需要，绘制分隔网格线
    if (showGrid) {
      ctx.strokeStyle = gridLineColor; // 使用用户选择的颜色
      ctx.lineWidth = majorGridLineWidth;
      
      // 绘制垂直分隔线 - 在单元格之间而不是边框上
      for (let i = gridInterval; i < N; i += gridInterval) {
        const lineX = extraLeftMargin + i * downloadCellSize + axisLabelSize;
        ctx.beginPath();
        ctx.moveTo(lineX, titleBarHeight + extraTopMargin + axisLabelSize);
        ctx.lineTo(lineX, titleBarHeight + extraTopMargin + axisLabelSize + M * downloadCellSize);
        ctx.stroke();
      }
      
      // 绘制水平分隔线 - 在单元格之间而不是边框上
      for (let j = gridInterval; j < M; j += gridInterval) {
        const lineY = titleBarHeight + extraTopMargin + j * downloadCellSize + axisLabelSize;
        ctx.beginPath();
        ctx.moveTo(extraLeftMargin + axisLabelSize, lineY);
        ctx.lineTo(extraLeftMargin + axisLabelSize + N * downloadCellSize, lineY);
        ctx.stroke();
      }
    }

    // 绘制整个网格区域的主边框
    ctx.strokeStyle = '#000000'; // 黑色边框
    ctx.lineWidth = majorGridLineWidth;
    ctx.strokeRect(
      extraLeftMargin + axisLabelSize + 0.5, 
      titleBarHeight + extraTopMargin + axisLabelSize + 0.5, 
      N * downloadCellSize, 
      M * downloadCellSize
    );

    // 绘制统计信息
    if (includeStats && colorCounts) {
      const colorKeys = statsColorKeys;
      const cardGap = Math.max(12, Math.floor(8 * outputScale));
      const titleHeight = Math.max(42, Math.floor(30 * outputScale));
      const cardHeight = Math.max(126, Math.floor(116 * outputScale));
      const statsTopMargin = Math.max(34, Math.floor(22 * outputScale));
      const statsY = titleBarHeight + extraTopMargin + M * downloadCellSize + (axisLabelSize * 2) + statsPadding + statsTopMargin;
      const availableStatsWidth = downloadWidth - (statsPadding * 2);
      const targetCardWidth = Math.max(190, Math.floor(180 * outputScale));
      const renderNumColumns = Math.max(1, Math.min(10, colorKeys.length || 1, Math.floor((availableStatsWidth + cardGap) / (targetCardWidth + cardGap))));
      const cardWidth = Math.min(targetCardWidth, Math.floor((availableStatsWidth - (renderNumColumns - 1) * cardGap) / renderNumColumns));
      const statsTitleFontSize = Math.max(32, Math.floor(24 * outputScale));
      const cardKeyFontSize = Math.max(32, Math.floor(24 * outputScale));
      const cardCountFontSize = Math.max(28, Math.floor(21 * outputScale));

      ctx.fillStyle = '#111827';
      ctx.font = `800 ${statsTitleFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('用料清单', statsPadding, statsY + titleHeight * 0.34);

      ctx.font = `800 ${statsTitleFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`共 ${totalBeadCount.toLocaleString()} 颗`, downloadWidth - statsPadding, statsY + titleHeight * 0.34);

      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = Math.max(1, outputScale);
      ctx.beginPath();
      ctx.moveTo(statsPadding, statsY + titleHeight * 0.72);
      ctx.lineTo(downloadWidth - statsPadding, statsY + titleHeight * 0.72);
      ctx.stroke();

      colorKeys.forEach((key, index) => {
        const rowIndex = Math.floor(index / renderNumColumns);
        const colIndex = index % renderNumColumns;
        const itemX = statsPadding + colIndex * (cardWidth + cardGap);
        const itemY = statsY + titleHeight + rowIndex * (cardHeight + cardGap);
        const cellData = colorCounts[key];
        const cardRadius = Math.max(8, Math.floor(5 * outputScale));
        const colorBlockHeight = Math.floor(cardHeight * 0.64);
        const displayKey = getColorKeyByHex(key, selectedColorSystem);

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(itemX, itemY, cardWidth, cardHeight, cardRadius);
        ctx.fill();
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = Math.max(1, outputScale * 0.75);
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(itemX, itemY, cardWidth, colorBlockHeight, cardRadius);
        ctx.clip();
        ctx.fillStyle = cellData.color;
        ctx.fillRect(itemX, itemY, cardWidth, colorBlockHeight);
        ctx.restore();

        if (cellData.color.toUpperCase() === '#FFFFFF') {
          ctx.strokeStyle = '#CBD5E1';
          ctx.strokeRect(itemX + 0.5, itemY + 0.5, cardWidth - 1, colorBlockHeight - 1);
        }

        ctx.fillStyle = getContrastColor(cellData.color);
        ctx.font = `800 ${cardKeyFontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayKey, itemX + cardWidth / 2, itemY + colorBlockHeight / 2);

        ctx.fillStyle = '#111827';
        ctx.font = `800 ${cardCountFontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(cellData.count.toLocaleString(), itemX + cardWidth / 2, itemY + colorBlockHeight + (cardHeight - colorBlockHeight) / 2);
      });
      
      const numRows = Math.ceil(colorKeys.length / renderNumColumns);
      const footerHeight = Math.max(20, Math.floor(12 * outputScale));
      statsHeight = statsTopMargin + titleHeight + (numRows * cardHeight) + (Math.max(0, numRows - 1) * cardGap) + footerHeight + statsPadding;
    }

    // 重新计算画布高度并调整
    if (includeStats && colorCounts) {
      // 调整画布大小，包含计算后的统计区域和小红书标识区域
      const newDownloadHeight = titleBarHeight + extraTopMargin + M * downloadCellSize + (axisLabelSize * 2) + statsHeight + extraBottomMargin + xiaohongshuAreaHeight;
      
      if (downloadHeight !== newDownloadHeight) {
        // 如果高度变化了，需要创建新的画布并复制当前内容
        const newCanvas = document.createElement('canvas');
        newCanvas.width = downloadWidth;
        newCanvas.height = newDownloadHeight;
        const newContext = newCanvas.getContext('2d');
        
        if (newContext) {
          // 复制原画布内容
          newContext.drawImage(downloadCanvas, 0, 0);
          
          // 更新画布和上下文引用
          downloadCanvas = newCanvas;
          ctx = newContext;
          ctx.imageSmoothingEnabled = false;
          
          // 更新高度
          downloadHeight = newDownloadHeight;
        }
      }
    }

    try {
      const fileName = showCellNumbers
        ? `bead-grid-${N}x${M}-${outputScale}x-keys-palette_${selectedColorSystem}.png`
        : `bead-grid-${N}x${M}-${outputScale}x-pixel-palette_${selectedColorSystem}.png`;
      downloadCanvas.toBlob((blob) => {
        if (!blob) {
          alert("无法生成高清 PNG，请降低导出画质后重试。");
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        console.log("Grid image download initiated.");
      }, 'image/png');
    } catch (e) {
      console.error("下载图纸失败:", e);
      alert("无法生成图纸下载链接。");
    }
  };
  
  processDownload();
} 
