'use client';

import { ReactNode, useState } from 'react';
import { GridSelection } from '../utils/gridEditing';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';
import { PixelLayer } from '../utils/layerUtils';

export type ManualEditTool = 'pan' | 'brush' | 'eraser' | 'picker' | 'fill' | 'line' | 'rect' | 'select' | 'move' | 'paste';

type ColorOption = { key: string; color: string; count?: number };

type ManualEditDockProps = {
  activeTool: ManualEditTool;
  onToolChange: (tool: ManualEditTool) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  mirrorX: boolean;
  mirrorY: boolean;
  onMirrorXChange: (enabled: boolean) => void;
  onMirrorYChange: (enabled: boolean) => void;
  rectFilled: boolean;
  onRectFilledChange: (enabled: boolean) => void;
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
  onReplaceColors: (sourceColor: ColorOption, targetColor: ColorOption) => void;
  onExitManualMode: () => void;
  onCanvasTools: () => void;
  onToggleMagnifier: () => void;
  isMagnifierActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
  pan: <ToolIcon><path d="M7 11V7a2 2 0 1 1 4 0v4" /><path d="M11 10V6a2 2 0 1 1 4 0v5" /><path d="M15 11V8a2 2 0 1 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.5-4.4L3 13a1.8 1.8 0 0 1 3.3-1.4L8 15" /></ToolIcon>,
  brush: <ToolIcon><path d="M18 3l3 3-9 9" /><path d="M11 14l-2 2" /><path d="M7 17c-2 0-3 1.2-3 3 2 0 4.2-.2 5.4-1.6A2 2 0 0 0 7 17z" /></ToolIcon>,
  eraser: <ToolIcon><path d="M7 21h10" /><path d="M20 8l-8.5 8.5a3 3 0 0 1-4.2 0L4 13.2a3 3 0 0 1 0-4.2L9 4a3 3 0 0 1 4.2 0L20 10.8" /></ToolIcon>,
  picker: <ToolIcon><path d="M14 4l6 6" /><path d="M18 8L8 18H5v-3L15 5" /><path d="M4 21h7" /></ToolIcon>,
  fill: <ToolIcon><path d="M4 13l8-8 8 8-8 8-8-8z" /><path d="M12 5v16" /><path d="M5 13h14" /></ToolIcon>,
  line: <ToolIcon><path d="M5 19L19 5" /><path d="M4 20h4v-4" /><path d="M20 4h-4v4" /></ToolIcon>,
  rect: <ToolIcon><rect x="5" y="6" width="14" height="12" rx="1" /></ToolIcon>,
  select: <ToolIcon><rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 3" /></ToolIcon>,
  move: <ToolIcon><path d="M12 3v18" /><path d="M3 12h18" /><path d="M8 7l4-4 4 4" /><path d="M8 17l4 4 4-4" /></ToolIcon>,
  paste: <ToolIcon><path d="M9 4h6l1 2h3v14H5V6h3l1-2z" /><path d="M9 11h6" /><path d="M9 15h4" /></ToolIcon>,
  zoom: <ToolIcon><circle cx="10" cy="10" r="5" /><path d="M14 14l6 6" /></ToolIcon>,
  undo: <ToolIcon><path d="M9 7H4v5" /><path d="M4 12a8 8 0 1 0 3-6.2L4 9" /></ToolIcon>,
  redo: <ToolIcon><path d="M15 7h5v5" /><path d="M20 12a8 8 0 1 1-3-6.2L20 9" /></ToolIcon>,
  copy: <ToolIcon><rect x="8" y="8" width="10" height="10" rx="1" /><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></ToolIcon>,
  cut: <ToolIcon><circle cx="6" cy="7" r="2" /><circle cx="6" cy="17" r="2" /><path d="M8 8l12 9" /><path d="M8 16L20 7" /></ToolIcon>,
  trash: <ToolIcon><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></ToolIcon>,
  close: <ToolIcon><path d="M6 6l12 12" /><path d="M18 6L6 18" /></ToolIcon>,
  resize: <ToolIcon><rect x="5" y="5" width="14" height="14" rx="1" /><path d="M9 15l6-6" /><path d="M11 9h4v4" /></ToolIcon>,
  layers: <ToolIcon><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" /></ToolIcon>,
  palette: <ToolIcon><path d="M12 4a8 8 0 0 0 0 16h1.5a1.8 1.8 0 0 0 1-3.3 1.8 1.8 0 0 1 1-3.3H17a3 3 0 0 0 3-3A6.4 6.4 0 0 0 12 4z" /><circle cx="8.5" cy="10" r=".6" /><circle cx="11" cy="7.8" r=".6" /><circle cx="13.7" cy="8.2" r=".6" /></ToolIcon>,
  eye: <ToolIcon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></ToolIcon>,
  lock: <ToolIcon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></ToolIcon>,
  plus: <ToolIcon><path d="M12 5v14" /><path d="M5 12h14" /></ToolIcon>,
  replace: <ToolIcon><path d="M7 7h11" /><path d="M15 3l4 4-4 4" /><path d="M17 17H6" /><path d="M9 13l-4 4 4 4" /></ToolIcon>,
};

