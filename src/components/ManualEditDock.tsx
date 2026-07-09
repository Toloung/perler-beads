'use client';

import { ReactNode } from 'react';
import { GridSelection } from '../utils/gridEditing';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';
import { PixelLayer } from '../utils/layerUtils';

export type ManualEditTool = 'pan' | 'brush' | 'eraser' | 'picker' | 'fill' | 'line' | 'rect' | 'select' | 'move' | 'paste';

type ColorOption = { key: string; color: string };

type ManualEditDockProps = {
  activeTool: ManualEditTool;
  onToolChange: (tool: ManualEditTool) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  layers: PixelLayer[];
  activeLayerId: string | null;
  onLayerSelect: (layerId: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  onToggleLayerLock: (layerId: string) => void;
  selectedColor: MappedPixel | null;
  selectedColorSystem: ColorSystem;
  currentGridColors: ColorOption[];
  fullPaletteColors: ColorOption[];
  showFullPalette: boolean;
  onToggleFullPalette: () => void;
  onColorSelect: (colorData: { key: string; color: string; isExternal?: boolean }) => void;
  onExitManualMode: () => void;
  onCanvasTools: () => void;
  onToggleMagnifier: () => void;
  isMagnifierActive: boolean;
  canUndo: boolean;
  onUndo: () => void;
  gridDimensions: { N: number; M: number } | null;
  totalBeadCount: number;
  projectName: string;
  manualShapeStart: { row: number; col: number } | null;
  activeSelection: GridSelection | null;
  hasClipboard: boolean;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onDeleteSelection: () => void;
  onPasteAtSelection: () => void;
  onClearSelection: () => void;
};

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const icons = {
  pan: (
    <ToolIcon>
      <path d="M7 11V7a2 2 0 1 1 4 0v4" />
      <path d="M11 10V6a2 2 0 1 1 4 0v5" />
      <path d="M15 11V8a2 2 0 1 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.5-4.4L3 13a1.8 1.8 0 0 1 3.3-1.4L8 15" />
    </ToolIcon>
  ),
  brush: (
    <ToolIcon>
      <path d="M18 3l3 3-9 9" />
      <path d="M11 14l-2 2" />
      <path d="M7 17c-2 0-3 1.2-3 3 2 0 4.2-.2 5.4-1.6A2 2 0 0 0 7 17z" />
    </ToolIcon>
  ),
  eraser: (
    <ToolIcon>
      <path d="M7 21h10" />
      <path d="M20 8l-8.5 8.5a3 3 0 0 1-4.2 0L4 13.2a3 3 0 0 1 0-4.2L9 4a3 3 0 0 1 4.2 0L20 10.8" />
    </ToolIcon>
  ),
  picker: (
    <ToolIcon>
      <path d="M14 4l6 6" />
      <path d="M18 8L8 18H5v-3L15 5" />
      <path d="M4 21h7" />
    </ToolIcon>
  ),
  fill: (
    <ToolIcon>
      <path d="M4 13l8-8 8 8-8 8-8-8z" />
      <path d="M12 5v16" />
      <path d="M5 13h14" />
    </ToolIcon>
  ),
  line: (
    <ToolIcon>
      <path d="M5 19L19 5" />
      <path d="M4 20h4v-4" />
      <path d="M20 4h-4v4" />
    </ToolIcon>
  ),
  rect: (
    <ToolIcon>
      <rect x="5" y="6" width="14" height="12" rx="1" />
    </ToolIcon>
  ),
  select: (
    <ToolIcon>
      <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 3" />
    </ToolIcon>
  ),
  move: (
    <ToolIcon>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M8 7l4-4 4 4" />
      <path d="M8 17l4 4 4-4" />
    </ToolIcon>
  ),
  paste: (
    <ToolIcon>
      <path d="M9 4h6l1 2h3v14H5V6h3l1-2z" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </ToolIcon>
  ),
  zoom: (
    <ToolIcon>
      <circle cx="10" cy="10" r="5" />
      <path d="M14 14l6 6" />
    </ToolIcon>
  ),
  undo: (
    <ToolIcon>
      <path d="M9 7H4v5" />
      <path d="M4 12a8 8 0 1 0 3-6.2L4 9" />
    </ToolIcon>
  ),
  copy: (
    <ToolIcon>
      <rect x="8" y="8" width="10" height="10" rx="1" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </ToolIcon>
  ),
  cut: (
    <ToolIcon>
      <circle cx="6" cy="7" r="2" />
      <circle cx="6" cy="17" r="2" />
      <path d="M8 8l12 9" />
      <path d="M8 16L20 7" />
    </ToolIcon>
  ),
  trash: (
    <ToolIcon>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </ToolIcon>
  ),
  close: (
    <ToolIcon>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </ToolIcon>
  ),
  resize: (
    <ToolIcon>
      <rect x="5" y="5" width="14" height="14" rx="1" />
      <path d="M9 15l6-6" />
      <path d="M11 9h4v4" />
    </ToolIcon>
  ),
  layers: (
    <ToolIcon>
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 17l8 4 8-4" />
    </ToolIcon>
  ),
  palette: (
    <ToolIcon>
      <path d="M12 4a8 8 0 0 0 0 16h1.5a1.8 1.8 0 0 0 1-3.3 1.8 1.8 0 0 1 1-3.3H17a3 3 0 0 0 3-3A6.4 6.4 0 0 0 12 4z" />
      <circle cx="8.5" cy="10" r=".6" />
      <circle cx="11" cy="7.8" r=".6" />
      <circle cx="13.7" cy="8.2" r=".6" />
    </ToolIcon>
  ),
};

const tools: Array<{ tool: ManualEditTool; label: string; title: string; icon: ReactNode }> = [
  { tool: 'pan', label: '拖拽', title: '拖拽画布进行平移', icon: icons.pan },
  { tool: 'brush', label: '画笔', title: '按住拖动连续上色', icon: icons.brush },
  { tool: 'eraser', label: '橡皮', title: '按住拖动连续擦除', icon: icons.eraser },
  { tool: 'picker', label: '取色', title: '从画布取色', icon: icons.picker },
  { tool: 'fill', label: '填充', title: '填充相邻同色区域', icon: icons.fill },
  { tool: 'line', label: '直线', title: '点击起点，再点击终点', icon: icons.line },
  { tool: 'rect', label: '矩形', title: '点击起点，再点击对角点', icon: icons.rect },
  { tool: 'select', label: '选区', title: '拖动框选区域', icon: icons.select },
];

const toolDescriptions: Record<ManualEditTool, string> = {
  pan: '拖拽画布进行平移。',
  brush: '按住画布连续上色。',
  eraser: '按住画布连续擦除。',
  picker: '点击画布吸取颜色。',
  fill: '点击色块填充相邻同色区域。',
  line: '点击起点，再点击终点生成直线。',
  rect: '点击起点，再点击对角点生成矩形。',
  select: '拖动画出选区，随后可以复制、剪切、删除或移动。',
  move: '从选区内部拖动移动内容。',
  paste: '点击画布粘贴剪贴板内容。',
};

function ToolButton({
  active,
  disabled,
  icon,
  label,
  title,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`group relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-sm transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'border-[#d97757] bg-[#d97757] text-white shadow-lg shadow-[#d97757]/25'
          : 'border-white/10 bg-white/8 text-gray-200 hover:border-white/25 hover:bg-white/14 hover:text-white'
      }`}
    >
      {icon}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-950 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

function CommandButton({
  children,
  icon,
  tone = 'neutral',
  disabled,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'primary' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    neutral: 'border-gray-200 bg-white/75 text-gray-700 hover:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
    primary: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
    danger: 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${toneClass}`}
    >
      <span className="h-4 w-4">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

export default function ManualEditDock({
  activeTool,
  onToolChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  brushSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBrushSizeChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  layers,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeLayerId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onLayerSelect,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAddLayer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDuplicateLayer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDeleteLayer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleLayerVisibility,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleLayerLock,
  selectedColor,
  selectedColorSystem,
  currentGridColors,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  onColorSelect,
  onExitManualMode,
  onCanvasTools,
  onToggleMagnifier,
  isMagnifierActive,
  canUndo,
  onUndo,
  gridDimensions,
  totalBeadCount,
  projectName,
  manualShapeStart,
  activeSelection,
  hasClipboard,
  onCopySelection,
  onCutSelection,
  onDeleteSelection,
  onPasteAtSelection,
  onClearSelection,
}: ManualEditDockProps) {
  const paletteColors = showFullPalette ? fullPaletteColors : currentGridColors;
  const currentLabel = activeTool === 'eraser'
    ? '橡皮'
    : selectedColor
      ? getColorKeyByHex(selectedColor.color, selectedColorSystem)
      : '未选色';
  const activeToolLabel = tools.find(item => item.tool === activeTool)?.label || (activeTool === 'move' ? '移动' : activeTool === 'paste' ? '粘贴' : '工具');
  const selectionSize = activeSelection
    ? `${Math.abs(activeSelection.endCol - activeSelection.startCol) + 1}x${Math.abs(activeSelection.endRow - activeSelection.startRow) + 1}`
    : null;

  return (
    <>
      <aside className="fixed left-3 top-[104px] z-[70] hidden max-h-[calc(100vh-128px)] w-[60px] flex-col items-center gap-2 overflow-y-auto rounded-2xl border border-white/15 bg-gray-950/72 p-2 shadow-2xl backdrop-blur-xl xl:flex">
        <button
          type="button"
          onClick={onToggleFullPalette}
          className="grid h-[54px] w-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
          title="切换色板"
          aria-label="切换色板"
        >
          <span
            className="h-7 w-7 rounded-lg border-2 border-white/70 shadow-inner"
            style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
          />
          <span className="max-w-10 truncate text-[10px] font-semibold">{currentLabel}</span>
        </button>

        <div className="grid gap-1.5">
          {tools.map(({ tool, label, title, icon }) => (
            <ToolButton
              key={tool}
              active={activeTool === tool}
              icon={icon}
              label={label}
              title={title}
              onClick={() => onToolChange(tool)}
            />
          ))}
        </div>

        <div className="my-1 h-px w-8 bg-white/15" />

        <ToolButton active={isMagnifierActive} icon={icons.zoom} label="放大镜" title="放大镜" onClick={onToggleMagnifier} />
        <ToolButton icon={icons.close} label="退出编辑" title="退出编辑" onClick={onExitManualMode} />
      </aside>

      <aside className="fixed right-3 top-[104px] z-[60] hidden max-h-[calc(100vh-128px)] w-[316px] overflow-y-auto rounded-2xl border border-white/60 bg-white/72 p-3 shadow-2xl backdrop-blur-2xl xl:block dark:border-white/10 dark:bg-gray-900/74">
        <section className="rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.brush}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">工具</h2>
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{activeToolLabel}</p>
          <p className="mt-2 min-h-10 text-sm leading-5 text-gray-500 dark:text-gray-400">{toolDescriptions[activeTool]}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CommandButton icon={icons.undo} disabled={!canUndo} onClick={onUndo}>撤回</CommandButton>
            <CommandButton icon={icons.move} disabled={!activeSelection} onClick={() => onToolChange('move')}>移动</CommandButton>
          </div>
        </section>

        <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.palette}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">色板</h2>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => {
                if (showFullPalette) onToggleFullPalette();
              }}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${!showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
            >
              当前色块
            </button>
            <button
              type="button"
              onClick={() => {
                if (!showFullPalette) onToggleFullPalette();
              }}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
            >
              完整色盘
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>当前 {currentGridColors.length} 色</span>
            <span>按色相排列</span>
          </div>
          <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onColorSelect({ key: TRANSPARENT_KEY, color: '#FFFFFF', isExternal: true })}
              className={`grid aspect-square place-items-center rounded-xl border-2 bg-white text-gray-500 transition-transform active:scale-95 ${
                activeTool === 'eraser' ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-gray-200 dark:border-gray-700'
              }`}
              title="橡皮"
              aria-label="选择橡皮"
            >
              {icons.eraser}
            </button>
            {paletteColors.map((colorData) => {
              const displayKey = getColorKeyByHex(colorData.color, selectedColorSystem);
              const isSelected = selectedColor?.color?.toUpperCase() === colorData.color.toUpperCase() && activeTool !== 'eraser';
              return (
                <button
                  key={`${colorData.key}-${colorData.color}`}
                  type="button"
                  onClick={() => onColorSelect(colorData)}
                  className={`grid aspect-square place-items-center rounded-xl border-2 text-[10px] font-bold transition-transform active:scale-95 ${
                    isSelected ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-gray-200 dark:border-gray-700'
                  }`}
                  style={{ backgroundColor: colorData.color }}
                  title={`${displayKey} (${colorData.color})`}
                  aria-label={`选择 ${displayKey}`}
                >
                  <span className="rounded bg-white/78 px-1 text-gray-800 shadow-sm dark:bg-gray-950/70 dark:text-gray-100">{displayKey}</span>
                </button>
              );
            })}
          </div>
        </section>

        <CommandButton icon={icons.resize} onClick={onCanvasTools}>
          画布尺寸
        </CommandButton>

        {activeSelection && (
          <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">选区 {selectionSize}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CommandButton icon={icons.copy} onClick={onCopySelection}>复制</CommandButton>
              <CommandButton icon={icons.cut} onClick={onCutSelection}>剪切</CommandButton>
              <CommandButton icon={icons.paste} disabled={!hasClipboard} onClick={onPasteAtSelection}>粘贴</CommandButton>
              <CommandButton icon={icons.trash} tone="danger" onClick={onDeleteSelection}>删除</CommandButton>
              <button
                type="button"
                onClick={onClearSelection}
                className="col-span-2 min-h-10 rounded-xl border border-gray-200 bg-white/75 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
              >
                取消选区
              </button>
            </div>
          </section>
        )}

        <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{icons.layers}</span>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">图层</h2>
            </div>
            <span className="text-xs text-gray-400">1</span>
          </div>
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">主体</p>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{projectName}</p>
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">画布</h2>
          <p className="mt-2 text-xs leading-6 text-emerald-800/80 dark:text-emerald-100/75">
            网格 {gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'} · 豆数 {totalBeadCount}
            {manualShapeStart ? ` · 起点 ${manualShapeStart.col + 1},${manualShapeStart.row + 1}` : ''}
          </p>
        </section>
      </aside>

      <div className="fixed inset-x-2 bottom-2 z-[80] rounded-2xl border border-white/60 bg-white/86 p-2 shadow-2xl backdrop-blur-2xl xl:hidden dark:border-white/10 dark:bg-gray-900/86">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={onToggleFullPalette}
            className="grid h-11 min-w-14 place-items-center rounded-xl border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            title="切换色板"
            aria-label="切换色板"
          >
            <span
              className="h-6 w-6 rounded-lg border border-gray-300"
              style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
            />
          </button>

          {tools.map(({ tool, label, title, icon }) => (
            <button
              key={tool}
              type="button"
              onClick={() => onToolChange(tool)}
              className={`grid h-11 min-w-11 place-items-center rounded-xl border transition-all ${
                activeTool === tool
                  ? 'border-[#d97757] bg-[#d97757] text-white shadow-lg shadow-[#d97757]/25'
                  : 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
              title={title}
              aria-label={label}
            >
              {icon}
            </button>
          ))}

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="grid h-11 min-w-11 place-items-center rounded-xl border border-gray-200 bg-gray-100 text-gray-600 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            title="撤回"
            aria-label="撤回"
          >
            {icons.undo}
          </button>
          <button
            type="button"
            onClick={onExitManualMode}
            className="grid h-11 min-w-11 place-items-center rounded-xl bg-red-500 text-white"
            title="退出编辑"
            aria-label="退出编辑"
          >
            {icons.close}
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pt-1">
          {paletteColors.slice(0, 36).map(({ key, color }) => {
            const displayKey = getColorKeyByHex(color, selectedColorSystem);
            return (
              <button
                key={`${key}-${color}`}
                type="button"
                onClick={() => onColorSelect({ key, color, isExternal: showFullPalette })}
                className="h-8 min-w-10 rounded-lg border border-gray-200 text-[10px] font-bold text-gray-700 shadow-sm dark:border-gray-700 dark:text-gray-200"
                style={{ backgroundColor: color === TRANSPARENT_KEY ? '#FFFFFF' : color }}
                title={displayKey}
                aria-label={`选择 ${displayKey}`}
              >
                <span className="rounded bg-white/78 px-1 dark:bg-gray-900/72">{displayKey}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
