'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';

type PreviewStyle = 'magazine' | 'cute' | 'clean';

const styles: { key: PreviewStyle; label: string }[] = [
  { key: 'magazine', label: '杂志' },
  { key: 'cute', label: '可爱' },
  { key: 'clean', label: '极简' },
];

function isTransparentCell(cell?: MappedPixel) {
  if (!cell?.color) return true;
  return cell.color === 'transparent' || cell.color.includes('rgba(0, 0, 0, 0)') || cell.color.includes('rgba(0,0,0,0)');
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;

  if (imgRatio > boxRatio) {
    drawHeight = width / imgRatio;
  } else {
    drawWidth = height * imgRatio;
  }

  ctx.drawImage(img, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export default function PreviewCardModal({
  open,
  mappedPixelData,
  gridDimensions,
  totalBeadCount,
  projectName,
  onClose,
}: {
  open: boolean;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  totalBeadCount: number;
  projectName: string;
  onClose: () => void;
}) {
  const [selectedStyle, setSelectedStyle] = useState<PreviewStyle>('magazine');
  const [gridPreviewUrl, setGridPreviewUrl] = useState('');
  const [cardPreviewUrl, setCardPreviewUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const beadCount = useMemo(() => totalBeadCount, [totalBeadCount]);

  useEffect(() => {
    if (!open || !mappedPixelData || !gridDimensions || typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const aspect = gridDimensions.N / gridDimensions.M;
    if (aspect > 1) {
      canvas.width = 600;
      canvas.height = Math.max(1, Math.round(600 / aspect));
    } else {
      canvas.height = 600;
      canvas.width = Math.max(1, Math.round(600 * aspect));
    }

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellWidth = canvas.width / gridDimensions.N;
    const cellHeight = canvas.height / gridDimensions.M;
    for (let row = 0; row < gridDimensions.M; row += 1) {
      for (let col = 0; col < gridDimensions.N; col += 1) {
        const cell = mappedPixelData[row]?.[col];
        if (isTransparentCell(cell)) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(col * cellWidth, row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }

    setGridPreviewUrl(canvas.toDataURL('image/png'));
  }, [gridDimensions, mappedPixelData, open]);

  const renderCard = useCallback(async (style: PreviewStyle) => {
    const sourceUrl = photoUrl || gridPreviewUrl;
    if (!sourceUrl || typeof document === 'undefined') return '';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const sourceImage = await loadImage(sourceUrl);
    canvas.width = 720;
    canvas.height = style === 'clean' ? 820 : 940;

    if (style === 'magazine') {
      const gradient = ctx.createLinearGradient(0, 0, 720, 940);
      gradient.addColorStop(0, '#f8fbff');
      gradient.addColorStop(0.55, '#fff7ed');
      gradient.addColorStop(1, '#f4e8df');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 720, 940);

      ctx.fillStyle = '#111827';
      ctx.font = '700 54px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillText(projectName || '拼豆作品', 56, 96);
      ctx.font = '500 22px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#d97757';
      ctx.fillText('作品打卡', 58, 134);

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 16;
      ctx.fillStyle = '#ffffff';
      drawRoundedRect(ctx, 56, 184, 608, 560, 28);
      ctx.fill();
      ctx.restore();
      drawContainedImage(ctx, sourceImage, 84, 212, 552, 504);

      ctx.fillStyle = '#111827';
      ctx.font = '700 28px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillText(`${beadCount} 颗豆`, 58, 814);
      ctx.font = '500 18px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`${gridDimensions?.N || 0} x ${gridDimensions?.M || 0} 网格 · ${new Date().toLocaleDateString()}`, 58, 850);
      ctx.fillStyle = '#d97757';
      ctx.fillText('perler beads generator', 58, 888);
    }

    if (style === 'cute') {
      ctx.fillStyle = '#fff1f2';
      ctx.fillRect(0, 0, 720, 940);
      ctx.fillStyle = '#bfdbfe';
      ctx.beginPath();
      ctx.arc(82, 92, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(635, 150, 54, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#831843';
      ctx.font = '700 44px Arial, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('今天也完成了一幅拼豆', 360, 118);

      ctx.save();
      drawRoundedRect(ctx, 76, 176, 568, 568, 36);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(76, 176, 568, 568);
      drawContainedImage(ctx, sourceImage, 96, 196, 528, 528);
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      drawRoundedRect(ctx, 122, 786, 476, 78, 26);
      ctx.fill();
      ctx.fillStyle = '#9d174d';
      ctx.font = '700 24px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillText(`${beadCount} 颗 · ${gridDimensions?.N || 0}x${gridDimensions?.M || 0}`, 360, 834);
      ctx.textAlign = 'left';
    }

    if (style === 'clean') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 720, 820);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, 640, 620);
      drawContainedImage(ctx, sourceImage, 56, 56, 608, 588);

      ctx.fillStyle = '#111827';
      ctx.font = '700 34px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillText(projectName || '拼豆作品', 48, 724);
      ctx.font = '500 20px Arial, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#4b5563';
      ctx.fillText(`${beadCount} 颗豆 · ${gridDimensions?.N || 0} x ${gridDimensions?.M || 0}`, 48, 760);
    }

    return canvas.toDataURL('image/jpeg', 0.92);
  }, [beadCount, gridDimensions, gridPreviewUrl, photoUrl, projectName]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !gridPreviewUrl) return;

    setIsRendering(true);
    renderCard(selectedStyle)
      .then((url) => {
        if (!cancelled) setCardPreviewUrl(url);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gridPreviewUrl, open, renderCard, selectedStyle]);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSave = async () => {
    const url = await renderCard(selectedStyle);
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = `拼豆打卡-${formatTimestamp()}.jpg`;
    link.click();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">作品打卡</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{beadCount} 颗豆 · {gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'} 网格</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            关闭
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_18rem] sm:p-6">
          <div className="rounded-2xl bg-gray-100 p-3 dark:bg-gray-800">
            <div className="flex min-h-[28rem] items-center justify-center rounded-xl bg-white p-3 dark:bg-gray-950">
              {cardPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cardPreviewUrl} alt="打卡图预览" className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-sm" />
              ) : (
                <span className="text-sm text-gray-500">{isRendering ? '生成预览中...' : '暂无预览'}</span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">样式</h4>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {styles.map((style) => (
                  <button
                    key={style.key}
                    type="button"
                    onClick={() => setSelectedStyle(style.key)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      selectedStyle === style.key
                        ? 'bg-[#d97757] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">照片</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">不添加照片时，会使用当前拼豆图作为打卡主图。</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                  {photoUrl ? '更换照片' : '添加照片'}
                </button>
                {photoUrl && (
                  <button type="button" onClick={() => setPhotoUrl('')} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30">
                    移除照片
                  </button>
                )}
              </div>
            </section>

            <button type="button" onClick={handleSave} disabled={!cardPreviewUrl || isRendering} className="w-full rounded-2xl bg-[#d97757] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c4684a] disabled:cursor-not-allowed disabled:opacity-50">
              保存图片
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
