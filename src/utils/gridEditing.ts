import { MappedPixel } from './pixelation';
import { TRANSPARENT_KEY, transparentColorData } from './pixelEditingUtils';

export type GridSelection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type ClipboardGrid = MappedPixel[][];

export function recalculateGridStats(pixelData: MappedPixel[][]) {
  const colorCounts: { [hexKey: string]: { count: number; color: string } } = {};
  let totalBeadCount = 0;

  pixelData.flat().forEach(cell => {
    if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      const cellHex = cell.color.toUpperCase();
      if (!colorCounts[cellHex]) {
        colorCounts[cellHex] = { count: 0, color: cellHex };
      }
      colorCounts[cellHex].count++;
      totalBeadCount++;
    }
  });

  return {
    colorCounts,
    totalBeadCount,
    initialGridColorKeys: new Set(Object.keys(colorCounts)),
  };
}

export function normalizeSelection(selection: GridSelection, dims: { N: number; M: number }): GridSelection {
  const startRow = Math.min(selection.startRow, selection.endRow);
  const endRow = Math.max(selection.startRow, selection.endRow);
  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);

  return {
    startRow: Math.min(dims.M - 1, Math.max(0, startRow)),
    endRow: Math.min(dims.M - 1, Math.max(0, endRow)),
    startCol: Math.min(dims.N - 1, Math.max(0, startCol)),
    endCol: Math.min(dims.N - 1, Math.max(0, endCol)),
  };
}

export function resizeGrid(
  pixelData: MappedPixel[][],
  currentDims: { N: number; M: number },
  nextDims: { N: number; M: number },
  anchor: 'top-left' | 'center' = 'top-left'
) {
  const resized = Array.from({ length: nextDims.M }, () =>
    Array.from({ length: nextDims.N }, () => ({ ...transparentColorData }))
  );
  const rowOffset = anchor === 'center' ? Math.floor((nextDims.M - currentDims.M) / 2) : 0;
  const colOffset = anchor === 'center' ? Math.floor((nextDims.N - currentDims.N) / 2) : 0;

  for (let row = 0; row < currentDims.M; row++) {
    for (let col = 0; col < currentDims.N; col++) {
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < nextDims.M && nextCol >= 0 && nextCol < nextDims.N) {
        resized[nextRow][nextCol] = { ...pixelData[row][col] };
      }
    }
  }

  return resized;
}

export function copySelection(pixelData: MappedPixel[][], selection: GridSelection) {
  const copied: ClipboardGrid = [];
  for (let row = selection.startRow; row <= selection.endRow; row++) {
    copied.push(
      pixelData[row]
        .slice(selection.startCol, selection.endCol + 1)
        .map(cell => ({ ...cell }))
    );
  }
  return copied;
}

export function clearSelection(pixelData: MappedPixel[][], selection: GridSelection) {
  return pixelData.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (
        rowIndex >= selection.startRow &&
        rowIndex <= selection.endRow &&
        colIndex >= selection.startCol &&
        colIndex <= selection.endCol
      ) {
        return { ...transparentColorData };
      }
      return { ...cell };
    })
  );
}

export function pasteClipboard(
  pixelData: MappedPixel[][],
  dims: { N: number; M: number },
  clipboard: ClipboardGrid,
  startRow: number,
  startCol: number
) {
  const pasted = pixelData.map(row => row.map(cell => ({ ...cell })));

  clipboard.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const targetRow = startRow + rowIndex;
      const targetCol = startCol + colIndex;
      if (targetRow >= 0 && targetRow < dims.M && targetCol >= 0 && targetCol < dims.N) {
        pasted[targetRow][targetCol] = { ...cell };
      }
    });
  });

  return pasted;
}
