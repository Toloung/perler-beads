'use client';

import { MouseEvent, TouchEvent, useEffect, useRef } from 'react';
import { EditorViewport } from './PixelatedPreviewCanvas';
import { MappedPixel } from '../utils/pixelation';

type CanvasMiniMapProps = {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  viewport: EditorViewport | null;
  onNavigate: (point: { x: number; y: number }) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function CanvasMiniMap({
  mappedPixelData,
  gridDimensions,
  viewport,
  onNavigate,
}: CanvasMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const maxWidth = 168;
    const maxHeight = 168;
    const scale = Math.max(0.25, Math.min(maxWidth / N, maxHeight / M));
    const width = Math.max(1, Math.round(N * scale));
    const height = Math.max(1, Math.round(M * scale));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.imageSmoothingEnabled = false;
    context.fillStyle = '#F8FAFC';
    context.fillRect(0, 0, width, height);

    for (let row = 0; row < M; row += 1) {
      for (let col = 0; col < N; col += 1) {
        const cell = mappedPixelData[row]?.[col];
        if (!cell || cell.isExternal) continue;
        context.fillStyle = cell.color;
        context.fillRect(col * scale, row * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }

    if (!viewport) return;
    const visibleWidth = clamp(viewport.viewportWidth / viewport.displayWidth, 0.04, 1);
    const visibleHeight = clamp(viewport.viewportHeight / viewport.displayHeight, 0.04, 1);
    const left = clamp(0.5 - viewport.offsetX / viewport.displayWidth - visibleWidth / 2, 0, 1 - visibleWidth);
    const top = clamp(0.5 - viewport.offsetY / viewport.displayHeight - visibleHeight / 2, 0, 1 - visibleHeight);

    context.fillStyle = 'rgba(255, 255, 255, 0.18)';
    context.fillRect(left * width, top * height, visibleWidth * width, visibleHeight * height);
    context.strokeStyle = '#D97757';
    context.lineWidth = 2;
    context.strokeRect(left * width + 1, top * height + 1, Math.max(0, visibleWidth * width - 2), Math.max(0, visibleHeight * height - 2));
  }, [mappedPixelData, gridDimensions, viewport]);

  if (!mappedPixelData || !gridDimensions) return null;

  const navigateFromPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onNavigate({
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    navigateFromPoint(event.clientX, event.clientY);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    navigateFromPoint(touch.clientX, touch.clientY);
  };

  return (
    <section className="fixed bottom-[142px] right-3 z-[72] rounded-xl border border-white/70 bg-white/88 p-2 shadow-xl backdrop-blur-xl lg:bottom-4 lg:right-[352px] dark:border-white/10 dark:bg-gray-900/85">
      <div className="mb-1 flex items-center justify-between gap-3 px-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-300">
        <span>总览</span>
        <span>{gridDimensions.N} x {gridDimensions.M}</span>
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        className="block max-h-[168px] max-w-[168px] cursor-crosshair rounded-md bg-slate-50 [image-rendering:pixelated] dark:bg-slate-800"
        style={{ touchAction: 'none' }}
        aria-label="画布总览，点击可跳转"
      />
    </section>
  );
}
