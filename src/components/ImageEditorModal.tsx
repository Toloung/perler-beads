'use client';

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

type CropState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropDragMode = 'move' | 'resize';

function clampPercent(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function centeredCropForRatio(imageRatio: number, targetRatio: number): CropState {
  if (targetRatio <= 0 || imageRatio <= 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  if (imageRatio > targetRatio) {
    const width = (targetRatio / imageRatio) * 100;
    return { x: (100 - width) / 2, y: 0, width, height: 100 };
  }

  const height = (imageRatio / targetRatio) * 100;
  return { x: 0, y: (100 - height) / 2, width: 100, height };
}

export default function ImageEditorModal({
  open,
  imageSrc,
  onClose,
  onApply,
}: {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApply: (imageSrc: string) => void;
}) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropWorkspaceRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{
    mode: CropDragMode;
    startX: number;
    startY: number;
    crop: CropState;
  } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, width: 100, height: 100 });
  const [imageRatio, setImageRatio] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [isApplying, setIsApplying] = useState(false);

  const renderEditedImage = async (targetCanvas?: HTMLCanvasElement) => {
    if (!imageSrc) return null;

    const image = await loadImage(imageSrc);
    const sourceX = Math.round((crop.x / 100) * image.width);
    const sourceY = Math.round((crop.y / 100) * image.height);
    const sourceWidth = Math.max(1, Math.round((crop.width / 100) * image.width));
    const sourceHeight = Math.max(1, Math.round((crop.height / 100) * image.height));
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    const canvas = targetCanvas || document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = rotated ? sourceHeight : sourceWidth;
    canvas.height = rotated ? sourceWidth : sourceHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normalizedRotation * Math.PI) / 180);
    ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight
    );
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    if (!open || !imageSrc) return;

    loadImage(imageSrc)
      .then((image) => {
        setImageRatio(image.width / image.height);
      })
      .catch(() => setImageRatio(1));
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open || !imageSrc) return;

    renderEditedImage(previewCanvasRef.current || undefined).catch(() => {
      // Preview failure is non-fatal; apply will surface the same issue.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageSrc, rotation, flipHorizontal, flipVertical, crop, brightness, contrast, saturation]);

  useEffect(() => {
    if (!open) return;

    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
  }, [open, imageSrc]);

  if (!open || !imageSrc) return null;

  const setCropField = (key: keyof CropState, rawValue: string) => {
    const value = clampPercent(Number.parseFloat(rawValue), crop[key]);
    setCrop(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'x') next.width = Math.min(next.width, 100 - next.x);
      if (key === 'y') next.height = Math.min(next.height, 100 - next.y);
      if (key === 'width') next.width = Math.min(next.width, 100 - next.x);
      if (key === 'height') next.height = Math.min(next.height, 100 - next.y);
      return next;
    });
  };

  const applyRatioCrop = (ratio: number | null) => {
    if (!ratio) {
      setCrop({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const sourceRatio = normalizedRotation === 90 || normalizedRotation === 270 ? 1 / ratio : ratio;
    setCrop(centeredCropForRatio(imageRatio, sourceRatio));
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLElement>, mode: CropDragMode) => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    const workspace = cropWorkspaceRef.current;
    if (!drag || !workspace) return;

    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;

    setCrop(() => {
      if (drag.mode === 'move') {
        return {
          ...drag.crop,
          x: Math.max(0, Math.min(100 - drag.crop.width, drag.crop.x + deltaX)),
          y: Math.max(0, Math.min(100 - drag.crop.height, drag.crop.y + deltaY)),
        };
      }

      return {
        ...drag.crop,
        width: Math.max(8, Math.min(100 - drag.crop.x, drag.crop.width + deltaX)),
        height: Math.max(8, Math.min(100 - drag.crop.y, drag.crop.height + deltaY)),
      };
    });
  };

  const finishCropDrag = () => {
    cropDragRef.current = null;
  };

  const resetEdits = () => {
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const result = await renderEditedImage();
      if (result) {
        onApply(result);
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-2 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="grid max-h-[94vh] w-full max-w-5xl gap-4 overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl dark:bg-gray-800 sm:p-4 md:grid-cols-[minmax(0,1fr)_320px]" onClick={(event) => event.stopPropagation()}>
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>拖动裁切框移动，拖右下角调整大小</span>
              <span>{Math.round(crop.width)}% x {Math.round(crop.height)}%</span>
            </div>
            <div className="flex min-h-[260px] items-center justify-center overflow-auto">
              <div
                ref={cropWorkspaceRef}
                className="relative inline-block max-w-full touch-none select-none"
                onPointerMove={handleCropPointerMove}
                onPointerUp={finishCropDrag}
                onPointerCancel={finishCropDrag}
              >
                <img src={imageSrc} alt="待处理图片" draggable={false} className="block max-h-[48vh] max-w-full rounded-lg shadow-sm" />
                <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
                <div
                  className="absolute cursor-move border-2 border-[#d97757] bg-[#d97757]/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                  style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
                  onPointerDown={(event) => beginCropDrag(event, 'move')}
                  aria-label="裁切区域"
                >
                  <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full border border-white bg-[#d97757]" />
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-white bg-[#d97757]" />
                  <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full border border-white bg-[#d97757]" />
                  <button
                    type="button"
                    onPointerDown={(event) => beginCropDrag(event, 'resize')}
                    className="absolute -bottom-3 -right-3 grid h-6 w-6 cursor-nwse-resize place-items-center rounded-full border-2 border-white bg-[#d97757] text-xs font-bold text-white shadow"
                    aria-label="调整裁切大小"
                  >
                    ↘
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">处理后预览</p>
            <div className="flex max-h-[220px] min-h-28 items-center justify-center overflow-auto rounded-lg bg-gray-100 p-2 dark:bg-gray-950">
              <canvas ref={previewCanvasRef} className="max-h-[200px] max-w-full rounded-lg shadow-sm" />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">编辑图片</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">先裁切、旋转或翻转，再重新生成底稿。</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={resetEdits} className="rounded-md px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">重置</button>
              <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">关闭</button>
            </div>
          </div>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">旋转 / 翻转</h4>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRotation(prev => prev - 90)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
                左转 90
              </button>
              <button type="button" onClick={() => setRotation(prev => prev + 90)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
                右转 90
              </button>
              <button type="button" onClick={() => setFlipHorizontal(prev => !prev)} className={`rounded-xl border px-3 py-2 text-sm ${flipHorizontal ? 'border-[#d97757] bg-[#d97757]/10 text-[#c4684a]' : 'border-gray-300 dark:border-gray-600'}`}>
                水平翻转
              </button>
              <button type="button" onClick={() => setFlipVertical(prev => !prev)} className={`rounded-xl border px-3 py-2 text-sm ${flipVertical ? 'border-[#d97757] bg-[#d97757]/10 text-[#c4684a]' : 'border-gray-300 dark:border-gray-600'}`}>
                垂直翻转
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">画面调整</h4>
            {([
              ['brightness', '亮度', brightness, setBrightness],
              ['contrast', '对比度', contrast, setContrast],
              ['saturation', '饱和度', saturation, setSaturation],
            ] as const).map(([key, label, value, onChange]) => (
              <label key={key} className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                <span className="flex items-center justify-between"><span>{label}</span><span>{value}%</span></span>
                <input type="range" min="50" max="150" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-[#d97757]" />
              </label>
            ))}
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">快速裁切</h4>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => applyRatioCrop(null)} className="rounded-xl border border-gray-300 px-2 py-2 text-xs dark:border-gray-600">原图</button>
              <button type="button" onClick={() => applyRatioCrop(1)} className="rounded-xl border border-gray-300 px-2 py-2 text-xs dark:border-gray-600">1:1</button>
              <button type="button" onClick={() => applyRatioCrop(4 / 3)} className="rounded-xl border border-gray-300 px-2 py-2 text-xs dark:border-gray-600">4:3</button>
              <button type="button" onClick={() => applyRatioCrop(3 / 4)} className="rounded-xl border border-gray-300 px-2 py-2 text-xs dark:border-gray-600">3:4</button>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">裁切百分比</h4>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['x', '左侧'],
                ['y', '顶部'],
                ['width', '宽度'],
                ['height', '高度'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-xs text-gray-500 dark:text-gray-400">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(crop[key] * 10) / 10}
                    onChange={(event) => setCropField(key, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </label>
              ))}
            </div>
          </section>

          <button
            type="button"
            disabled={isApplying}
            onClick={handleApply}
            className="w-full rounded-xl bg-[#d97757] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? '应用中...' : '应用到图纸'}
          </button>
        </aside>
      </div>
    </div>
  );
}
