'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { GridSelection } from '../utils/gridEditing';

interface PixelatedPreviewCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  activeSelection?: GridSelection | null;
  isManualColoringMode: boolean;
  continuousManualInput?: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onInteraction: (
    clientX: number,
    clientY: number,
    pageX: number,
    pageY: number,
    isClick: boolean,
    isTouchEnd?: boolean
  ) => void;
  onManualPointerCell?: (phase: 'down' | 'move' | 'up', row: number, col: number) => void;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
}

// 绘制像素化画布的函数
const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  highlightColorKey?: string | null,
  isHighlighting?: boolean,
  activeSelection?: GridSelection | null,
  hoverCell?: { row: number; col: number } | null
) => {
  if (!canvas || !dims || !dataToDraw) {
    console.warn("drawPixelatedCanvas: Missing required parameters");
    return;
  }
  
  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) {
    console.error("Failed to get 2D context for pixelated canvas");
    return;
  }

  // Respect current dark mode preference
  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  // Define colors based on mode
  const externalBackgroundColor = isDarkMode ? '#374151' : '#F3F4F6'; // gray-700 : gray-100
  const gridLineColor = isDarkMode ? '#4B5563' : '#DDDDDD'; // gray-600 : lighter gray

  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const cellWidthOutput = outputWidth / N;
  const cellHeightOutput = outputHeight / M;

  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.lineWidth = 0.5; // Keep line width thin

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const cellData = dataToDraw[j]?.[i];
      if (!cellData) continue;

      const drawX = i * cellWidthOutput;
      const drawY = j * cellHeightOutput;

      // Fill cell color using mode-specific background for external cells
      if (cellData.isExternal) {
        pixelatedCtx.fillStyle = externalBackgroundColor;
      } else {
        pixelatedCtx.fillStyle = cellData.color;
      }
      pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);

      // 如果正在高亮且当前单元格不是目标颜色，添加半透明黑色蒙版
      if (isHighlighting && highlightColorKey) {
        let shouldDim = false;
        
        if (cellData.isExternal) {
          // 外部单元格总是变深色（因为它们不是要高亮的颜色）
          shouldDim = true;
        } else {
          // 内部单元格：如果颜色不匹配则变深色
          shouldDim = cellData.color.toUpperCase() !== highlightColorKey.toUpperCase();
        }
        
        if (shouldDim) {
          pixelatedCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% 透明度的黑色蒙版
          pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);
        }
      }

      // Draw grid lines using mode-specific color
      pixelatedCtx.strokeStyle = gridLineColor;
      pixelatedCtx.strokeRect(drawX + 0.5, drawY + 0.5, cellWidthOutput, cellHeightOutput);
    }
  }

  if (activeSelection) {
    const startRow = Math.max(0, Math.min(M - 1, Math.min(activeSelection.startRow, activeSelection.endRow)));
    const endRow = Math.max(0, Math.min(M - 1, Math.max(activeSelection.startRow, activeSelection.endRow)));
    const startCol = Math.max(0, Math.min(N - 1, Math.min(activeSelection.startCol, activeSelection.endCol)));
    const endCol = Math.max(0, Math.min(N - 1, Math.max(activeSelection.startCol, activeSelection.endCol)));
    const x = startCol * cellWidthOutput;
    const y = startRow * cellHeightOutput;
    const width = (endCol - startCol + 1) * cellWidthOutput;
    const height = (endRow - startRow + 1) * cellHeightOutput;

    pixelatedCtx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    pixelatedCtx.fillRect(x, y, width, height);
    pixelatedCtx.strokeStyle = '#2563EB';
    pixelatedCtx.lineWidth = Math.max(2, Math.min(cellWidthOutput, cellHeightOutput) * 0.08);
    pixelatedCtx.setLineDash([Math.max(4, cellWidthOutput * 0.25), Math.max(3, cellWidthOutput * 0.18)]);
    pixelatedCtx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
    pixelatedCtx.setLineDash([]);
  }

  if (hoverCell) {
    const { row, col } = hoverCell;
    if (row >= 0 && row < M && col >= 0 && col < N) {
      const x = col * cellWidthOutput;
      const y = row * cellHeightOutput;
      pixelatedCtx.fillStyle = 'rgba(217, 119, 87, 0.16)';
      pixelatedCtx.fillRect(x, y, cellWidthOutput, cellHeightOutput);
      pixelatedCtx.strokeStyle = '#D97757';
      pixelatedCtx.lineWidth = Math.max(2, Math.min(cellWidthOutput, cellHeightOutput) * 0.12);
      pixelatedCtx.strokeRect(x + 1, y + 1, Math.max(0, cellWidthOutput - 2), Math.max(0, cellHeightOutput - 2));
    }
  }
};

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  activeSelection,
  isManualColoringMode,
  continuousManualInput = false,
  canvasRef,
  onInteraction,
  onManualPointerCell,
  highlightColorKey,
  onHighlightComplete,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const isMousePaintingRef = useRef(false);
  const lastManualCellRef = useRef<{ row: number; col: number } | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const maxDimension = Math.max(N, M);
    const longEdge = maxDimension > 100
      ? Math.min(1200, Math.max(500, maxDimension * 6))
      : 500;
    const cellSize = longEdge / maxDimension;
    const nextWidth = Math.max(1, Math.round(N * cellSize));
    const nextHeight = Math.max(1, Math.round(M * cellSize));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    setDisplaySize((current) => (
      current?.width === nextWidth && current?.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight }
    ));
  }, [canvasRef, gridDimensions]);

  const canvasAspectRatio = gridDimensions ? `${gridDimensions.N} / ${gridDimensions.M}` : undefined;

  // Effect to detect dark mode changes and update state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark');
        // Only update state if it actually changes
        if (isDark !== darkModeState) {
            setDarkModeState(isDark);
        }
    };

    // Initial check
    checkDarkMode();

    // Use MutationObserver to watch for class changes on <html>
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Cleanup observer on component unmount
    return () => observer.disconnect();

  }, [darkModeState]); // Depend on darkModeState to re-run if needed externally

  // Update useEffect for drawing to depend on darkModeState as well
  useEffect(() => {
    // Ensure darkModeState is not null before drawing
    if (mappedPixelData && gridDimensions && canvasRef.current && darkModeState !== null) {
      console.log(`Redrawing canvas, dark mode: ${darkModeState}`); // Log redraw trigger
      drawPixelatedCanvas(mappedPixelData, canvasRef.current, gridDimensions, highlightColorKey, isHighlighting, activeSelection, isManualColoringMode ? hoverCell : null);
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, highlightColorKey, isHighlighting, activeSelection, hoverCell, isManualColoringMode]); // Add darkModeState dependency

  const getCellFromPointer = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !gridDimensions) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    const col = Math.floor(canvasX / (canvasRef.current.width / gridDimensions.N));
    const row = Math.floor(canvasY / (canvasRef.current.height / gridDimensions.M));

    if (row < 0 || col < 0 || row >= gridDimensions.M || col >= gridDimensions.N) return null;
    return { row, col };
  };

  // 处理高亮效果
  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      // 0.3秒后结束高亮
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  // --- 鼠标事件处理 ---
  
  // 鼠标移动时显示提示
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isManualColoringMode) {
      setHoverCell(getCellFromPointer(event.clientX, event.clientY));
    }

    if (isManualColoringMode && isMousePaintingRef.current && onManualPointerCell) {
      const cell = getCellFromPointer(event.clientX, event.clientY);
      if (cell) {
        lastManualCellRef.current = cell;
        onManualPointerCell('move', cell.row, cell.col);
      }
    }

    if (isManualColoringMode && continuousManualInput && isMousePaintingRef.current) {
      onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, true);
      return;
    }

    // 只有在非手动模式下才通过mousemove显示tooltip，避免干扰手动上色
    if (!isManualColoringMode) {
        onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
    }
  };

  // 鼠标离开时隐藏提示
  const handleMouseLeave = () => {
    isMousePaintingRef.current = false;
    setHoverCell(null);
    // 鼠标离开时总是隐藏tooltip
    onInteraction(0, 0, 0, 0, false, true);
  };

  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isManualColoringMode && onManualPointerCell) {
      const cell = getCellFromPointer(event.clientX, event.clientY);
      if (cell) {
        lastManualCellRef.current = cell;
        onManualPointerCell('down', cell.row, cell.col);
      }
    }

    if (isManualColoringMode && continuousManualInput) {
      isMousePaintingRef.current = true;
      onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, true);
    } else if (isManualColoringMode && onManualPointerCell) {
      isMousePaintingRef.current = true;
    }
  };

  const handleMouseUp = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isManualColoringMode && isMousePaintingRef.current && onManualPointerCell) {
      const cell = getCellFromPointer(event.clientX, event.clientY);
      if (cell) {
        lastManualCellRef.current = cell;
        onManualPointerCell('up', cell.row, cell.col);
      }
    }
    isMousePaintingRef.current = false;
  };

  // 鼠标点击处理（用于手动上色模式）
  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    // 鼠标点击行为保持不变：
    // 手动模式下：上色
    // 非手动模式下：切换tooltip
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, isManualColoringMode);
  };

  // --- 触摸事件处理 ---
  // 用于检测触摸移动的参考
  const handleTouchStart = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    // 记录起始位置并重置移动标志
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY
    };
    touchMovedRef.current = false;

    if (isManualColoringMode && onManualPointerCell) {
      const cell = getCellFromPointer(touch.clientX, touch.clientY);
      if (cell) {
        lastManualCellRef.current = cell;
        onManualPointerCell('down', cell.row, cell.col);
      }
    }

    // 在非手动模式下，触摸开始时仍然可以立即显示/切换tooltip，提供即时反馈
    if (!isManualColoringMode) {
        onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
    }
    // 注意：此处不再触发手动上色 (isClick: true)
  };
  
  // 触摸移动时检测是否需要隐藏提示
  const handleTouchMove = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch || !touchStartPosRef.current) return;

    if (isManualColoringMode && continuousManualInput) {
      event.preventDefault();
      touchMovedRef.current = true;
      if (onManualPointerCell) {
        const cell = getCellFromPointer(touch.clientX, touch.clientY);
        if (cell) {
          lastManualCellRef.current = cell;
          onManualPointerCell('move', cell.row, cell.col);
        }
      }
      onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, true);
      return;
    }

    if (isManualColoringMode && onManualPointerCell) {
      event.preventDefault();
      touchMovedRef.current = true;
      const cell = getCellFromPointer(touch.clientX, touch.clientY);
      if (cell) {
        lastManualCellRef.current = cell;
        onManualPointerCell('move', cell.row, cell.col);
      }
      return;
    }
    
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    
    // 如果移动超过阈值，则标记为已移动，并隐藏tooltip
    // 增加一个稍大的阈值，以更好地区分点击和微小的手指抖动/滑动意图
    if (!touchMovedRef.current && (dx > 10 || dy > 10)) {
      touchMovedRef.current = true;
      // 一旦确定是移动，就隐藏tooltip
      onInteraction(0, 0, 0, 0, false, true);
    }
  };
  
  // 触摸结束时不再自动隐藏提示框
  const handleTouchEnd = () => {
    if (isManualColoringMode && onManualPointerCell && touchStartPosRef.current) {
      const cell = lastManualCellRef.current || getCellFromPointer(touchStartPosRef.current.x, touchStartPosRef.current.y);
      if (cell) onManualPointerCell('up', cell.row, cell.col);
    }

    // 检查是否是手动模式，并且触摸没有移动（判定为点击）
    if (isManualColoringMode && !touchMovedRef.current && touchStartPosRef.current) {
      // 使用触摸开始时的坐标来执行上色操作
      const { x, y, pageX, pageY } = touchStartPosRef.current;
      onInteraction(x, y, pageX, pageY, true); // isClick: true 表示执行上色
    }
    // 如果是非手动模式下的点击 (isManualColoringMode=false, touchMovedRef=false)
    // Tooltip 的显示/隐藏切换已在 touchstart 处理，touchend 时无需额外操作

    // 重置触摸状态
    touchStartPosRef.current = null;
    lastManualCellRef.current = null;
    touchMovedRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd} // 添加 onTouchCancel 以处理触摸中断的情况
      className={`border border-gray-300 dark:border-gray-600 max-w-full h-auto rounded block ${
        isManualColoringMode ? 'cursor-crosshair' : 'cursor-grab' // 改为 grab 光标提示可以拖动
      }`}
      style={{
        imageRendering: 'pixelated',
        touchAction: isManualColoringMode && continuousManualInput ? 'none' : 'auto',
        aspectRatio: canvasAspectRatio,
        width: displaySize ? `${displaySize.width}px` : undefined,
        height: 'auto',
      }}
    />
  );
};

export default PixelatedPreviewCanvas;
