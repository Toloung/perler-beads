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
  onDuplicateLayer: () => void;
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
  { tool: 'pan', label: '鎷栨嫿', title: '鎷栨嫿鐢诲竷杩涜骞崇Щ', icon: icons.pan },
  { tool: 'brush', label: '鐢荤瑪', title: '鎸変綇鎷栧姩杩炵画涓婅壊', icon: icons.brush },
  { tool: 'eraser', label: '姗＄毊', title: '鎸変綇鎷栧姩杩炵画鎿﹂櫎', icon: icons.eraser },
  { tool: 'picker', label: '鍙栬壊', title: '浠庣敾甯冨彇鑹?, icon: icons.picker },
  { tool: 'fill', label: '濉厖', title: '濉厖鐩搁偦鍚岃壊鍖哄煙', icon: icons.fill },
  { tool: 'line', label: '鐩寸嚎', title: '鐐瑰嚮璧风偣锛屽啀鐐瑰嚮缁堢偣', icon: icons.line },
  { tool: 'rect', label: '鐭╁舰', title: '鐐瑰嚮璧风偣锛屽啀鐐瑰嚮瀵硅鐐?, icon: icons.rect },
  { tool: 'select', label: '閫夊尯', title: '鎷栧姩妗嗛€夊尯鍩?, icon: icons.select },
];

const toolDescriptions: Record<ManualEditTool, string> = {
  pan: '鎷栨嫿鐢诲竷杩涜骞崇Щ銆?,
  brush: '鎸変綇鐢诲竷杩炵画涓婅壊銆?,
  eraser: '鎸変綇鐢诲竷杩炵画鎿﹂櫎銆?,
  picker: '鐐瑰嚮鐢诲竷鍚稿彇棰滆壊銆?,
  fill: '鐐瑰嚮鑹插潡濉厖鐩搁偦鍚岃壊鍖哄煙銆?,
  line: '鐐瑰嚮璧风偣锛屽啀鐐瑰嚮缁堢偣鐢熸垚鐩寸嚎銆?,
  rect: '鐐瑰嚮璧风偣锛屽啀鐐瑰嚮瀵硅鐐圭敓鎴愮煩褰€?,
  select: '鎷栧姩鐢诲嚭閫夊尯锛岄殢鍚庡彲浠ュ鍒躲€佸壀鍒囥€佸垹闄ゆ垨绉诲姩銆?,
  move: '浠庨€夊尯鍐呴儴鎷栧姩绉诲姩鍐呭銆?,
  paste: '鐐瑰嚮鐢诲竷绮樿创鍓创鏉垮唴瀹广€?,
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
  brushSize,
  onBrushSizeChange,
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
    ? '姗＄毊'
    : selectedColor
      ? getColorKeyByHex(selectedColor.color, selectedColorSystem)
      : '鏈€夎壊';
  const activeToolLabel = tools.find(item => item.tool === activeTool)?.label || (activeTool === 'move' ? '绉诲姩' : activeTool === 'paste' ? '绮樿创' : '宸ュ叿');
  const selectionSize = activeSelection
    ? `${Math.abs(activeSelection.endCol - activeSelection.startCol) + 1}x${Math.abs(activeSelection.endRow - activeSelection.startRow) + 1}`
    : null;
  const brushSizeOptions = [1, 2, 3, 5];

  return (
    <>
      <aside className="fixed left-3 top-[104px] z-[70] hidden max-h-[calc(100vh-128px)] w-[60px] flex-col items-center gap-2 overflow-y-auto rounded-2xl border border-white/15 bg-gray-950/72 p-2 shadow-2xl backdrop-blur-xl xl:flex">
        <button
          type="button"
          onClick={onToggleFullPalette}
          className="grid h-[54px] w-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
          title="鍒囨崲鑹叉澘"
          aria-label="鍒囨崲鑹叉澘"
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

        <ToolButton active={isMagnifierActive} icon={icons.zoom} label="鏀惧ぇ闀? title="鏀惧ぇ闀? onClick={onToggleMagnifier} />
        <ToolButton icon={icons.close} label="閫€鍑虹紪杈? title="閫€鍑虹紪杈? onClick={onExitManualMode} />
      </aside>

      <aside className="fixed right-3 top-[104px] z-[60] hidden max-h-[calc(100vh-128px)] w-[316px] overflow-y-auto rounded-2xl border border-white/60 bg-white/72 p-3 shadow-2xl backdrop-blur-2xl xl:block dark:border-white/10 dark:bg-gray-900/74">
        <section className="rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.brush}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">宸ュ叿</h2>
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{activeToolLabel}</p>
          <p className="mt-2 min-h-10 text-sm leading-5 text-gray-500 dark:text-gray-400">{toolDescriptions[activeTool]}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CommandButton icon={icons.undo} disabled={!canUndo} onClick={onUndo}>鎾ゅ洖</CommandButton>
            <CommandButton icon={icons.move} disabled={!activeSelection} onClick={() => onToolChange('move')}>绉诲姩</CommandButton>
          </div>
          {(activeTool === 'brush' || activeTool === 'eraser') && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>绗斿埛澶у皬</span>
                <span>{brushSize}x{brushSize}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {brushSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onBrushSizeChange(size)}
                    className={`min-h-9 rounded-lg border text-xs font-semibold transition-colors ${
                      brushSize === size
                        ? 'border-[#d97757] bg-[#d97757] text-white shadow-sm'
                        : 'border-gray-200 bg-white/70 text-gray-700 hover:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">{icons.palette}</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">鑹叉澘</h2>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => {
                if (showFullPalette) onToggleFullPalette();
              }}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${!showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
            >
              褰撳墠鑹插潡
            </button>
            <button
              type="button"
              onClick={() => {
                if (!showFullPalette) onToggleFullPalette();
              }}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${showFullPalette ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
            >
              瀹屾暣鑹茬洏
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>褰撳墠 {currentGridColors.length} 鑹?/span>
            <span>鎸夎壊鐩告帓鍒?/span>
          </div>
          <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onColorSelect({ key: TRANSPARENT_KEY, color: '#FFFFFF', isExternal: true })}
              className={`grid aspect-square place-items-center rounded-xl border-2 bg-white text-gray-500 transition-transform active:scale-95 ${
                activeTool === 'eraser' ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-gray-200 dark:border-gray-700'
              }`}
              title="姗＄毊"
              aria-label="閫夋嫨姗＄毊"
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
                  aria-label={`閫夋嫨 ${displayKey}`}
                >
                  <span className="rounded bg-white/78 px-1 text-gray-800 shadow-sm dark:bg-gray-950/70 dark:text-gray-100">{displayKey}</span>
                </button>
              );
            })}
          </div>
        </section>

        <CommandButton icon={icons.resize} onClick={onCanvasTools}>
          鐢诲竷灏哄
        </CommandButton>

        {activeSelection && (
          <section className="mt-3 rounded-xl bg-white/60 p-4 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">閫夊尯 {selectionSize}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CommandButton icon={icons.copy} onClick={onCopySelection}>澶嶅埗</CommandButton>
              <CommandButton icon={icons.cut} onClick={onCutSelection}>鍓垏</CommandButton>
              <CommandButton icon={icons.paste} disabled={!hasClipboard} onClick={onPasteAtSelection}>绮樿创</CommandButton>
              <CommandButton icon={icons.trash} tone="danger" onClick={onDeleteSelection}>鍒犻櫎</CommandButton>
              <button
                type="button"
                onClick={onClearSelection}
                className="col-span-2 min-h-10 rounded-xl border border-gray-200 bg-white/75 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
              >
                鍙栨秷閫夊尯
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onAddLayer}
                className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                title="新增图层"
                aria-label="新增图层"
              >
                +
              </button>
              <button
                type="button"
                onClick={onDuplicateLayer}
                disabled={!activeLayerId}
                className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-35 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                title="复制当前图层"
                aria-label="复制当前图层"
              >
                ⧉
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {layers.slice().reverse().map((layer) => {
              const isActive = layer.id === activeLayerId;
              return (
                <div
                  key={layer.id}
                  className={`rounded-xl border p-2 transition-colors ${
                    isActive
                      ? 'border-[#d97757] bg-[#fff3ee] dark:border-[#d97757] dark:bg-[#3a2119]'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onLayerSelect(layer.id)}
                    className="block w-full text-left"
                    title={layer.name}
                  >
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{layer.name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {layer.visible ? '显示' : '隐藏'} · {layer.locked ? '已锁定' : '可编辑'}
                    </p>
                  </button>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleLayerVisibility(layer.id)}
                      className="min-h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
                      title={layer.visible ? '隐藏图层' : '显示图层'}
                    >
                      {layer.visible ? '眼' : '隐'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleLayerLock(layer.id)}
                      className="min-h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
                      title={layer.locked ? '解锁图层' : '锁定图层'}
                    >
                      {layer.locked ? '锁' : '开'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLayer(layer.id)}
                      disabled={layers.length <= 1}
                      className="min-h-8 flex-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-600 disabled:opacity-35 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                      title="删除图层"
                    >
                      删
                    </button>
                  </div>
                </div>
              );
            })}
            {layers.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                {projectName}
              </div>
            )}
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">鐢诲竷</h2>
          <p className="mt-2 text-xs leading-6 text-emerald-800/80 dark:text-emerald-100/75">
            缃戞牸 {gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'} 路 璞嗘暟 {totalBeadCount}
            {manualShapeStart ? ` 路 璧风偣 ${manualShapeStart.col + 1},${manualShapeStart.row + 1}` : ''}
          </p>
        </section>
      </aside>

      <div className="fixed inset-x-2 bottom-2 z-[80] rounded-2xl border border-white/60 bg-white/86 p-2 shadow-2xl backdrop-blur-2xl xl:hidden dark:border-white/10 dark:bg-gray-900/86">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={onToggleFullPalette}
            className="grid h-11 min-w-14 place-items-center rounded-xl border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            title="鍒囨崲鑹叉澘"
            aria-label="鍒囨崲鑹叉澘"
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
            title="鎾ゅ洖"
            aria-label="鎾ゅ洖"
          >
            {icons.undo}
          </button>
          {(activeTool === 'brush' || activeTool === 'eraser') && (
            <button
              type="button"
              onClick={() => {
                const index = brushSizeOptions.indexOf(brushSize);
                onBrushSizeChange(brushSizeOptions[(index + 1) % brushSizeOptions.length]);
              }}
              className="grid h-11 min-w-14 place-items-center rounded-xl border border-gray-200 bg-gray-100 text-xs font-bold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              title="鍒囨崲绗斿埛澶у皬"
              aria-label="鍒囨崲绗斿埛澶у皬"
            >
              {brushSize}x
            </button>
          )}
          <button
            type="button"
            onClick={onExitManualMode}
            className="grid h-11 min-w-11 place-items-center rounded-xl bg-red-500 text-white"
            title="閫€鍑虹紪杈?
            aria-label="閫€鍑虹紪杈?
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
                aria-label={`閫夋嫨 ${displayKey}`}
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
