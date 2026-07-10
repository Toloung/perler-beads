import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DOWNLOAD_OUTPUT_SCALE, GridDownloadOptions, downloadOutputScaleOptions } from '../types/downloadTypes';
import type { MappedPixel } from '../utils/pixelation';
import type { ColorSystem } from '../utils/colorSystemUtils';
import { getColorKeyByHex } from '../utils/colorSystemUtils';

const gridLineColorOptions = [
  { name: '深灰色', value: '#555555' },
  { name: '红色', value: '#FF0000' },
  { name: '蓝色', value: '#0000FF' },
  { name: '绿色', value: '#008000' },
  { name: '紫色', value: '#800080' },
  { name: '橙色', value: '#FFA500' },
];

interface DownloadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GridDownloadOptions;
  onOptionsChange: (options: GridDownloadOptions) => void;
  onDownload: (opts?: GridDownloadOptions) => void;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  totalBeadCount: number;
  selectedColorSystem: ColorSystem;
}

const DownloadSettingsModal: React.FC<DownloadSettingsModalProps> = ({
  isOpen,
  onClose,
  options,
  onOptionsChange,
  onDownload,
  mappedPixelData,
  gridDimensions,
  totalBeadCount,
  selectedColorSystem,
}) => {
  const [tempOptions, setTempOptions] = useState<GridDownloadOptions>({ ...options });

  useEffect(() => {
    if (isOpen) {
      setTempOptions({
        ...options,
        downloadTarget: options.downloadTarget || 'image',
        outputScale: options.outputScale || DEFAULT_DOWNLOAD_OUTPUT_SCALE,
        showCellNumbers: true,
        watermarkEnabled: false,
      });
    }
  }, [isOpen, options]);

  if (!isOpen) return null;

  const handleOptionChange = (
    key: keyof GridDownloadOptions,
    value: GridDownloadOptions[keyof GridDownloadOptions]
  ) => {
    setTempOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleTargetChange = (downloadTarget: GridDownloadOptions['downloadTarget']) => {
    setTempOptions((prev) => ({
      ...prev,
      downloadTarget,
      exportCsv: downloadTarget === 'csv',
    }));
  };

  const handleSave = () => {
    const nextOptions = {
      ...tempOptions,
      exportCsv: tempOptions.downloadTarget === 'csv',
      showCellNumbers: true,
      watermarkEnabled: false,
    };
    onOptionsChange(nextOptions);
    onDownload(nextOptions);
    onClose();
  };

  const isCsvDownload = tempOptions.downloadTarget === 'csv';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b pb-3 dark:border-gray-700">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">下载</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                选择导出图纸或 CSV，保存前可以先看预览。
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="space-y-4">
              <section className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">下载内容</label>
                <div className="grid grid-cols-2 gap-2">
                  <TargetButton
                    active={!isCsvDownload}
                    title="图纸 PNG"
                    description="适合查看、分享和打印"
                    onClick={() => handleTargetChange('image')}
                  />
                  <TargetButton
                    active={isCsvDownload}
                    title="CSV 源数据"
                    description="适合重新导入继续编辑"
                    onClick={() => handleTargetChange('csv')}
                  />
                </div>
              </section>

              <DownloadPreview
                isCsvDownload={isCsvDownload}
                options={tempOptions}
                mappedPixelData={mappedPixelData}
                gridDimensions={gridDimensions}
                totalBeadCount={totalBeadCount}
                selectedColorSystem={selectedColorSystem}
              />

              {isCsvDownload ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  CSV 会保存每个格子的 hex 颜色值，之后可以通过导入底稿重新打开继续编辑。
                </div>
              ) : (
                <>
                  <section className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">导出画质</label>
                    <div className="grid grid-cols-3 gap-2">
                      {downloadOutputScaleOptions.map((quality) => (
                        <button
                          key={quality.value}
                          type="button"
                          onClick={() => handleOptionChange('outputScale', quality.value)}
                          className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                            (tempOptions.outputScale ?? DEFAULT_DOWNLOAD_OUTPUT_SCALE) === quality.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'
                          }`}
                          title={quality.description}
                        >
                          <span className="block text-sm font-semibold">{quality.label}</span>
                          <span className="block text-[11px] leading-4 text-gray-500 dark:text-gray-400">{quality.value}x</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      高清会生成更大的 PNG，色号文字、网格和打印边缘会更清楚。
                    </p>
                  </section>

                  <OptionRow label="显示网格线">
                    <Toggle
                      checked={tempOptions.showGrid}
                      onChange={(checked) => handleOptionChange('showGrid', checked)}
                    />
                  </OptionRow>

                  {tempOptions.showGrid && (
                    <div className="space-y-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          网格线间隔，每 N 格画一条线
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="5"
                            max="20"
                            step="1"
                            value={tempOptions.gridInterval}
                            onChange={(event) => handleOptionChange('gridInterval', parseInt(event.target.value, 10))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                          />
                          <span className="flex min-w-10 items-center justify-center text-sm font-medium text-gray-900 dark:text-gray-100">
                            {tempOptions.gridInterval}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">网格线颜色</label>
                        <div className="flex flex-wrap gap-2">
                          {gridLineColorOptions.map((colorOpt) => (
                            <button
                              key={colorOpt.value}
                              type="button"
                              onClick={() => handleOptionChange('gridLineColor', colorOpt.value)}
                              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-150 ${
                                tempOptions.gridLineColor === colorOpt.value
                                  ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800'
                                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                              }`}
                              title={colorOpt.name}
                            >
                              <span className="block h-6 w-6 rounded-full" style={{ backgroundColor: colorOpt.value }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <OptionRow label="显示坐标数字">
                    <Toggle
                      checked={tempOptions.showCoordinates}
                      onChange={(checked) => handleOptionChange('showCoordinates', checked)}
                    />
                  </OptionRow>

                  <OptionRow label="包含色号统计">
                    <Toggle
                      checked={tempOptions.includeStats}
                      onChange={(checked) => handleOptionChange('includeStats', checked)}
                    />
                  </OptionRow>

                </>
              )}
            </div>

            <aside className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
              <p className="font-semibold text-gray-900 dark:text-gray-100">当前图纸</p>
              <dl className="grid grid-cols-2 gap-2">
                <InfoItem label="尺寸" value={gridDimensions ? `${gridDimensions.N} x ${gridDimensions.M}` : '--'} />
                <InfoItem label="颗数" value={`${totalBeadCount || 0}`} />
                <InfoItem label="色板" value={selectedColorSystem} />
                <InfoItem label="格式" value={isCsvDownload ? 'CSV' : 'PNG'} />
              </dl>
            </aside>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!mappedPixelData || !gridDimensions}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300 disabled:text-white/80"
            >
              {isCsvDownload ? '下载 CSV' : '下载图纸'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

type DownloadPreviewProps = {
  isCsvDownload: boolean;
  options: GridDownloadOptions;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  totalBeadCount: number;
  selectedColorSystem: ColorSystem;
};

const DownloadPreview: React.FC<DownloadPreviewProps> = ({
  isCsvDownload,
  options,
  mappedPixelData,
  gridDimensions,
  totalBeadCount,
  selectedColorSystem,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleColors = useMemo(() => {
    if (!mappedPixelData) return [];
    const counts = new Map<string, number>();
    mappedPixelData.flat().forEach((cell) => {
      if (!cell || cell.isExternal) return;
      counts.set(cell.color, (counts.get(cell.color) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [mappedPixelData]);

  useEffect(() => {
    if (isCsvDownload || !mappedPixelData || !gridDimensions || !canvasRef.current) return;

    const { N, M } = gridDimensions;
    const maxSize = 260;
    const scale = Math.max(1, Math.floor(Math.min(maxSize / N, maxSize / M)));
    const previewWidth = N * scale;
    const previewHeight = M * scale;
    const canvas = canvasRef.current;

    canvas.width = previewWidth;
    canvas.height = previewHeight;
    canvas.style.width = `${previewWidth}px`;
    canvas.style.height = `${previewHeight}px`;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.imageSmoothingEnabled = false;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, previewWidth, previewHeight);

    for (let row = 0; row < M; row++) {
      for (let col = 0; col < N; col++) {
        const cell = mappedPixelData[row]?.[col];
        context.fillStyle = cell && !cell.isExternal ? cell.color : '#ffffff';
        context.fillRect(col * scale, row * scale, scale, scale);
      }
    }

    if (options.showGrid && scale >= 4) {
      context.strokeStyle = options.gridLineColor || '#555555';
      context.lineWidth = 1;
      const interval = Math.max(1, options.gridInterval || 10);

      for (let col = interval; col < N; col += interval) {
        const x = col * scale + 0.5;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, previewHeight);
        context.stroke();
      }

      for (let row = interval; row < M; row += interval) {
        const y = row * scale + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(previewWidth, y);
        context.stroke();
      }
    }

    context.strokeStyle = '#111827';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, previewWidth - 1, previewHeight - 1);
  }, [isCsvDownload, mappedPixelData, gridDimensions, options.showGrid, options.gridInterval, options.gridLineColor]);

  if (!mappedPixelData || !gridDimensions) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        还没有可下载的图纸。
      </section>
    );
  }

  if (isCsvDownload) {
    const cellCount = gridDimensions.N * gridDimensions.M;

    return (
      <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">CSV 预览</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-blue-800 dark:text-blue-200">
          <InfoItem label="行数" value={`${gridDimensions.M}`} />
          <InfoItem label="列数" value={`${gridDimensions.N}`} />
          <InfoItem label="单元格" value={`${cellCount}`} />
          <InfoItem label="有效颗数" value={`${totalBeadCount}`} />
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white font-mono text-[10px] leading-5 text-gray-600 dark:border-blue-900 dark:bg-gray-950 dark:text-gray-300">
          {mappedPixelData.slice(0, 4).map((row, rowIndex) => (
            <div key={rowIndex} className="truncate px-2">
              {row.slice(0, 8).map((cell) => (cell && !cell.isExternal ? cell.color : '__TRANSPARENT__')).join(',')}
              {gridDimensions.N > 8 ? ',...' : ''}
            </div>
          ))}
          {gridDimensions.M > 4 && <div className="px-2">...</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">图纸预览</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            预览用于确认构图，实际下载会按选择的清晰度导出。
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
          {options.outputScale || DEFAULT_DOWNLOAD_OUTPUT_SCALE}x
        </div>
      </div>
      <div className="flex justify-center overflow-hidden rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
        <canvas ref={canvasRef} className="max-h-[260px] max-w-full object-contain [image-rendering:pixelated]" />
      </div>
      {sampleColors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sampleColors.map(([hex, count]) => (
            <span
              key={hex}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: hex }} />
              {getColorKeyByHex(hex, selectedColorSystem)} · {count}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

type TargetButtonProps = {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
};

const TargetButton: React.FC<TargetButtonProps> = ({ active, title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
      active
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'
    }`}
  >
    <span className="block text-sm font-semibold">{title}</span>
    <span className="block text-[11px] leading-4 text-gray-500 dark:text-gray-400">{description}</span>
  </button>
);

type OptionRowProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

const OptionRow: React.FC<OptionRowProps> = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
    {children}
  </div>
);

type InfoItemProps = {
  label: string;
  value: string;
};

const InfoItem: React.FC<InfoItemProps> = ({ label, value }) => (
  <div className="rounded-lg bg-white px-2 py-1.5 dark:bg-gray-800">
    <dt className="text-[10px] text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-100">{value}</dd>
  </div>
);

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

const Toggle: React.FC<ToggleProps> = ({ checked, onChange }) => (
  <label className="relative inline-flex cursor-pointer items-center">
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:bg-gray-700" />
  </label>
);

export default DownloadSettingsModal;
export { gridLineColorOptions };
