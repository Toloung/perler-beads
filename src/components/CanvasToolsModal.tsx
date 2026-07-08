'use client';

import { useEffect, useState } from 'react';
import { GridSelection } from '../utils/gridEditing';

export default function CanvasToolsModal({
  open,
  dimensions,
  hasClipboard,
  onClose,
  onResize,
  onCopy,
  onCut,
  onDelete,
  onPaste,
}: {
  open: boolean;
  dimensions: { N: number; M: number } | null;
  hasClipboard: boolean;
  onClose: () => void;
  onResize: (width: number, height: number, anchor: 'top-left' | 'center') => void;
  onCopy: (selection: GridSelection) => void;
  onCut: (selection: GridSelection) => void;
  onDelete: (selection: GridSelection) => void;
  onPaste: (row: number, col: number) => void;
}) {
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(50);
  const [anchor, setAnchor] = useState<'top-left' | 'center'>('top-left');
  const [selection, setSelection] = useState<GridSelection>({
    startRow: 0,
    startCol: 0,
    endRow: 9,
    endCol: 9,
  });
  const [pasteRow, setPasteRow] = useState(0);
  const [pasteCol, setPasteCol] = useState(0);

  useEffect(() => {
    if (!dimensions) return;
    setWidth(dimensions.N);
    setHeight(dimensions.M);
    setSelection({
      startRow: 0,
      startCol: 0,
      endRow: Math.min(9, dimensions.M - 1),
      endCol: Math.min(9, dimensions.N - 1),
    });
  }, [dimensions, open]);

  if (!open || !dimensions) return null;

  const clampSize = (value: number) => Math.min(300, Math.max(1, Math.round(value)));
  const readSelection = () => ({
    startRow: Math.round(selection.startRow),
    startCol: Math.round(selection.startCol),
    endRow: Math.round(selection.endRow),
    endCol: Math.round(selection.endCol),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grid max-h-[90vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-800" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">画布工具</h3>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
            关闭
          </button>
        </div>

        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">画布尺寸</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">调整会保留已有内容，缩小时超出区域会被裁掉。</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              宽度（列）
              <input type="number" value={width} min={1} max={300} onChange={(event) => setWidth(clampSize(Number(event.target.value)))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400">
              高度（行）
              <input type="number" value={height} min={1} max={300} onChange={(event) => setHeight(clampSize(Number(event.target.value)))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAnchor('top-left')} className={`rounded-md border px-3 py-1.5 text-xs ${anchor === 'top-left' ? 'border-[#d97757] bg-[#d97757]/10 text-[#c4684a]' : 'border-gray-300 dark:border-gray-600'}`}>
              左上停靠
            </button>
            <button type="button" onClick={() => setAnchor('center')} className={`rounded-md border px-3 py-1.5 text-xs ${anchor === 'center' ? 'border-[#d97757] bg-[#d97757]/10 text-[#c4684a]' : 'border-gray-300 dark:border-gray-600'}`}>
              居中停靠
            </button>
          </div>
          <button type="button" onClick={() => onResize(width, height, anchor)} className="mt-3 rounded-md bg-[#d97757] px-4 py-2 text-sm font-semibold text-white">
            应用尺寸
          </button>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">选区</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">当前版本先通过坐标操作选区，后续会升级为鼠标框选。</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['startRow', '起始行'],
              ['startCol', '起始列'],
              ['endRow', '结束行'],
              ['endCol', '结束列'],
            ] as const).map(([key, label]) => (
              <label key={key} className="text-xs text-gray-500 dark:text-gray-400">
                {label}
                <input
                  type="number"
                  min={0}
                  value={selection[key]}
                  onChange={(event) => setSelection(prev => ({ ...prev, [key]: Number(event.target.value) }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onCopy(readSelection())} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
              复制
            </button>
            <button type="button" onClick={() => onCut(readSelection())} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
              剪切
            </button>
            <button type="button" onClick={() => onDelete(readSelection())} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 dark:border-red-700 dark:text-red-300">
              删除
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">粘贴</h4>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              目标行
              <input type="number" value={pasteRow} min={0} onChange={(event) => setPasteRow(Number(event.target.value))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400">
              目标列
              <input type="number" value={pasteCol} min={0} onChange={(event) => setPasteCol(Number(event.target.value))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </label>
          </div>
          <button type="button" disabled={!hasClipboard} onClick={() => onPaste(Math.round(pasteRow), Math.round(pasteCol))} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            粘贴
          </button>
        </section>
      </div>
    </div>
  );
}
