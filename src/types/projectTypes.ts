import { PixelationMode, MappedPixel } from '../utils/pixelation';
import { GridDownloadOptions } from './downloadTypes';
import { PaletteSelections } from '../utils/localStorageUtils';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict' | 'offline';

export interface ProjectState {
  originalImageSrc: string | null;
  granularity: number;
  similarityThreshold: number;
  pixelationMode: PixelationMode;
  selectedColorSystem: string;
  customPaletteSelections: PaletteSelections;
  excludedColorKeys: string[];
  initialGridColorKeys: string[];
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  downloadOptions: GridDownloadOptions;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  image_path: string | null;
  state_json: ProjectState;
}

export interface VersionConflict {
  error: 'VERSION_CONFLICT';
  serverVersion: number;
  clientVersion: number;
}
