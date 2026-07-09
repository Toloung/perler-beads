'use client';

import { GridSelection } from '../utils/gridEditing';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';

export type ManualEditTool = 'pan' | 'brush' | 'eraser' | 'picker' | 'fill' | 'line' | 'rect' | 'select' | 'move' | 'paste';

type ColorOption = { key: string; color: string };

type ManualEditDockProps = {
  activeTool: ManualEditTool;
  onToolChange: (tool: ManualEditTool) => void;
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

const tools: Array<{ tool: ManualEditTool; label: string; title: string; icon: string }> = [
  { tool: 'pan', label: '拖拽', title: '拖拽画布进行平移', icon: '☝' },
  { tool: 'brush', label: '画笔', title: '按住拖动连续上色', icon: '✎' },
  { tool: 'eraser', label: '橡皮', title: '按住拖动连续擦除', icon: '⌫' },
  { tool: 'picker', label: '取色', title: '从画布取色', icon: '⌖' },
  { tool: 'fill', label: '填充', title: '填充相邻同色区域', icon: '▣' },
  { tool: 'line', label: '直线', title: '点击起点，再点击终点', icon: '╱' },
  { tool: 'rect', label: '矩形', title: '点击起点，再点击对角点', icon: '□' },
  { tool: 'select', label: '选区', title: '拖动框选区域', icon: '▢' },
];

const toolDescriptions: Record<ManualEditTool, string> = {
  pan: '拖拽画布进行平移',
  brush: '按住画布连续上色',
  eraser: '按住画布连续擦除',
  picker: '点击画布吸取颜色',
  fill: '点击色块填充相邻区域',
  line: '点击起点，再点击终点生成直线',
  rect: '点击起点，再点击对角点生成矩形',
  select: '拖动框选区域',
  move: '从选区内拖动移动内容',
  paste: '点击画布粘贴剪贴板内容',
};

export default function ManualEditDock({
  activeTool,
  onToolChange,
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
  const selectionSize = activeSelection
    ? `${Math.abs(activeSelection.endCol - activeSelection.startCol) + 1}x${Math.abs(activeSelection.endRow - activeSelection.startRow) + 1}`
    : null;

  return (
    <>
      <aside className="fixed left-3 top-[104px] z-[70] hidden max-h-[calc(100vh-128px)] flex-col items-center gap-1 overflow-y-auto rounded-2xl border border-white/20 bg-gray-900/68 p-1.5 shadow-2xl backdrop-blur-xl xl:flex">
        <button
          type="button"
          onClick={onToggleFullPalette}
          className="mb-1 flex w-10 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold text-white"
          title="切换色板"
        >
          <span
            className="h-8 w-8 rounded-lg border-2 border-white/70 shadow-inner"
            style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
          />
          <span className="max-w-10 truncate">{currentLabel}</span>
        </button>

        {tools.map(({ tool, label, title, icon }) => (
          <button
            key={tool}
            type="button"
            onClick={() => onToolChange(tool)}
            className={`flex w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-all ${
              activeTool === tool
                ? 'bg-[#d97757] py-1.5 text-white shadow-lg shadow-[#d97757]/30'
                : 'h-10 text-gray-300 hover:bg-gray-700/70 hover:text-white'
            }`}
            title={title}
            aria-label={label}
          >
            <span className="text-lg leading-none">{icon}</span>
            {activeTool === tool && <span>{label}</span>}
          </button>
        ))}

        <button
          type="button"
          onClick={onToggleMagnifier}
          className={`mt-1 flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all ${
            isMagnifierActive ? 'bg-blue-500 text-white' : 'bg-gray-700/60 text-gray-200 hover:bg-gray-700'
          }`}
          title="放大镜"
          aria-label="放大镜"
        >
          ⌕
        </button>

        <button
          type="button"
          onClick={onExitManualMode}
          className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-xl text-white shadow-lg"
          title="退出编辑"
          aria-label="退出编辑"
        >
          ×
        </button>
      </aside>

      <aside className="fixed right-3 top-[104px] z-[60] hidden max-h-[calc(100vh-128px)] w-[300px] overflow-y-auto rounded-2xl border border-white/60 bg-white/68 p-3 shadow-2xl backdrop-blur-2xl xl:block dark:border-white/10 dark:bg-gray-900/70">
        <section className="rounded-xl bg-white/55 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">⌄</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">工具</h2>
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{tools.find(item => item.tool === activeTool)?.label || '工具'}</p>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{toolDescriptions[activeTool]}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
            >
              撤回
            </button>
            <button
              type="button"
              onClick={() => onToolChange('move')}
              disabled={!activeSelection}
              className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
            >
              移动选区
            </button>
          </div>
        </section>

        <section className="mt-3 rounded-xl bg-white/55 p-4 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-gray-500">⌄</span>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">色板</h2>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onToggleFullPalette()}
              className={`rounded-lg px-2 py-2 font-medium ${!showFullPalette ? 'bg-white text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              色块
            </button>
            <button
              type="button"
              onClick={() => onToggleFullPalette()}
              className={`rounded-lg px-2 py-2 font-medium ${showFullPalette ? 'bg-white text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              色盘
            </button>
            <div className="rounded-lg bg-gray-100 px-2 py-2 text-center font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              当前<br />({currentGridColors.length})
            </div>
            <div className="rounded-lg bg-gray-100 px-2 py-2 text-center font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              色相排序
            </div>
          </div>
          <div className="grid max-h-48 grid-cols-5 gap-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onColorSelect({ key: TRANSPARENT_KEY, color: '#FFFFFF', isExternal: true })}
              className={`flex aspect-square items-center justify-center rounded-lg border-2 bg-white text-[10px] font-bold text-gray-500 ${
                activeTool === 'eraser' ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-gray-200'
              }`}
              title="橡皮"
            >
              擦
            </button>
            {paletteColors.map((colorData) => {
              const displayKey = getColorKeyByHex(colorData.color, selectedColorSystem);
              const isSelected = selectedColor?.color?.toUpperCase() === colorData.color.toUpperCase() && activeTool !== 'eraser';
              return (
                <button
                  key={`${colorData.key}-${colorData.color}`}
                  type="button"
                  onClick={() => onColorSelect(colorData)}
                  className={`flex aspect-square items-center justify-center rounded-lg border-2 text-[10px] font-bold transition-transform active:scale-95 ${
                    isSelected ? 'border-[#d97757] ring-2 ring-[#d97757]/30' : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: colorData.color }}
                  title={`${displayKey} (${colorData.color})`}
                >
                  <span className="rounded bg-white/70 px-1 text-gray-800">{displayKey}</span>
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={onCanvasTools}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200/70 bg-white/80 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
        >
          ⊞ 画布尺寸…
        </button>

        {activeSelection && (
          <section className="mt-3 rounded-xl bg-white/55 p-4 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">选区 {selectionSize}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onCopySelection} className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">复制</button>
              <button type="button" onClick={onCutSelection} className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">剪切</button>
              <button type="button" onClick={onPasteAtSelection} disabled={!hasClipboard} className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200">粘贴</button>
              <button type="button" onClick={onDeleteSelection} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">删除</button>
              <button type="button" onClick={onClearSelection} className="col-span-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">取消选区</button>
            </div>
          </section>
        )}

        <section className="mt-3 rounded-xl bg-white/55 p-4 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">图层</h2>
            <span className="text-lg text-gray-500">＋</span>
          </div>
          <div className="mt-3 rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">主体</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{projectName}</p>
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

      <div className="fixed inset-x-2 bottom-2 z-[80] rounded-2xl border border-white/60 bg-white/82 p-2 shadow-2xl backdrop-blur-2xl xl:hidden dark:border-white/10 dark:bg-gray-900/82">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={onToggleFullPalette}
            className="flex h-11 min-w-14 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            title="切换色板"
          >
            <span
              className="h-7 w-7 rounded-lg border border-gray-300"
              style={{ backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
            />
            <span className="max-w-12 truncate">{currentLabel}</span>
          </button>

          {tools.map(({ tool, label, title, icon }) => (
            <button
              key={tool}
              type="button"
              onClick={() => onToolChange(tool)}
              className={`flex h-11 min-w-11 flex-col items-center justify-center rounded-xl text-[10px] transition-all ${
                activeTool === tool
                  ? 'bg-[#d97757] text-white shadow-lg shadow-[#d97757]/25'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
              title={title}
              aria-label={label}
            >
              <span className="text-base leading-none">{icon}</span>
              {activeTool === tool && <span>{label}</span>}
            </button>
          ))}

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="flex h-11 min-w-11 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-600 disabled:opacity-35 dark:bg-gray-800 dark:text-gray-300"
            title="撤回"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={onExitManualMode}
            className="flex h-11 min-w-11 items-center justify-center rounded-xl bg-red-500 text-lg font-semibold text-white"
            title="退出编辑"
          >
            ×
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pt-1">
          {paletteColors.slice(0, 36).map(({ key, color }) => (
            <button
              key={`${key}-${color}`}
              type="button"
              onClick={() => onColorSelect({ key, color, isExternal: showFullPalette })}
              className="h-8 min-w-10 rounded-lg border border-gray-200 text-[10px] font-bold text-gray-700 shadow-sm dark:border-gray-700 dark:text-gray-200"
              style={{ backgroundColor: color === TRANSPARENT_KEY ? '#FFFFFF' : color }}
              title={key}
            >
              <span className="rounded bg-white/78 px-1 dark:bg-gray-900/72">{key}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
