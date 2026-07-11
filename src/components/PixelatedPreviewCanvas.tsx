'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, WheelEvent, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { GridSelection } from '../utils/gridEditing';

export type EditorViewport = {
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
};

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
  isPanTool?: boolean;
  onViewportChange?: (viewport: EditorViewport) => void;
  viewportRequest?: { x: number; y: number; nonce: number } | null;
}

// Draws the bead grid preview canvas.
const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  highlightColorKey?: string | null,
  isHighlighting?: boolean,
  activeSelection?: GridSelection | null
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

      // Dim cells that are not part of the highlighted color.
      if (isHighlighting && highlightColorKey) {
        let shouldDim = false;
        
        if (cellData.isExternal) {
          // External cells are always dimmed because they are not target beads.
          shouldDim = true;
        } else {
          // Internal cells are dimmed when their color does not match.
          shouldDim = cellData.color.toUpperCase() !== highlightColorKey.toUpperCase();
        }
        
        if (shouldDim) {
          pixelatedCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
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
  isPanTool = false,
  onViewportChange,
  viewportRequest,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const touchGestureRef = useRef<{
    mode: 'pan' | 'pinch';
    startX: number;
    startY: number;
    startDistance?: number;
    startDisplaySize: { width: number; height: number };
    startOffset: { x: number; y: number };
  } | null>(null);
  const isMousePaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const lastManualCellRef = useRef<{ row: number; col: number } | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const hoverCellRef = useRef<{ row: number; col: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const baseDisplaySizeRef = useRef<{ width: number; height: number } | null>(null);

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
    baseDisplaySizeRef.current = { width: nextWidth, height: nextHeight };
    setCanvasOffset({ x: 0, y: 0 });
    setDisplaySize((current) => (
      current?.width === nextWidth && current?.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight }
    ));
  }, [canvasRef, gridDimensions]);

  useEffect(() => {
    if (!isManualColoringMode || !displaySize || !canvasRef.current || !onViewportChange) return;
    const container = canvasRef.current.parentElement;
    if (!container) return;

    const notify = () => {
      onViewportChange({
        displayWidth: displaySize.width,
        displayHeight: displaySize.height,
        offsetX: canvasOffset.x,
        offsetY: canvasOffset.y,
        viewportWidth: container.clientWidth,
        viewportHeight: container.clientHeight,
      });
    };

    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasRef, canvasOffset.x, canvasOffset.y, displaySize, isManualColoringMode, onViewportChange]);

  useEffect(() => {
    if (!isManualColoringMode || !displaySize || !viewportRequest) return;
    setCanvasOffset({
      x: displaySize.width * (0.5 - viewportRequest.x),
      y: displaySize.height * (0.5 - viewportRequest.y),
    });
  }, [displaySize, isManualColoringMode, viewportRequest]);

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
      drawPixelatedCanvas(mappedPixelData, canvasRef.current, gridDimensions, highlightColorKey, isHighlighting, activeSelection);
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, highlightColorKey, isHighlighting, activeSelection]); // Add darkModeState dependency

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

  const updateHoverCell = (cell: { row: number; col: number } | null) => {
    const previous = hoverCellRef.current;
    if (
      previous?.row === cell?.row
      && previous?.col === cell?.col
    ) {
      return;
    }

    hoverCellRef.current = cell;
    setHoverCell(cell);
  };

  // Highlight effect.
  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      // End the flash shortly after it starts.
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  useEffect(() => {
    if (!isManualColoringMode) return;

    const handleGlobalMouseMove = (event: globalThis.MouseEvent) => {
      if (!isPanTool || !isPanningRef.current || !panStartRef.current) return;
      setCanvasOffset({
        x: panStartRef.current.offsetX + event.clientX - panStartRef.current.x,
        y: panStartRef.current.offsetY + event.clientY - panStartRef.current.y,
      });
    };

    const handleGlobalMouseUp = () => {
      isPanningRef.current = false;
      panStartRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isManualColoringMode, isPanTool]);

  // --- Mouse events ---
  
  // Track hover, drag painting, and pan movement.
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isPanTool && isPanningRef.current && panStartRef.current) {
      setCanvasOffset({
        x: panStartRef.current.offsetX + event.clientX - panStartRef.current.x,
        y: panStartRef.current.offsetY + event.clientY - panStartRef.current.y,
      });
      return;
    }

    if (isManualColoringMode) {
      updateHoverCell(getCellFromPointer(event.clientX, event.clientY));
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

    if (!isManualColoringMode) {
        onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
    }
  };

  // Hide hover state when the pointer leaves the canvas.
  const handleMouseLeave = () => {
    isMousePaintingRef.current = false;
    isPanningRef.current = false;
    updateHoverCell(null);
    // Always hide the tooltip when leaving the canvas.
    onInteraction(0, 0, 0, 0, false, true);
  };

  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isPanTool) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: canvasOffset.x,
        offsetY: canvasOffset.y,
      };
      event.preventDefault();
      return;
    }

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
    isPanningRef.current = false;
  };

  // Mouse click handling for manual edit and tooltip modes.
  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isPanTool) return;
    // Manual mode paints; non-manual mode toggles the tooltip.
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, isManualColoringMode);
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!isManualColoringMode) return;

    event.preventDefault();
    event.stopPropagation();
  };

  // --- Touch events ---
  // Used to distinguish taps from intentional movement.
  const handleTouchStart = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    if (isManualColoringMode && event.touches.length >= 2 && displaySize) {
      const secondTouch = event.touches[1];
      const distance = Math.hypot(secondTouch.clientX - touch.clientX, secondTouch.clientY - touch.clientY);
      touchGestureRef.current = {
        mode: 'pinch',
        startX: (touch.clientX + secondTouch.clientX) / 2,
        startY: (touch.clientY + secondTouch.clientY) / 2,
        startDistance: Math.max(1, distance),
        startDisplaySize: displaySize,
        startOffset: canvasOffset,
      };
      touchMovedRef.current = true;
      event.preventDefault();
      return;
    }

    if (isManualColoringMode && isPanTool && displaySize) {
      touchGestureRef.current = {
        mode: 'pan',
        startX: touch.clientX,
        startY: touch.clientY,
        startDisplaySize: displaySize,
        startOffset: canvasOffset,
      };
      touchMovedRef.current = true;
      event.preventDefault();
      return;
    }

    // Record the start position and reset movement state.
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

    // Outside manual mode, touching can still show or toggle the tooltip.
    if (!isManualColoringMode) {
        onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
    }
    // Manual painting is not triggered here.
  };
  
  // Hide tooltip if a touch turns into a move.
  const handleTouchMove = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    const gesture = touchGestureRef.current;
    if (gesture) {
      if (gesture.mode === 'pinch' && event.touches.length >= 2 && gesture.startDistance) {
        const secondTouch = event.touches[1];
        const distance = Math.hypot(secondTouch.clientX - touch.clientX, secondTouch.clientY - touch.clientY);
        const scale = distance / gesture.startDistance;
        const baseSize = baseDisplaySizeRef.current || gesture.startDisplaySize;
        const minScale = 0.35;
        const maxScale = 12;
        const nextWidth = Math.round(Math.min(baseSize.width * maxScale, Math.max(baseSize.width * minScale, gesture.startDisplaySize.width * scale)));
        const nextHeight = Math.round(Math.min(baseSize.height * maxScale, Math.max(baseSize.height * minScale, gesture.startDisplaySize.height * scale)));
        setDisplaySize({ width: nextWidth, height: nextHeight });
        setCanvasOffset({
          x: gesture.startOffset.x + ((touch.clientX + secondTouch.clientX) / 2 - gesture.startX),
          y: gesture.startOffset.y + ((touch.clientY + secondTouch.clientY) / 2 - gesture.startY),
        });
      } else if (gesture.mode === 'pan') {
        setCanvasOffset({
          x: gesture.startOffset.x + touch.clientX - gesture.startX,
          y: gesture.startOffset.y + touch.clientY - gesture.startY,
        });
      }
      event.preventDefault();
      return;
    }

    if (!touchStartPosRef.current) return;

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
    
    // Use a small threshold to separate taps from scroll or drag gestures.
    if (!touchMovedRef.current && (dx > 10 || dy > 10)) {
      touchMovedRef.current = true;
      // Once movement is detected, hide the tooltip.
      onInteraction(0, 0, 0, 0, false, true);
    }
  };
  
  // Touch end no longer hides the tooltip automatically.
  const handleTouchEnd = (event: TouchEvent<HTMLCanvasElement>) => {
    if (touchGestureRef.current) {
      touchGestureRef.current = null;
      touchStartPosRef.current = null;
      lastManualCellRef.current = null;
      touchMovedRef.current = false;
      if (event.touches.length === 1) {
        event.preventDefault();
      }
      return;
    }
    if (isManualColoringMode && onManualPointerCell && touchStartPosRef.current) {
      const cell = lastManualCellRef.current || getCellFromPointer(touchStartPosRef.current.x, touchStartPosRef.current.y);
      if (cell) onManualPointerCell('up', cell.row, cell.col);
    }

    // In manual mode, a tap without movement paints one cell.
    if (isManualColoringMode && !touchMovedRef.current && touchStartPosRef.current) {
      // Use the touch start coordinates for painting.
      const { x, y, pageX, pageY } = touchStartPosRef.current;
      onInteraction(x, y, pageX, pageY, true);
    }
    // Non-manual tooltip handling is already done during touch start.

    // Reset touch state.
    touchStartPosRef.current = null;
    lastManualCellRef.current = null;
    touchMovedRef.current = false;
  };

  const freeformCanvasStyle = isManualColoringMode
    ? {
        position: 'absolute' as const,
        left: '50%',
        top: '50%',
        transform: `translate(calc(-50% + ${canvasOffset.x}px), calc(-50% + ${canvasOffset.y}px))`,
      }
    : {};

  return (
    <>
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
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        className={`border border-gray-300 dark:border-gray-600 h-auto rounded block ${isManualColoringMode ? 'max-w-none' : 'max-w-full'} ${
          isPanTool ? 'cursor-grab active:cursor-grabbing' : isManualColoringMode ? 'cursor-crosshair' : 'cursor-grab'
        }`}
        style={{
          imageRendering: 'pixelated',
          touchAction: isManualColoringMode ? 'none' : 'auto',
          aspectRatio: canvasAspectRatio,
          width: displaySize ? `${displaySize.width}px` : undefined,
          height: 'auto',
          ...freeformCanvasStyle,
        }}
      />
      {isManualColoringMode && hoverCell && gridDimensions && displaySize && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1]"
          style={{
            width: `${displaySize.width}px`,
            height: `${displaySize.height}px`,
            transform: `translate(calc(-50% + ${canvasOffset.x}px), calc(-50% + ${canvasOffset.y}px))`,
          }}
        >
          <div
            className="absolute border-2 border-[#d97757] bg-[#d97757]/20 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
            style={{
              left: `${(hoverCell.col / gridDimensions.N) * 100}%`,
              top: `${(hoverCell.row / gridDimensions.M) * 100}%`,
              width: `${100 / gridDimensions.N}%`,
              height: `${100 / gridDimensions.M}%`,
            }}
          />
        </div>
      )}
    </>
  );
};

export default PixelatedPreviewCanvas;
