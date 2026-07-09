export const DEFAULT_DOWNLOAD_OUTPUT_SCALE = 2;

export const downloadOutputScaleOptions = [
  { value: 1, label: '标准', description: '30 px/格，文件较小' },
  { value: 2, label: '高清', description: '60 px/格，推荐默认' },
  { value: 3, label: '印刷', description: '90 px/格，适合放大打印' },
] as const;

export type GridDownloadOptions = {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean;
  outputScale: number;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkStyle: 'tile' | 'emboss';
};
