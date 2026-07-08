export type GridDownloadOptions = {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkStyle: 'tile' | 'emboss';
};
