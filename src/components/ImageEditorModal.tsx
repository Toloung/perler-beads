'use client';

import { useEffect, useRef, useState } from 'react';

type CropState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, width: 100, height: 100 });
  const [imageRatio, setImageRatio] = useState(1);
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
  }, [open, imageSrc, rotation, flipHorizontal, flipVertical, crop]);

  useEffect(() => {
    if (!open) return;

    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
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
    setCrop(centeredCropForRatio(imageRatio, ratio));
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
      <div className="grid max-h-[94vh] w-full max-w-4xl gap-4 overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl dark:bg-gray-800 sm:p-4 md:grid-cols-[minmax(0,1fr)_300px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-gray-100 p-3 dark:bg-gray-900">
          <canvas ref={previewCanvasRef} className="max-h-[62vh] max-w-full rounded-lg shadow-sm" />
        </div>

        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">编辑图片</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">先裁切、旋转或翻转，再重新生成底稿。</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
              关闭
            </button>
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