const tools: Array<{ tool: ManualEditTool; label: string; title: string; icon: ReactNode }> = [
  { tool: 'pan', label: '拖拽', title: '拖拽画布', icon: icons.pan },
  { tool: 'brush', label: '画笔', title: '按住拖动连续上色', icon: icons.brush },
  { tool: 'eraser', label: '橡皮', title: '按住拖动连续擦除', icon: icons.eraser },
  { tool: 'picker', label: '取色', title: '从画布取色', icon: icons.picker },
  { tool: 'fill', label: '填充', title: '填充相邻同色区域', icon: icons.fill },
  { tool: 'line', label: '直线', title: '点击起点，再点击终点', icon: icons.line },
  { tool: 'rect', label: '矩形', title: '点击起点，再点击对角点', icon: icons.rect },
  { tool: 'select', label: '框选', title: '拖动画出选区', icon: icons.select },
  { tool: 'move', label: '移动', title: '移动选区内容', icon: icons.move },
  { tool: 'paste', label: '粘贴', title: '点击画布粘贴', icon: icons.paste },
];

const toolDescriptions: Record<ManualEditTool, string> = {
  pan: '拖拽画布进行平移。',
  brush: '按住画布连续上色，支持笔刷大小和镜像。',
  eraser: '按住画布连续擦除，支持笔刷大小和镜像。',
  picker: '点击画布吸取颜色。',
  fill: '点击色块填充相邻同色区域。',
  line: '点击起点，再点击终点生成直线。',
  rect: '点击起点，再点击对角点生成矩形，可切换描边或填满。',
  select: '拖动画出选区，可复制、剪切、删除或移动。',
  move: '从选区内部拖动移动内容。',
  paste: '点击画布粘贴剪贴板内容。',
};

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

function ToggleChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition-colors ${
        active
          ? 'border-[#d97757] bg-[#d97757] text-white'
          : 'border-gray-200 bg-white/75 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function ToolButton({
  active,
  icon,
  label,
  title,
  onClick,
  compact = false,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`shrink-0 rounded-xl border text-sm transition-all ${
        compact ? 'grid h-12 min-w-[52px] place-items-center px-2' : 'grid h-11 w-11 place-items-center'
      } ${
        active
          ? 'border-[#d97757] bg-[#d97757] text-white shadow-lg shadow-[#d97757]/25'
          : 'border-gray-200 bg-white/80 text-gray-700 hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {icon}
      {compact && <span className="mt-0.5 text-[10px] leading-none">{label}</span>}
    </button>
  );
}

export default function ManualEditDock({
  activeTool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  mirrorX,
  mirrorY,
  onMirrorXChange,
  onMirrorYChange,
  rectFilled,
  onRectFilledChange,
  layers,
  activeLayerId,
  onLayerSelect,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onToggleLayerVisibility,
  onToggleLayerLock,
  selectedColor,
  selectedColorSystem,
  currentGridColors,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  onColorSelect,
  onReplaceColors,
  onExitManualMode,
  onCanvasTools,
  onToggleMagnifier,
  isMagnifierActive,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
  const [mobilePanel, setMobilePanel] = useState<'palette' | 'settings' | 'selection' | null>(null);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [replaceSource, setReplaceSource] = useState<ColorOption | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ColorOption | null>(null);
  const [replaceQuery, setReplaceQuery] = useState('');
  const paletteColors = showFullPalette ? fullPaletteColors : currentGridColors;
  const currentLabel = activeTool === 'eraser'
    ? '橡皮'
    : selectedColor
      ? getColorKeyByHex(selectedColor.color, selectedColorSystem)
      : '未选色';
  const activeToolLabel = tools.find(item => item.tool === activeTool)?.label || '工具';
  const selectionSize = activeSelection
    ? `${Math.abs(activeSelection.endCol - activeSelection.startCol) + 1}x${Math.abs(activeSelection.endRow - activeSelection.startRow) + 1}`
    : null;
  const replacementTargets = fullPaletteColors.filter((color) => {
    const query = replaceQuery.trim().toLowerCase();
    return !query || color.key.toLowerCase().includes(query) || color.color.toLowerCase().includes(query);
  });

  const closeReplace = () => {
    setIsReplaceOpen(false);
    setReplaceSource(null);
    setReplaceTarget(null);
    setReplaceQuery('');
  };

  const confirmReplace = () => {
    if (!replaceSource || !replaceTarget || replaceSource.color.toUpperCase() === replaceTarget.color.toUpperCase()) return;
    onReplaceColors(replaceSource, replaceTarget);
    closeReplace();
  };

  const replacePanel = (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/50 dark:bg-amber-950/25">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">批量替换色号</p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-100/70">选择图纸中的源色号，再选择替换色号。</p>
        </div>
        <button type="button" onClick={closeReplace} className="grid h-8 w-8 place-items-center rounded-lg border border-amber-200 bg-white/80 text-amber-800 dark:border-amber-900 dark:bg-gray-900 dark:text-amber-100" title="关闭批量替换" aria-label="关闭批量替换">
          {icons.close}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">1. 要替换的色号</p>
        <div className="mt-2 grid max-h-32 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
          {currentGridColors.map((color) => {
            const selected = replaceSource?.color.toUpperCase() === color.color.toUpperCase();
            return (
              <button key={`replace-source-${color.color}`} type="button" onClick={() => setReplaceSource(color)} className={`grid min-h-12 place-items-center rounded-lg border-2 px-1 text-[10px] font-bold transition-transform active:scale-95 ${selected ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-white/80'}`} style={{ backgroundColor: color.color }} title={`${color.key}，${color.count || 0} 颗`}>
                <span className="rounded bg-white/80 px-1 text-gray-800 shadow-sm">{color.key}</span>
                <span className="rounded bg-white/80 px-1 text-[9px] font-medium text-gray-600">{color.count || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">2. 替换为</p>
          <input value={replaceQuery} onChange={(event) => setReplaceQuery(event.target.value)} placeholder="搜索色号" className="h-8 w-28 rounded-lg border border-amber-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-[#d97757] dark:border-amber-900 dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div className="mt-2 grid max-h-40 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
          {replacementTargets.map((color) => {
            const isSource = replaceSource?.color.toUpperCase() === color.color.toUpperCase();
            const selected = replaceTarget?.color.toUpperCase() === color.color.toUpperCase();
            return (
              <button key={`replace-target-${color.color}`} type="button" disabled={isSource} onClick={() => setReplaceTarget(color)} className={`grid min-h-10 place-items-center rounded-lg border-2 px-1 text-[10px] font-bold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${selected ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-white/80'}`} style={{ backgroundColor: color.color }} title={color.key}>
                <span className="rounded bg-white/80 px-1 text-gray-800 shadow-sm">{color.key}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" disabled={!replaceSource || !replaceTarget || replaceSource.color.toUpperCase() === replaceTarget.color.toUpperCase()} onClick={confirmReplace} className="mt-3 min-h-10 w-full rounded-xl bg-[#d97757] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#c4684a] disabled:cursor-not-allowed disabled:opacity-40">
        {replaceSource && replaceTarget ? `将 ${replaceSource.key} 的 ${replaceSource.count || 0} 颗替换为 ${replaceTarget.key}` : '选择源色号和目标色号'}
      </button>
    </div>
  );

  const paletteGrid = (
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
  );

  return (
    <>
      <aside className="fixed left-3 top-[104px] z-[70] hidden max-h-[calc(100vh-128px)] w-[64px] flex-col items-center gap-2 overflow-y-auto rounded-2xl border border-white/15 bg-gray-950/72 p-2 shadow-2xl backdrop-blur-xl lg:flex">
        <button
          type="button"
          onClick={onToggleFullPalette}
          className="grid h-[56px] w-12 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
          title="切换色板"
          aria-label="切换色板"
        >
          <span
            className="h-7 w-7 rounded-lg border-2 border-white/70 shadow-inner"
            style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
          />
          <span className="max-w-11 truncate text-[10px] font-semibold">{currentLabel}</span>
        </button>

        <div className="grid gap-1.5">
          {tools.map(({ tool, label, title, icon }) => (
            <ToolButton key={tool} active={activeTool === tool} icon={icon} label={label} title={title} onClick={() => onToolChange(tool)} />
          ))}
        </div>

        <div className="my-1 h-px w-8 bg-white/15" />
        <ToolButton active={isMagnifierActive} icon={icons.zoom} label="放大镜" title="放大镜" onClick={onToggleMagnifier} />
        <ToolButton icon={icons.close} label="退出" title="退出编辑" onClick={onExitManualMode} />
      </aside>

      <aside className="fixed right-3 top-[104px] z-[60] hidden max-h-[calc(100vh-128px)] w-[328px] overflow-y-auto rounded-2xl border border-white/60 bg-white/72 p-3 shadow-2xl backdrop-blur-2xl lg:block dark:border-white/10 dark:bg-gray-900/74">
        <section className="rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.brush}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">工具</h2>
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{activeToolLabel}</p>
          <p className="mt-2 min-h-10 text-sm leading-5 text-gray-500 dark:text-gray-400">{toolDescriptions[activeTool]}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CommandButton icon={icons.undo} disabled={!canUndo} onClick={onUndo}>撤回</CommandButton>
            <CommandButton icon={icons.redo} disabled={!canRedo} onClick={onRedo}>重做</CommandButton>
            <CommandButton icon={icons.move} disabled={!activeSelection} onClick={() => onToolChange('move')}>移动</CommandButton>
            <CommandButton icon={icons.resize} onClick={onCanvasTools}>画布</CommandButton>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">
              笔刷大小 {brushSize}x{brushSize}
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                value={brushSize}
                onChange={(event) => onBrushSizeChange(Number(event.target.value))}
                className="mt-2 w-full accent-[#d97757]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <ToggleChip active={mirrorX} onClick={() => onMirrorXChange(!mirrorX)}>水平镜像</ToggleChip>
              <ToggleChip active={mirrorY} onClick={() => onMirrorYChange(!mirrorY)}>垂直镜像</ToggleChip>
              <ToggleChip active={rectFilled} onClick={() => onRectFilledChange(!rectFilled)}>矩形填满</ToggleChip>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.palette}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">色板</h2>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            <button type="button" onClick={() => showFullPalette && onToggleFullPalette()} className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${!showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>
              当前色块
            </button>
            <button type="button" onClick={() => !showFullPalette && onToggleFullPalette()} className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>
              完整色盘
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>当前 {currentGridColors.length} 色</span>
            <span>{selectedColorSystem}</span>
          </div>
          {paletteGrid}
          <button type="button" onClick={() => setIsReplaceOpen((open) => !open)} className={`mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${isReplaceOpen ? 'border-[#d97757] bg-[#d97757] text-white' : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'}`}>
            {icons.replace}
            批量替换色号
          </button>
          {isReplaceOpen && replacePanel}
        </section>

        {activeSelection && (
          <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">选区 {selectionSize}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CommandButton icon={icons.copy} onClick={onCopySelection}>复制</CommandButton>
              <CommandButton icon={icons.cut} onClick={onCutSelection}>剪切</CommandButton>
              <CommandButton icon={icons.paste} disabled={!hasClipboard} onClick={onPasteAtSelection}>粘贴</CommandButton>
              <CommandButton icon={icons.trash} tone="danger" onClick={onDeleteSelection}>删除</CommandButton>
              <button type="button" onClick={onClearSelection} className="col-span-2 min-h-10 rounded-xl border border-gray-200 bg-white/75 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
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
            <button type="button" onClick={onAddLayer} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" title="新增图层" aria-label="新增图层">
              {icons.plus}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {layers.map((layer) => (
              <div key={layer.id} className={`rounded-xl border p-2 ${layer.id === activeLayerId ? 'border-[#d97757] bg-[#d97757]/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}>
                <button type="button" onClick={() => onLayerSelect(layer.id)} className="block w-full truncate text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {layer.name}
                </button>
                <div className="mt-2 flex gap-1">
                  <button type="button" onClick={() => onToggleLayerVisibility(layer.id)} className="rounded-md border px-2 py-1 text-xs dark:border-gray-700">{layer.visible ? '显示' : '隐藏'}</button>
                  <button type="button" onClick={() => onToggleLayerLock(layer.id)} className="rounded-md border px-2 py-1 text-xs dark:border-gray-700">{layer.locked ? '解锁' : '锁定'}</button>
                  <button type="button" onClick={() => onDuplicateLayer(layer.id)} className="rounded-md border px-2 py-1 text-xs dark:border-gray-700">复制</button>
                  <button type="button" onClick={() => onDeleteLayer(layer.id)} disabled={layers.length <= 1} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-35 dark:border-red-800">删除</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">画布</h2>
          <p className="mt-2 text-xs leading-6 text-emerald-800/80 dark:text-emerald-100/75">
            网格 {gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'} · 豆数 {totalBeadCount}
            {manualShapeStart ? ` · 起点 ${manualShapeStart.col + 1},${manualShapeStart.row + 1}` : ''}
          </p>
          <p className="mt-1 truncate text-xs text-emerald-800/70 dark:text-emerald-100/60">{projectName}</p>
        </section>
      </aside>

      {mobilePanel && (
        <section className="fixed inset-x-2 bottom-[82px] z-[80] max-h-[min(48vh,360px)] overflow-y-auto rounded-2xl border border-white/60 bg-white/95 p-3 shadow-2xl backdrop-blur-2xl lg:hidden dark:border-white/10 dark:bg-gray-900/95">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {mobilePanel === 'palette' ? '颜色' : mobilePanel === 'settings' ? '笔刷与形状' : `选区 ${selectionSize || ''}`}
            </h2>
            <button type="button" onClick={() => setMobilePanel(null)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" aria-label="收起面板" title="收起面板">
              {icons.close}
            </button>
          </div>

          {mobilePanel === 'palette' && (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">{showFullPalette ? '完整色盘' : `当前图纸 ${currentGridColors.length} 色`}</span>
                <button type="button" onClick={onToggleFullPalette} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {showFullPalette ? '仅看已用色' : '查看完整色盘'}
                </button>
              </div>
              {paletteGrid}
              <button type="button" onClick={() => setIsReplaceOpen((open) => !open)} className={`mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${isReplaceOpen ? 'border-[#d97757] bg-[#d97757] text-white' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'}`}>
                {icons.replace}
                批量替换色号
              </button>
              {isReplaceOpen && replacePanel}
            </>
          )}

          {mobilePanel === 'settings' && (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                笔刷大小 {brushSize} x {brushSize}
                <input type="range" min={1} max={9} step={1} value={brushSize} onChange={(event) => onBrushSizeChange(Number(event.target.value))} className="mt-3 w-full accent-[#d97757]" />
              </label>
              <div className="flex flex-wrap gap-2">
                <ToggleChip active={mirrorX} onClick={() => onMirrorXChange(!mirrorX)}>水平镜像</ToggleChip>
                <ToggleChip active={mirrorY} onClick={() => onMirrorYChange(!mirrorY)}>垂直镜像</ToggleChip>
                <ToggleChip active={rectFilled} onClick={() => onRectFilledChange(!rectFilled)}>矩形填满</ToggleChip>
                <CommandButton icon={icons.resize} onClick={onCanvasTools}>画布工具</CommandButton>
              </div>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">双指可缩放画布；切换到拖拽工具后，单指可移动画布。</p>
            </div>
          )}

          {mobilePanel === 'selection' && (
            <div className="grid grid-cols-2 gap-2">
              <CommandButton icon={icons.copy} disabled={!activeSelection} onClick={onCopySelection}>复制</CommandButton>
              <CommandButton icon={icons.cut} disabled={!activeSelection} onClick={onCutSelection}>剪切</CommandButton>
              <CommandButton icon={icons.paste} disabled={!hasClipboard || !activeSelection} onClick={onPasteAtSelection}>粘贴</CommandButton>
              <CommandButton icon={icons.trash} tone="danger" disabled={!activeSelection} onClick={onDeleteSelection}>删除</CommandButton>
              <button type="button" disabled={!activeSelection} onClick={() => { onClearSelection(); setMobilePanel(null); }} className="col-span-2 min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                取消选区
              </button>
            </div>
          )}
        </section>
      )}

      <div className="fixed inset-x-2 bottom-2 z-[81] rounded-2xl border border-white/60 bg-white/90 p-2 shadow-2xl backdrop-blur-2xl lg:hidden dark:border-white/10 dark:bg-gray-900/90">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setMobilePanel(mobilePanel === 'palette' ? null : 'palette')} className={`grid h-12 min-w-[58px] place-items-center rounded-xl border px-2 text-xs font-semibold shadow-sm ${mobilePanel === 'palette' ? 'border-[#d97757] bg-[#d97757] text-white' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'}`} title="颜色" aria-label="颜色">
            <span className="h-6 w-6 rounded-lg border border-gray-300" style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }} />
            <span className="mt-0.5 text-[10px] leading-none">{currentLabel}</span>
          </button>
          {tools.map(({ tool, label, title, icon }) => (
            <ToolButton key={tool} active={activeTool === tool} icon={icon} label={label} title={title} onClick={() => onToolChange(tool)} compact />
          ))}
          <ToolButton active={isMagnifierActive} icon={icons.zoom} label="放大" title="放大镜" onClick={onToggleMagnifier} compact />
          <ToolButton icon={icons.close} label="退出" title="退出编辑" onClick={onExitManualMode} compact />
        </div>

        <div className="mt-1 flex items-center gap-2 overflow-x-auto border-t border-gray-200 pt-2 dark:border-gray-800">
          <button type="button" onClick={onUndo} disabled={!canUndo} className="flex h-10 min-w-[60px] items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-100 px-2 text-xs font-semibold text-gray-700 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">{icons.undo}<span>撤回</span></button>
          <button type="button" onClick={onRedo} disabled={!canRedo} className="flex h-10 min-w-[60px] items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-100 px-2 text-xs font-semibold text-gray-700 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">{icons.redo}<span>重做</span></button>
          <button type="button" onClick={() => setMobilePanel(mobilePanel === 'settings' ? null : 'settings')} className={`flex h-10 min-w-[72px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold ${mobilePanel === 'settings' ? 'border-[#d97757] bg-[#d97757] text-white' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>{icons.brush}<span>笔刷</span></button>
          <button type="button" onClick={() => setMobilePanel(mobilePanel === 'selection' ? null : 'selection')} disabled={!activeSelection} className={`flex h-10 min-w-[72px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold disabled:opacity-35 ${mobilePanel === 'selection' ? 'border-[#d97757] bg-[#d97757] text-white' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>{icons.select}<span>选区</span></button>
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">双指缩放</span>
        </div>
      </div>
    </>
  );
}
