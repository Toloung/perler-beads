import { PixelationMode, MappedPixel } from '../utils/pixelation';
import { GridDownloadOptions } from './downloadTypes';
import { PaletteSelections } from '../utils/localStorageUtils';
import { PixelLayer } from '../utils/layerUtils';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict' | 'offline';

export interface ProjectState {
  canvasSource?: 'image' | 'blank' | 'csv';
  originalImageSrc: string | null;
  granularity: number;
  similarityThreshold: number;
  pixelationMode: PixelationMode;
  selectedColorSystem: string;
  customPaletteSelections: PaletteSelections;
  excludedColorKeys: string[];
  initialGridColorKeys: string[];
  mappedPixelData: MappedPixel[][] | null;
  pixelLayers?: PixelLayer[];
  activeLayerId?: string | null;
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

export type ProjectVersionAction = 'create' | 'update' | 'rename' | 'restore' | 'delete';

export interface ProjectVersionSummary {
  project_id: string;
  version: number;
  name: string;
  action: ProjectVersionAction;
  created_at: string;
}

export interface ProjectVersionDetail extends ProjectVersionSummary {
  thumbnail: string | null;
  image_path: string | null;
  state_json: ProjectState;
}

export interface DatabaseBackupSummary {
  name: string;
  size: number;
  created_at: string;
}
