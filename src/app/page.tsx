'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo, useCallback } from 'react';
import Script from 'next/script';
import InstallPWA from '../components/InstallPWA';
import CanvasToolsModal from '../components/CanvasToolsModal';
import ImageEditorModal from '../components/ImageEditorModal';

// 瀵煎叆鍍忕礌鍖栧伐鍏峰拰绫诲瀷
import {
  PixelationMode,
  calculatePixelGrid,
  RgbColor,
  PaletteColor,
  MappedPixel,
  hexToRgb,
  colorDistance,
  findClosestPaletteColor
} from '../utils/pixelation';
import { calculateJettPixelGrid, isJettMode } from '../utils/jettPixelation';

// 瀵煎叆鏂扮殑绫诲瀷鍜岀粍浠?
import { DEFAULT_DOWNLOAD_OUTPUT_SCALE, GridDownloadOptions } from '../types/downloadTypes';
import DownloadSettingsModal, { gridLineColorOptions } from '../components/DownloadSettingsModal';
import { downloadImage, importCsvData } from '../utils/imageDownloader';

import { 
  colorSystemOptions, 
  convertPaletteToColorSystem, 
  getColorKeyByHex,
  getMardToHexMapping,
  sortColorsByHue,
  ColorSystem 
} from '../utils/colorSystemUtils';

// 娣诲姞鑷畾涔夊姩鐢绘牱寮?
const floatAnimation = `
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
    100% { transform: translateY(0px); }
  }
  .animate-float {
    animation: float 3s ease-in-out infinite;
  }
`;

// Helper function for sorting color keys - 淇濈暀鍘熸湁瀹炵幇锛屽洜涓烘湭鍦╱tils涓鍑?
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// --- Define available palette key sets ---
// 浠巆olorSystemMapping.json鑾峰彇鎵€鏈塎ARD鑹插彿
const mardToHexMapping = getMardToHexMapping();

// Pre-process the FULL palette data once - 浣跨敤colorSystemMapping鑰屼笉鏄痓eadPaletteData
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 浣跨敤hex鍊间綔涓簁ey锛岀鍚堟柊鐨勬灦鏋勮璁?
    return { key: hex, hex, rgb };
  })
  .filter((color): color is PaletteColor => color !== null);

type ManualEditTool = import('../components/ManualEditDock').ManualEditTool;

const manualEditTools: { tool: ManualEditTool; label: string; title: string }[] = [
  { tool: 'pan', label: '拖拽', title: '拖拽画布进行平移' },
  { tool: 'brush', label: '画笔', title: '单格上色，按住拖动可连续绘制' },
  { tool: 'eraser', label: '橡皮', title: '单格擦除，按住拖动可连续擦除' },
  { tool: 'picker', label: '取色', title: '从画布中选择颜色' },
  { tool: 'fill', label: '填充', title: '填充相邻的同色区域' },
  { tool: 'line', label: '直线', title: '点击起点，再点击终点' },
  { tool: 'rect', label: '矩形', title: '点击起点，再点击对角点' },
  { tool: 'select', label: '框选', title: '按住拖动画出选区' },
  { tool: 'move', label: '移动', title: '按住已有选区并拖动到新位置' },
  { tool: 'paste', label: '粘贴', title: '点击画布把剪贴板内容粘贴到目标位置' },
];

// ++ Add definition for background color keys ++

// 1. 瀵煎叆鏂扮粍浠?
import PixelatedPreviewCanvas from '../components/PixelatedPreviewCanvas';
import GridTooltip from '../components/GridTooltip';
import CustomPaletteEditor from '../components/CustomPaletteEditor';
import FloatingColorPalette from '../components/FloatingColorPalette';
import FloatingToolbar from '../components/FloatingToolbar';
import HistoryBackupModal from '../components/HistoryBackupModal';
import MagnifierTool from '../components/MagnifierTool';
import MagnifierSelectionOverlay from '../components/MagnifierSelectionOverlay';
import ManualEditDock from '../components/ManualEditDock';
import { loadPaletteSelections, savePaletteSelections, presetToSelections, PaletteSelections } from '../utils/localStorageUtils';
import { TRANSPARENT_KEY, transparentColorData } from '../utils/pixelEditingUtils';
import {
  ClipboardGrid,
  GridSelection,
  clearSelection,
  copySelection,
  normalizeSelection,
  pasteClipboard,
  recalculateGridStats,
  resizeGrid
} from '../utils/gridEditing';
import {
  PixelLayer,
  clonePixelGrid,
  compositePixelLayers,
  createBlankPixelGrid,
  createPixelLayer,
  normalizePixelLayers,
  resizePixelLayers,
  updatePixelLayerData
} from '../utils/layerUtils';

import FocusModePreDownloadModal from '../components/FocusModePreDownloadModal';
import ModernWorkspaceShell from '../components/ModernWorkspaceShell';
import { ConflictModal, ProjectListModal, ProjectToolbar } from '../components/ProjectManager';
import PreviewCardModal from '../components/PreviewCardModal';
import ShareCodeModal, { ShareGenerateOptions, SharePanel } from '../components/ShareCodeModal';
import { DatabaseBackupSummary, ProjectDetail, ProjectState, ProjectSummary, ProjectVersionSummary, SaveStatus, VersionConflict } from '../types/projectTypes';
import {
  createDatabaseBackupOnServer,
  createProjectOnServer,
  deleteProjectOnServer,
  fetchDatabaseBackups,
  fetchProject,
  fetchProjectVersions,
  fetchProjects,
  isVersionConflict,
  renameProjectOnServer,
  restoreProjectVersionOnServer,
  updateProjectOnServer
} from '../utils/projectApiClient';
import { createShareCode, readShareCode } from '../utils/shareCode';

export default function Home() {
  const [canvasSource, setCanvasSource] = useState<'image' | 'blank' | 'csv'>('image');
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<number>(50);
  const [granularityInput, setGranularityInput] = useState<string>("50");
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(30);
  const [similarityThresholdInput, setSimilarityThresholdInput] = useState<string>("30");
  // 娣诲姞鍍忕礌鍖栨ā寮忕姸鎬?
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.JettCartoon); // 榛樿浣跨敤 Jett Cartoon
  
  // 鏂板锛氳壊鍙风郴缁熼€夋嫨鐘舵€?
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');
  
  const [activeBeadPalette, setActiveBeadPalette] = useState<PaletteColor[]>(() => {
      return fullBeadPalette; // 榛樿浣跨敤鍏ㄩ儴棰滆壊
  });
  // 鐘舵€佸彉閲忥細瀛樺偍琚帓闄ょ殑棰滆壊锛坔ex鍊硷級
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState<boolean>(false);
  // 鐢ㄤ簬璁板綍鍒濆缃戞牸棰滆壊锛坔ex鍊硷級锛岀敤浜庢樉绀烘帓闄ゅ姛鑳?
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [pixelLayers, setPixelLayers] = useState<PixelLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [colorCounts, setColorCounts] = useState<{ [key: string]: { count: number; color: string } } | null>(null);
  const [totalBeadCount, setTotalBeadCount] = useState<number>(0);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, key: string, color: string } | null>(null);
  const [remapTrigger, setRemapTrigger] = useState<number>(0);
  const [isManualColoringMode, setIsManualColoringMode] = useState<boolean>(false);
  const [manualEditTool, setManualEditTool] = useState<ManualEditTool>('brush');
  const [manualBrushSize, setManualBrushSize] = useState<number>(1);
  const [manualShapeStart, setManualShapeStart] = useState<{ row: number; col: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState<MappedPixel | null>(null);
  // 鏂板锛氫竴閿摝闄ゆā寮忕姸鎬?
  const [isEraseMode, setIsEraseMode] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [isCustomPalette, setIsCustomPalette] = useState<boolean>(false);
  
  // ++ 鏂板锛氫笅杞借缃浉鍏崇姸鎬?++
  const [isDownloadSettingsOpen, setIsDownloadSettingsOpen] = useState<boolean>(false);
  const [downloadOptions, setDownloadOptions] = useState<GridDownloadOptions>({
    downloadTarget: 'image',
    showGrid: true,
    gridInterval: 10,
    showCoordinates: true,
    showCellNumbers: true,
    gridLineColor: gridLineColorOptions[0].value,
    includeStats: true, // 榛樿鍖呭惈缁熻淇℃伅
    exportCsv: false, // 榛樿涓嶅鍑篊SV
    outputScale: DEFAULT_DOWNLOAD_OUTPUT_SCALE,
    watermarkEnabled: true,
    watermarkText: '@鎷艰眴',
    watermarkStyle: 'tile'
  });

  // 鏂板锛氶珮浜浉鍏崇姸鎬?
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);

  // 鏂板锛氬畬鏁磋壊鏉垮垏鎹㈢姸鎬?
  const [showFullPalette, setShowFullPalette] = useState<boolean>(false);
  
  // 鏂板锛氶鑹叉浛鎹㈢浉鍏崇姸鎬?
  const [colorReplaceState, setColorReplaceState] = useState<{
    isActive: boolean;
    step: 'select-source' | 'select-target';
    sourceColor?: { key: string; color: string };
  }>({
    isActive: false,
    step: 'select-source'
  });

  // 鏂板锛氱粍浠舵寕杞界姸鎬?
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 鏂板锛氭偓娴皟鑹茬洏鐘舵€?
  const [isFloatingPaletteOpen, setIsFloatingPaletteOpen] = useState<boolean>(true);

  // 鏂板锛氭斁澶ч暅鐘舵€?
  const [isMagnifierActive, setIsMagnifierActive] = useState<boolean>(false);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // 鏂板锛氭椿璺冨伐鍏峰眰绾х鐞?
  const [activeFloatingTool, setActiveFloatingTool] = useState<'palette' | 'magnifier' | null>(null);

  // 鏂板锛氫笓蹇冩嫾璞嗘ā寮忚繘鍏ュ墠涓嬭浇鎻愰啋寮圭獥
  const [isFocusModePreDownloadModalOpen, setIsFocusModePreDownloadModalOpen] = useState<boolean>(false);

  // 鏂板锛氭í灞忚澶囧脊绐楃姸鎬?
  const [showDesktopModal, setShowDesktopModal] = useState<boolean>(false);

  // 鏂板锛氱紪杈戞挙鍥炲巻鍙叉爤锛堝姝ワ級
  interface EditSnapshot {
    mappedPixelData: MappedPixel[][];
    pixelLayers?: PixelLayer[];
    activeLayerId?: string | null;
    colorCounts: { [key: string]: { count: number; color: string } };
    totalBeadCount: number;
  }
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([]);

  // 鏂板锛氫竴閿幓鑳屾櫙鎾ゅ洖蹇収锛堝崟姝ワ級
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 鏂板锛氳交閲忔彁绀?
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('未命名项目');
  const [currentProjectVersion, setCurrentProjectVersion] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState<boolean>(false);
  const [projectVersions, setProjectVersions] = useState<ProjectVersionSummary[]>([]);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackupSummary[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [versionConflict, setVersionConflict] = useState<VersionConflict | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareModalInitialPanel, setShareModalInitialPanel] = useState<SharePanel>('share');
  const [shareCode, setShareCode] = useState<string>('');
  const [isShareCodeGenerating, setIsShareCodeGenerating] = useState<boolean>(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState<boolean>(false);
  const [isCanvasToolsOpen, setIsCanvasToolsOpen] = useState<boolean>(false);
  const [selectionClipboard, setSelectionClipboard] = useState<ClipboardGrid | null>(null);
  const [activeSelection, setActiveSelection] = useState<GridSelection | null>(null);
  const [selectionDragStart, setSelectionDragStart] = useState<{ row: number; col: number } | null>(null);
  const [selectionMoveState, setSelectionMoveState] = useState<{
    origin: { row: number; col: number };
    selection: GridSelection;
    clipboard: ClipboardGrid;
    baseData: MappedPixel[][];
  } | null>(null);
  const isRestoringProjectRef = useRef(false);
  const skipNextPixelateRef = useRef(false);
  const lastSavedSnapshotRef = useRef<string>('');
  const latestStateSnapshotRef = useRef<string>('');

  const openShareModal = useCallback((panel: SharePanel = 'share') => {
    setShareModalInitialPanel(panel);
    setIsShareModalOpen(true);
  }, []);

  // 鏀惧ぇ闀滃垏鎹㈠鐞嗗嚱鏁?
  const handleToggleMagnifier = () => {
    const newActiveState = !isMagnifierActive;
    setIsMagnifierActive(newActiveState);
    
    // 濡傛灉鍏抽棴鏀惧ぇ闀滐紝娓呴櫎閫夋嫨鍖哄煙锛岄噸鏂板紑濮?
    if (!newActiveState) {
      setMagnifierSelectionArea(null);
    }
  };

  // 婵€娲诲伐鍏峰鐞嗗嚱鏁?
  const handleActivatePalette = () => {
    setActiveFloatingTool('palette');
  };

  const handleActivateMagnifier = () => {
    setActiveFloatingTool('magnifier');
  };

  // --- 鎾ゅ洖鍔熻兘 ---

  // 淇濆瓨缂栬緫蹇収鍒板巻鍙叉爤
  const saveEditSnapshot = useCallback(() => {
    if (!mappedPixelData || !colorCounts) return;
    const snapshot: EditSnapshot = {
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      pixelLayers: pixelLayers.map(layer => ({ ...layer, data: clonePixelGrid(layer.data) })),
      activeLayerId,
      colorCounts: { ...colorCounts },
      totalBeadCount,
    };
    setEditHistory(prev => [...prev.slice(-49), snapshot]);
  }, [activeLayerId, mappedPixelData, colorCounts, pixelLayers, totalBeadCount]);

  // 缂栬緫妯″紡澶氭鎾ゅ洖
  const handleUndoEdit = useCallback(() => {
    if (editHistory.length === 0) return;
    const snapshot = editHistory[editHistory.length - 1];
    setMappedPixelData(snapshot.mappedPixelData);
    if (snapshot.pixelLayers) {
      setPixelLayers(snapshot.pixelLayers.map(layer => ({ ...layer, data: clonePixelGrid(layer.data) })));
      setActiveLayerId(snapshot.activeLayerId || snapshot.pixelLayers[0]?.id || null);
    } else {
      const restoredLayer = createPixelLayer('主体', snapshot.mappedPixelData, { id: 'layer-main' });
      setPixelLayers([restoredLayer]);
      setActiveLayerId(restoredLayer.id);
    }
    setColorCounts(snapshot.colorCounts);
    setTotalBeadCount(snapshot.totalBeadCount);
    setEditHistory(prev => prev.slice(0, -1));
    showToast('已撤回上一步');
  }, [editHistory, showToast]);

  // 涓€閿幓鑳屾櫙鍗曟鎾ゅ洖
  const handleUndoBgRemoval = useCallback(() => {
    if (!bgRemovalSnapshot) return;
    setMappedPixelData(bgRemovalSnapshot.mappedPixelData);
    if (bgRemovalSnapshot.pixelLayers) {
      setPixelLayers(bgRemovalSnapshot.pixelLayers.map(layer => ({ ...layer, data: clonePixelGrid(layer.data) })));
      setActiveLayerId(bgRemovalSnapshot.activeLayerId || bgRemovalSnapshot.pixelLayers[0]?.id || null);
    } else {
      const restoredLayer = createPixelLayer('主体', bgRemovalSnapshot.mappedPixelData, { id: 'layer-main' });
      setPixelLayers([restoredLayer]);
      setActiveLayerId(restoredLayer.id);
    }
    setColorCounts(bgRemovalSnapshot.colorCounts);
    setTotalBeadCount(bgRemovalSnapshot.totalBeadCount);
    setBgRemovalSnapshot(null);
    showToast('已撤回背景去除');
  }, [bgRemovalSnapshot, showToast]);

  // 娓呯┖缂栬緫鍘嗗彶锛堝弬鏁板彉鍖栥€侀€€鍑虹紪杈戞ā寮忕瓑鏃惰皟鐢級
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  // 鏀惧ぇ闀滃儚绱犵紪杈戝鐞嗗嚱鏁?
  const handleMagnifierPixelEdit = (row: number, col: number, colorData: { key: string; color: string }) => {
    if (!mappedPixelData) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;

    const oldPixel = editPixelData[row][col];
    if (!oldPixel || oldPixel.key === colorData.key) return;

    // 鍒涘缓鏂扮殑鍍忕礌鏁版嵁
    const newMappedPixelData = editPixelData.map((rowData, r) =>
      rowData.map((pixel, c) => {
        if (r === row && c === col) {
          return {
            key: colorData.key,
            color: colorData.color
          } as MappedPixel;
        }
        return pixel;
      })
    );

    applyGridEdit(newMappedPixelData);

    // 鏇存柊棰滆壊缁熻
    if (colorCounts) {
      const newColorCounts = { ...colorCounts };

      // 鍑忓皯鍘熼鑹茬殑璁℃暟
      if (newColorCounts[oldPixel.key]) {
        newColorCounts[oldPixel.key].count--;
        if (newColorCounts[oldPixel.key].count === 0) {
          delete newColorCounts[oldPixel.key];
        }
      }

      // 澧炲姞鏂伴鑹茬殑璁℃暟
      if (newColorCounts[colorData.key]) {
        newColorCounts[colorData.key].count++;
      } else {
        newColorCounts[colorData.key] = {
          count: 1,
          color: colorData.color
        };
      }

      setColorCounts(newColorCounts);

      // 鏇存柊鎬昏鏁?
      const newTotal = Object.values(newColorCounts).reduce((sum, item) => sum + item.count, 0);
      setTotalBeadCount(newTotal);
    }
  };

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ++ 娣诲姞: Ref for import file input ++
  const importPaletteInputRef = useRef<HTMLInputElement>(null);
  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ Re-add touch refs needed for tooltip logic ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ Add a ref for the main element ++
  const mainRef = useRef<HTMLElement>(null);

  // --- Derived State ---

  // Update active palette based on selection and exclusions
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 鏍规嵁閫夋嫨鐨勮壊鍙风郴缁熻浆鎹㈣皟鑹叉澘
    const convertedPalette = convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem);
    setActiveBeadPalette(convertedPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // ++ 娣诲姞锛氬綋鐘舵€佸彉鍖栨椂鍚屾鏇存柊杈撳叆妗嗙殑鍊?++
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, similarityThreshold]);

  // ++ Calculate unique colors currently on the grid for the palette ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // 浣跨敤hex鍊艰繘琛屽幓閲嶏紝閬垮厤澶氫釜MARD鑹插彿瀵瑰簲鍚屼竴涓洰鏍囪壊鍙风郴缁熷€兼椂浜х敓閲嶅key
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 瀛樺偍hex鍊间綔涓簁ey锛屼繚鎸侀鑹蹭俊鎭?
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 杞崲涓烘暟缁勫苟涓烘瘡涓猦ex鍊肩敓鎴愬搴旂殑鑹插彿绯荤粺鏄剧ず
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 浣跨敤鑹茬浉鎺掑簭鑰屼笉鏄壊鍙锋帓搴?
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  const activePixelLayer = useMemo(
    () => pixelLayers.find(layer => layer.id === activeLayerId) || pixelLayers[0] || null,
    [pixelLayers, activeLayerId]
  );

  // 鍒濆鍖栨椂浠庢湰鍦板瓨鍌ㄥ姞杞借嚜瀹氫箟鑹叉澘閫夋嫨
  useEffect(() => {
    // 灏濊瘯浠巐ocalStorage鍔犺浇
    const savedSelections = loadPaletteSelections();
    if (savedSelections && Object.keys(savedSelections).length > 0) {
      console.log('浠巐ocalStorage鍔犺浇鐨勬暟鎹敭鏁伴噺:', Object.keys(savedSelections).length);
      // 楠岃瘉鍔犺浇鐨勬暟鎹槸鍚﹂兘鏄湁鏁堢殑hex鍊?
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      let hasValidData = false;
      let validCount = 0;
      let invalidCount = 0;
      
      Object.entries(savedSelections).forEach(([key, value]) => {
        // 涓ユ牸楠岃瘉锛氶敭蹇呴』鏄湁鏁堢殑hex鏍煎紡锛屽苟涓斿瓨鍦ㄤ簬璋冭壊鏉夸腑
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
          hasValidData = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      console.log('验证结果: 有效键 ' + validCount + ' 个，无效键 ' + invalidCount + ' 个');
      
      if (hasValidData) {
        setCustomPaletteSelections(validSelections);
    setIsCustomPalette(true);
    } else {
        console.log('鎵€鏈夋暟鎹兘鏃犳晥锛屾竻闄ocalStorage骞堕噸鏂板垵濮嬪寲');
        // 濡傛灉鏈湴鏁版嵁鏃犳晥锛屾竻闄ocalStorage骞堕粯璁ら€夋嫨鎵€鏈夐鑹?
        localStorage.removeItem('customPerlerPaletteSelections');
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
    } else {
      console.log('没有本地色板数据，默认选择所有颜色');
      // 濡傛灉娌℃湁淇濆瓨鐨勯€夋嫨锛岄粯璁ら€夋嫨鎵€鏈夐鑹?
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
  }, []); // 鍙湪缁勪欢棣栨鍔犺浇鏃舵墽琛?

  // 鏇存柊 activeBeadPalette 鍩轰簬鑷畾涔夐€夋嫨鍜屾帓闄ゅ垪琛?
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      // 浣跨敤hex鍊艰繘琛屾帓闄ゆ鏌?
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 涓嶈繘琛岃壊鍙风郴缁熻浆鎹紝淇濇寔鍘熷鐨凪ARD鑹插彿鍜宧ex鍊?
    setActiveBeadPalette(newActiveBeadPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger]);

  // --- Event Handlers ---

  // 涓撳績鎷艰眴妯″紡鐩稿叧澶勭悊鍑芥暟
  const handleEnterFocusMode = () => {
    setIsFocusModePreDownloadModalOpen(true);
  };

  const handleProceedToFocusMode = () => {
    // 淇濆瓨鏁版嵁鍒發ocalStorage渚涗笓蹇冩嫾璞嗘ā寮忎娇鐢?
    localStorage.setItem('focusMode_pixelData', JSON.stringify(mappedPixelData));
    localStorage.setItem('focusMode_gridDimensions', JSON.stringify(gridDimensions));
    localStorage.setItem('focusMode_colorCounts', JSON.stringify(colorCounts));
    localStorage.setItem('focusMode_selectedColorSystem', selectedColorSystem);
    
    // 璺宠浆鍒颁笓蹇冩嫾璞嗛〉闈?
    window.location.href = '/focus';
  };

  // 娣诲姞涓€涓畨鍏ㄧ殑鏂囦欢杈撳叆瑙﹀彂鍑芥暟
  const triggerFileInput = useCallback(() => {
    // 妫€鏌ョ粍浠舵槸鍚﹀凡鎸傝浇
    if (!isMounted) {
      console.warn("缁勪欢灏氭湭瀹屽叏鎸傝浇锛屽欢杩熻Е鍙戞枃浠堕€夋嫨");
      setTimeout(() => triggerFileInput(), 200);
      return;
    }
    
    // 妫€鏌?ref 鏄惁瀛樺湪
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
      } catch (error) {
        console.error("瑙﹀彂鏂囦欢閫夋嫨澶辫触:", error);
        // 濡傛灉鐩存帴鐐瑰嚮澶辫触锛屽皾璇曞欢杩熸墽琛?
        setTimeout(() => {
          try {
            fileInputRef.current?.click();
          } catch (retryError) {
            console.error("閲嶈瘯瑙﹀彂鏂囦欢閫夋嫨澶辫触:", retryError);
          }
        }, 100);
      }
    } else {
      // 濡傛灉 ref 涓嶅瓨鍦紝寤惰繜閲嶈瘯
      console.warn('文件输入引用不存在，将稍后重试');
      setTimeout(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.click();
          } catch (error) {
            console.error("寤惰繜瑙﹀彂鏂囦欢閫夋嫨澶辫触:", error);
          }
        }
      }, 100);
    }
  }, [isMounted]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 妫€鏌ユ枃浠剁被鍨嬫槸鍚︽敮鎸?
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      
      // 鏀寔鐨勫浘鐗囩被鍨?
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      // 鏀寔鐨凜SV MIME绫诲瀷锛堜笉鍚屾祻瑙堝櫒鍙兘杩斿洖涓嶅悓鐨凪IME绫诲瀷锛?
      const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

      const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
      const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

      if (isImageFile || isCsvFile) {
        setExcludedColorKeys(new Set()); // ++ 閲嶇疆鎺掗櫎鍒楄〃 ++
        processFile(file);
      } else {
        alert('Unsupported file type: ' + (file.type || 'unknown') + '. File name: ' + file.name);
        console.warn('Unsupported file type: ' + file.type + ', file name: ' + file.name);
      }
    }
    // 閲嶇疆鏂囦欢杈撳叆妗嗙殑鍊硷紝杩欐牱鐢ㄦ埛鍙互閲嶆柊閫夋嫨鍚屼竴涓枃浠?
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        
        // 浣跨敤涓巋andleFileChange鐩稿悓鐨勬枃浠剁被鍨嬫鏌ラ€昏緫
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();
        
        // 鏀寔鐨勫浘鐗囩被鍨?
        const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        // 鏀寔鐨凜SV MIME绫诲瀷锛堜笉鍚屾祻瑙堝櫒鍙兘杩斿洖涓嶅悓鐨凪IME绫诲瀷锛?
        const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

        const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
        const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

        if (isImageFile || isCsvFile) {
          setExcludedColorKeys(new Set()); // ++ 閲嶇疆鎺掗櫎鍒楄〃 ++
          processFile(file);
        } else {
          alert('Unsupported file type: ' + (file.type || 'unknown') + '. File name: ' + file.name);
          console.warn('Unsupported file type: ' + file.type + ', file name: ' + file.name);
        }
      }
    } catch (error) {
      console.error("澶勭悊鎷栨嫿鏂囦欢鏃跺彂鐢熼敊璇?", error);
      alert('处理文件时发生错误，请重试。');
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 鏍规嵁mappedPixelData鐢熸垚鍚堟垚鐨刼riginalImageSrc
  const generateSyntheticImageFromPixelData = (pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('无法创建 canvas 上下文');
      return '';
    }
    
    // 璁剧疆鐢诲竷灏哄锛屾瘡涓儚绱犵敤8x8鍍忕礌鏉ヨ〃绀轰互纭繚娓呮櫚搴?
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 缁樺埗姣忎釜鍍忕礌
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          // 浣跨敤棰滆壊锛屽閮ㄥ崟鍏冩牸鐢ㄧ櫧鑹?
          const color = cell.isExternal ? '#FFFFFF' : cell.color;
          ctx.fillStyle = color;
          ctx.fillRect(
            colIndex * pixelSize, 
            rowIndex * pixelSize, 
            pixelSize, 
            pixelSize
          );
        }
      });
    });
    
    // 杞崲涓篸ataURL
    return canvas.toDataURL('image/png');
  };

  const getDefaultPaintColor = useCallback((): MappedPixel | null => {
    const candidate = activeBeadPalette.find(color => color.hex.toUpperCase() !== '#FFFFFF')
      || activeBeadPalette[0]
      || fullBeadPalette.find(color => color.hex.toUpperCase() !== '#FFFFFF')
      || fullBeadPalette[0];

    if (!candidate) return null;

    return {
      key: getColorKeyByHex(candidate.hex, selectedColorSystem),
      color: candidate.hex,
      isExternal: false,
    };
  }, [activeBeadPalette, selectedColorSystem]);

  const applyCompositeGrid = useCallback((layers: PixelLayer[], dimensions: { N: number; M: number } | null) => {
    const composite = compositePixelLayers(layers, dimensions);
    const stats = composite ? recalculateGridStats(composite) : null;

    setMappedPixelData(composite);
    setColorCounts(stats?.colorCounts || null);
    setTotalBeadCount(stats?.totalBeadCount || 0);
    setInitialGridColorKeys(stats?.initialGridColorKeys || new Set());

    return composite;
  }, []);

  const replaceProjectGrid = useCallback((
    nextPixelData: MappedPixel[][] | null,
    nextDimensions: { N: number; M: number } | null,
    layerName = '涓讳綋'
  ) => {
    setMappedPixelData(nextPixelData);
    setGridDimensions(nextDimensions);

    if (nextPixelData && nextDimensions) {
      const nextLayer = createPixelLayer(layerName, nextPixelData, { id: 'layer-main' });
      const stats = recalculateGridStats(nextPixelData);

      setPixelLayers([nextLayer]);
      setActiveLayerId(nextLayer.id);
      setColorCounts(stats.colorCounts);
      setTotalBeadCount(stats.totalBeadCount);
      setInitialGridColorKeys(stats.initialGridColorKeys);
    } else {
      setPixelLayers([]);
      setActiveLayerId(null);
      setColorCounts(null);
      setTotalBeadCount(0);
      setInitialGridColorKeys(new Set());
    }
  }, []);

  const handleCreateBlankCanvas = useCallback(() => {
    const widthInput = window.prompt('请输入空白画布宽度（10-300）', '50');
    if (widthInput === null) return;

    const heightInput = window.prompt('请输入空白画布高度（10-300）', widthInput);
    if (heightInput === null) return;

    const clampSize = (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) return 50;
      return Math.min(300, Math.max(10, parsed));
    };

    const N = clampSize(widthInput);
    const M = clampSize(heightInput);
    const blankPixelData = createBlankPixelGrid({ N, M });
    const dimensions = { N, M };

    skipNextPixelateRef.current = true;
    setCanvasSource('blank');
    setOriginalImageSrc(generateSyntheticImageFromPixelData(blankPixelData, dimensions));
    replaceProjectGrid(blankPixelData, dimensions, '涓讳綋');
    setExcludedColorKeys(new Set());
    setGranularity(N);
    setGranularityInput(N.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
    setCurrentProjectId(null);
    setCurrentProjectName('空白画布 ' + N + 'x' + M);
    setCurrentProjectVersion(0);
    setActiveSelection(null);
    setSelectionDragStart(null);
    setSelectionMoveState(null);
    setSelectionClipboard(null);
    setIsManualColoringMode(true);
    setManualEditTool('brush');
    setManualShapeStart(null);
    setSelectedColor(getDefaultPaintColor());
    setIsEraseMode(false);
    setShowFullPalette(true);
    setIsFloatingPaletteOpen(true);
    setActiveFloatingTool('palette');
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
    showToast('已创建空白画布 ' + N + 'x' + M);
  }, [getDefaultPaintColor, replaceProjectGrid, similarityThreshold, showToast]);

  const generateProjectThumbnail = useCallback((pixelData: MappedPixel[][] | null, dimensions: { N: number; M: number } | null): string | null => {
    if (!pixelData || !dimensions) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = 160;
    canvas.height = 160;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellSize = Math.max(1, Math.floor(Math.min(canvas.width / dimensions.N, canvas.height / dimensions.M)));
    const offsetX = Math.floor((canvas.width - dimensions.N * cellSize) / 2);
    const offsetY = Math.floor((canvas.height - dimensions.M * cellSize) / 2);

    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        ctx.fillStyle = cell?.isExternal ? '#ffffff' : cell?.color || '#ffffff';
        ctx.fillRect(offsetX + colIndex * cellSize, offsetY + rowIndex * cellSize, cellSize, cellSize);
      });
    });

    return canvas.toDataURL('image/png');
  }, []);

  const buildProjectState = useCallback((): ProjectState => ({
    canvasSource,
    originalImageSrc,
    granularity,
    similarityThreshold,
    pixelationMode,
    selectedColorSystem,
    customPaletteSelections,
    excludedColorKeys: Array.from(excludedColorKeys),
    initialGridColorKeys: Array.from(initialGridColorKeys),
    mappedPixelData,
    pixelLayers,
    activeLayerId,
    gridDimensions,
    colorCounts,
    totalBeadCount,
    downloadOptions,
  }), [
    canvasSource,
    originalImageSrc,
    granularity,
    similarityThreshold,
    pixelationMode,
    selectedColorSystem,
    customPaletteSelections,
    excludedColorKeys,
    initialGridColorKeys,
    mappedPixelData,
    pixelLayers,
    activeLayerId,
    gridDimensions,
    colorCounts,
    totalBeadCount,
    downloadOptions,
  ]);

  const restoreProjectState = useCallback((state: ProjectState, options: {
    id: string | null;
    name: string;
    version: number;
  }) => {
    isRestoringProjectRef.current = true;
    skipNextPixelateRef.current = true;
    const restoredCanvasSource = state.canvasSource || 'image';
    const shouldOpenAsBlankCanvas = restoredCanvasSource === 'blank';
    const restoredLayers = normalizePixelLayers(state.pixelLayers, state.mappedPixelData, state.gridDimensions);
    const restoredActiveLayerId = restoredLayers.some(layer => layer.id === state.activeLayerId)
      ? state.activeLayerId || null
      : restoredLayers[0]?.id || null;
    const restoredComposite = compositePixelLayers(restoredLayers, state.gridDimensions) || state.mappedPixelData;
    const restoredStats = restoredComposite ? recalculateGridStats(restoredComposite) : null;

    setCurrentProjectId(options.id);
    setCurrentProjectName(options.name);
    setCurrentProjectVersion(options.version);
    setCanvasSource(restoredCanvasSource);
    setOriginalImageSrc(state.originalImageSrc);
    setGranularity(state.granularity);
    setGranularityInput(state.granularity.toString());
    setSimilarityThreshold(state.similarityThreshold);
    setSimilarityThresholdInput(state.similarityThreshold.toString());
    setPixelationMode(state.pixelationMode);
    setSelectedColorSystem(state.selectedColorSystem as ColorSystem);
    setCustomPaletteSelections(state.customPaletteSelections);
    setExcludedColorKeys(new Set(state.excludedColorKeys));
    setInitialGridColorKeys(restoredStats?.initialGridColorKeys || new Set(state.initialGridColorKeys));
    setMappedPixelData(restoredComposite);
    setPixelLayers(restoredLayers);
    setActiveLayerId(restoredActiveLayerId);
    setGridDimensions(state.gridDimensions);
    setColorCounts(restoredStats?.colorCounts || state.colorCounts);
    setTotalBeadCount(restoredStats?.totalBeadCount ?? state.totalBeadCount);
    setActiveSelection(null);
    setSelectionDragStart(null);
    setSelectionMoveState(null);
    setSelectionClipboard(null);
    setDownloadOptions({
      ...downloadOptions,
      ...state.downloadOptions,
    });
    setIsManualColoringMode(shouldOpenAsBlankCanvas);
    setManualEditTool('brush');
    setManualShapeStart(null);
    setSelectedColor(shouldOpenAsBlankCanvas ? getDefaultPaintColor() : null);
    setIsEraseMode(false);
    setShowFullPalette(shouldOpenAsBlankCanvas);
    setIsFloatingPaletteOpen(shouldOpenAsBlankCanvas);
    setActiveFloatingTool(shouldOpenAsBlankCanvas ? 'palette' : null);
    setVersionConflict(null);
    setSaveStatus('saved');
    setHasUnsavedChanges(false);
    lastSavedSnapshotRef.current = JSON.stringify(state);
    latestStateSnapshotRef.current = lastSavedSnapshotRef.current;

    window.setTimeout(() => {
      isRestoringProjectRef.current = false;
    }, 0);
  }, [downloadOptions, getDefaultPaintColor]);

  const applyProject = useCallback((project: ProjectDetail) => {
    restoreProjectState(project.state_json, {
      id: project.id,
      name: project.name,
      version: project.version,
    });
  }, [restoreProjectState]);

  const refreshProjects = useCallback(async () => {
    setIsProjectsLoading(true);
    try {
      setProjects(await fetchProjects());
    } catch (error) {
      console.error('鍔犺浇椤圭洰鍒楄〃澶辫触:', error);
      showToast('鍔犺浇椤圭洰鍒楄〃澶辫触');
    } finally {
      setIsProjectsLoading(false);
    }
  }, [showToast]);

  const refreshHistoryAndBackups = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const [versions, backups] = await Promise.all([
        currentProjectId ? fetchProjectVersions(currentProjectId) : Promise.resolve([]),
        fetchDatabaseBackups(),
      ]);
      setProjectVersions(versions);
      setDatabaseBackups(backups);
    } catch (error) {
      console.error('鍔犺浇鍘嗗彶涓庡浠藉け璐?', error);
      showToast('加载历史与备份失败');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [currentProjectId, showToast]);

  const handleOpenHistory = useCallback(() => {
    setIsHistoryModalOpen(true);
    refreshHistoryAndBackups();
  }, [refreshHistoryAndBackups]);

  const handleRestoreVersion = useCallback(async (version: number) => {
    if (!currentProjectId) return;
    if (!window.confirm('确定恢复到版本 ' + version + ' 吗？当前状态会被保存为新的恢复版本。')) return;

    try {
      const project = await restoreProjectVersionOnServer(currentProjectId, version);
      applyProject(project);
      refreshHistoryAndBackups();
      refreshProjects();
      showToast('已恢复到版本 ' + version);
    } catch (error) {
      console.error('鎭㈠鐗堟湰澶辫触:', error);
      showToast('鎭㈠鐗堟湰澶辫触');
    }
  }, [applyProject, currentProjectId, refreshHistoryAndBackups, refreshProjects, showToast]);

  const handleCreateBackup = useCallback(async () => {
    try {
      await createDatabaseBackupOnServer('manual');
      setDatabaseBackups(await fetchDatabaseBackups());
      showToast('鏈嶅姟鍣ㄥ浠藉凡鍒涘缓');
    } catch (error) {
      console.error('鍒涘缓澶囦唤澶辫触:', error);
      showToast('鍒涘缓澶囦唤澶辫触');
    }
  }, [showToast]);

  const persistProject = useCallback(async (options?: { saveAs?: boolean; force?: boolean }) => {
    if (!mappedPixelData || !gridDimensions) {
      showToast('璇峰厛鐢熸垚鎷艰眴鍥剧焊');
      return;
    }

    const state = buildProjectState();
    const stateSnapshot = JSON.stringify(state);
    latestStateSnapshotRef.current = stateSnapshot;
    const thumbnail = generateProjectThumbnail(mappedPixelData, gridDimensions);
    const name = currentProjectName.trim() || '未命名项目';

    setSaveStatus('saving');
    try {
      const project = options?.saveAs || !currentProjectId
        ? await createProjectOnServer({ name, thumbnail, state_json: state })
        : await updateProjectOnServer({
            id: currentProjectId,
            name,
            thumbnail,
            state_json: state,
            version: currentProjectVersion,
            force: options?.force,
          });

      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setCurrentProjectVersion(project.version);
      const hasNewerLocalChanges = latestStateSnapshotRef.current !== '' && latestStateSnapshotRef.current !== stateSnapshot;
      setSaveStatus(hasNewerLocalChanges ? 'dirty' : 'saved');
      setHasUnsavedChanges(hasNewerLocalChanges);
      setVersionConflict(null);
      lastSavedSnapshotRef.current = stateSnapshot;
      if (!hasNewerLocalChanges) {
        latestStateSnapshotRef.current = stateSnapshot;
      }
      showToast(options?.saveAs ? '已另存为新项目' : '已保存');
      if (isProjectsModalOpen) {
        refreshProjects();
      }
    } catch (error) {
      if (isVersionConflict(error)) {
        setVersionConflict(error);
        setSaveStatus('conflict');
        return;
      }

      console.error('淇濆瓨椤圭洰澶辫触:', error);
      setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      showToast('淇濆瓨澶辫触锛岃鎵嬪姩閲嶈瘯');
    }
  }, [
    mappedPixelData,
    gridDimensions,
    buildProjectState,
    generateProjectThumbnail,
    currentProjectName,
    currentProjectId,
    currentProjectVersion,
    isProjectsModalOpen,
    refreshProjects,
    showToast,
  ]);

  const handleOpenProjects = useCallback(() => {
    setIsProjectsModalOpen(true);
    refreshProjects();
  }, [refreshProjects]);

  const handleOpenProject = useCallback(async (id: string) => {
    if (hasUnsavedChanges && !window.confirm('当前有未保存修改，打开其他项目会覆盖当前页面状态。继续吗？')) {
      return;
    }

    try {
      const project = await fetchProject(id);
      applyProject(project);
      setIsProjectsModalOpen(false);
      showToast('椤圭洰宸叉墦寮€');
    } catch (error) {
      console.error('鎵撳紑椤圭洰澶辫触:', error);
      showToast('鎵撳紑椤圭洰澶辫触');
    }
  }, [applyProject, hasUnsavedChanges, showToast]);

  const handleRenameProject = useCallback(async (project: ProjectSummary) => {
    const name = window.prompt('杈撳叆鏂扮殑椤圭洰鍚嶇О', project.name);
    if (!name) return;

    try {
      const renamed = await renameProjectOnServer(project.id, name);
      if (project.id === currentProjectId) {
        setCurrentProjectName(renamed.name);
      }
      refreshProjects();
      showToast('椤圭洰宸查噸鍛藉悕');
    } catch (error) {
      console.error('閲嶅懡鍚嶉」鐩け璐?', error);
      showToast('重命名失败');
    }
  }, [currentProjectId, refreshProjects, showToast]);

  const handleDeleteProject = useCallback(async (project: ProjectSummary) => {
    if (!window.confirm('确定删除 "' + project.name + '" 吗？')) return;

    try {
      await deleteProjectOnServer(project.id);
      if (project.id === currentProjectId) {
        setCurrentProjectId(null);
        setCurrentProjectVersion(0);
        setSaveStatus('dirty');
        setHasUnsavedChanges(true);
      }
      refreshProjects();
      showToast('项目已删除');
    } catch (error) {
      console.error('鍒犻櫎椤圭洰澶辫触:', error);
      showToast('鍒犻櫎澶辫触');
    }
  }, [currentProjectId, refreshProjects, showToast]);

  const handleGenerateShareCode = useCallback(async (options: ShareGenerateOptions) => {
    if (!mappedPixelData || !gridDimensions) {
      showToast('璇峰厛鐢熸垚鎷艰眴鍥剧焊');
      return;
    }

    setIsShareCodeGenerating(true);
    try {
      const code = await createShareCode({
        name: options.name?.trim() || currentProjectName.trim() || '未命名项目',
        state: buildProjectState(),
        password: options.visibility === 'private' ? options.password : undefined,
      });
      setShareCode(code);
      await navigator.clipboard?.writeText(code);
      showToast('鍒嗕韩鐮佸凡鐢熸垚');
    } catch (error) {
      console.error('鐢熸垚鍒嗕韩鐮佸け璐?', error);
      showToast('生成分享码失败');
    } finally {
      setIsShareCodeGenerating(false);
    }
  }, [mappedPixelData, gridDimensions, currentProjectName, buildProjectState, showToast]);

  const handleImportShareCode = useCallback(async (code: string, password?: string) => {
    try {
      const sharedProject = await readShareCode(code, password);
      restoreProjectState(sharedProject.state, {
        id: null,
        name: (sharedProject.name || '分享作品') + ' 副本',
        version: 0,
      });
      setSaveStatus('dirty');
      setHasUnsavedChanges(true);
      setIsShareModalOpen(false);
      showToast('鍒嗕韩鐮佸凡瀵煎叆');
    } catch (error) {
      console.error('瀵煎叆鍒嗕韩鐮佸け璐?', error);
      showToast(error instanceof Error ? error.message : '导入分享码失败');
    }
  }, [restoreProjectState, showToast]);

  const handleApplyEditedImage = useCallback((editedImageSrc: string) => {
    setOriginalImageSrc(editedImageSrc);
    setRemapTrigger(prev => prev + 1);
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
    setIsImageEditorOpen(false);
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
    showToast('图片编辑已应用');
  }, [showToast]);

  const applyGridEdit = useCallback((nextPixelData: MappedPixel[][], nextDimensions?: { N: number; M: number }) => {
    saveEditSnapshot();

    if (activeLayerId && pixelLayers.length > 0 && !nextDimensions) {
      const activeLayer = pixelLayers.find(layer => layer.id === activeLayerId);
      if (activeLayer?.locked) {
        showToast('当前图层已锁定');
        return;
      }

      const nextLayers = updatePixelLayerData(pixelLayers, activeLayerId, nextPixelData);
      setPixelLayers(nextLayers);
      applyCompositeGrid(nextLayers, gridDimensions);
    } else {
      const stats = recalculateGridStats(nextPixelData);
      setMappedPixelData(nextPixelData);
      setColorCounts(stats.colorCounts);
      setTotalBeadCount(stats.totalBeadCount);
      setInitialGridColorKeys(stats.initialGridColorKeys);
    }

    if (nextDimensions) {
      setGridDimensions(nextDimensions);
      setGranularity(nextDimensions.N);
      setGranularityInput(nextDimensions.N.toString());
    }
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
  }, [activeLayerId, applyCompositeGrid, gridDimensions, pixelLayers, saveEditSnapshot, showToast]);

  const handleResizeCanvas = useCallback((width: number, height: number, anchor: 'top-left' | 'center') => {
    if (!mappedPixelData || !gridDimensions) return;

    const nextDimensions = {
      N: Math.min(300, Math.max(1, Math.round(width))),
      M: Math.min(300, Math.max(1, Math.round(height))),
    };
    if (nextDimensions.N === gridDimensions.N && nextDimensions.M === gridDimensions.M) {
      showToast('画布尺寸未变化');
      return;
    }

    saveEditSnapshot();
    const nextLayers = pixelLayers.length > 0
      ? resizePixelLayers(pixelLayers, data => resizeGrid(data, gridDimensions, nextDimensions, anchor))
      : [createPixelLayer('主体', resizeGrid(mappedPixelData, gridDimensions, nextDimensions, anchor), { id: 'layer-main' })];

    setPixelLayers(nextLayers);
    setActiveLayerId(activeLayerId && nextLayers.some(layer => layer.id === activeLayerId) ? activeLayerId : nextLayers[0]?.id || null);
    setGridDimensions(nextDimensions);
    setGranularity(nextDimensions.N);
    setGranularityInput(nextDimensions.N.toString());
    applyCompositeGrid(nextLayers, nextDimensions);
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
    showToast('画布尺寸已调整为 ' + nextDimensions.N + 'x' + nextDimensions.M);
  }, [activeLayerId, applyCompositeGrid, mappedPixelData, gridDimensions, pixelLayers, saveEditSnapshot, showToast]);

  const handleCopySelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    const normalized = normalizeSelection(selection, gridDimensions);
    setSelectionClipboard(copySelection(editPixelData, normalized));
    setActiveSelection(normalized);
    showToast('选区已复制');
  }, [activePixelLayer, mappedPixelData, gridDimensions, showToast]);

  const handleCutSelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    const normalized = normalizeSelection(selection, gridDimensions);
    setSelectionClipboard(copySelection(editPixelData, normalized));
    applyGridEdit(clearSelection(editPixelData, normalized));
    setActiveSelection(null);
    showToast('选区已剪切');
  }, [activePixelLayer, mappedPixelData, gridDimensions, applyGridEdit, showToast]);

  const handleDeleteSelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    applyGridEdit(clearSelection(editPixelData, normalizeSelection(selection, gridDimensions)));
    setActiveSelection(null);
    showToast('选区已删除');
  }, [activePixelLayer, mappedPixelData, gridDimensions, applyGridEdit, showToast]);

  const handlePasteSelection = useCallback((row: number, col: number) => {
    if (!mappedPixelData || !gridDimensions || !selectionClipboard) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    applyGridEdit(pasteClipboard(editPixelData, gridDimensions, selectionClipboard, row, col));
    setActiveSelection({
      startRow: row,
      startCol: col,
      endRow: Math.min(gridDimensions.M - 1, row + selectionClipboard.length - 1),
      endCol: Math.min(gridDimensions.N - 1, col + (selectionClipboard[0]?.length || 1) - 1),
    });
    showToast('选区已粘贴');
  }, [activePixelLayer, mappedPixelData, gridDimensions, selectionClipboard, applyGridEdit, showToast]);

  const getNormalizedActiveSelection = useCallback(() => {
    if (!activeSelection || !gridDimensions) return null;
    return normalizeSelection(activeSelection, gridDimensions);
  }, [activeSelection, gridDimensions]);

  const selectionContainsCell = (selection: GridSelection, row: number, col: number) => (
    row >= selection.startRow
    && row <= selection.endRow
    && col >= selection.startCol
    && col <= selection.endCol
  );

  const offsetSelection = useCallback((selection: GridSelection, rowOffset: number, colOffset: number): GridSelection => {
    if (!gridDimensions) return selection;
    const height = selection.endRow - selection.startRow;
    const width = selection.endCol - selection.startCol;
    const startRow = Math.min(gridDimensions.M - height - 1, Math.max(0, selection.startRow + rowOffset));
    const startCol = Math.min(gridDimensions.N - width - 1, Math.max(0, selection.startCol + colOffset));

    return {
      startRow,
      startCol,
      endRow: startRow + height,
      endCol: startCol + width,
    };
  }, [gridDimensions]);

  const handleCopyActiveSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    setSelectionClipboard(copySelection(editPixelData, selection));
    showToast('选区已复制');
  }, [activePixelLayer, getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handleCutActiveSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    setSelectionClipboard(copySelection(editPixelData, selection));
    applyGridEdit(clearSelection(editPixelData, selection));
    setActiveSelection(null);
    showToast('选区已剪切');
  }, [activePixelLayer, applyGridEdit, getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handleDeleteActiveSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    applyGridEdit(clearSelection(editPixelData, selection));
    setActiveSelection(null);
    showToast('选区已删除');
  }, [activePixelLayer, applyGridEdit, getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handlePasteAtSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData || !gridDimensions || !selectionClipboard) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;
    applyGridEdit(pasteClipboard(editPixelData, gridDimensions, selectionClipboard, selection.startRow, selection.startCol));
    showToast('宸茬矘璐村埌閫夊尯璧风偣');
  }, [activePixelLayer, applyGridEdit, getNormalizedActiveSelection, gridDimensions, mappedPixelData, selectionClipboard, showToast]);

  const commitLayerChange = useCallback((nextLayers: PixelLayer[], nextActiveLayerId = activeLayerId) => {
    if (!gridDimensions) return;

    setPixelLayers(nextLayers);
    setActiveLayerId(nextActiveLayerId && nextLayers.some(layer => layer.id === nextActiveLayerId)
      ? nextActiveLayerId
      : nextLayers[0]?.id || null);
    applyCompositeGrid(nextLayers, gridDimensions);
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
  }, [activeLayerId, applyCompositeGrid, gridDimensions]);

  const handleAddLayer = useCallback(() => {
    if (!gridDimensions) return;

    saveEditSnapshot();
    const nextLayer = createPixelLayer(`图层 ${pixelLayers.length + 1}`, createBlankPixelGrid(gridDimensions));
    commitLayerChange([...pixelLayers, nextLayer], nextLayer.id);
    showToast('已新增图层');
  }, [commitLayerChange, gridDimensions, pixelLayers, saveEditSnapshot, showToast]);

  const handleDuplicateLayer = useCallback(() => {
    const sourceLayer = pixelLayers.find(layer => layer.id === activeLayerId);
    if (!sourceLayer) return;

    saveEditSnapshot();
    const duplicateLayer = createPixelLayer(`${sourceLayer.name} 副本`, sourceLayer.data);
    const sourceIndex = pixelLayers.findIndex(layer => layer.id === sourceLayer.id);
    const nextLayers = [
      ...pixelLayers.slice(0, sourceIndex + 1),
      duplicateLayer,
      ...pixelLayers.slice(sourceIndex + 1),
    ];

    commitLayerChange(nextLayers, duplicateLayer.id);
    showToast('已复制图层');
  }, [activeLayerId, commitLayerChange, pixelLayers, saveEditSnapshot, showToast]);

  const handleDeleteLayer = useCallback((layerId: string) => {
    if (pixelLayers.length <= 1) {
      showToast('至少保留一个图层');
      return;
    }

    saveEditSnapshot();
    const deleteIndex = pixelLayers.findIndex(layer => layer.id === layerId);
    const nextLayers = pixelLayers.filter(layer => layer.id !== layerId);
    const nextActiveLayerId = activeLayerId === layerId
      ? nextLayers[Math.max(0, deleteIndex - 1)]?.id || nextLayers[0]?.id || null
      : activeLayerId;

    commitLayerChange(nextLayers, nextActiveLayerId);
    showToast('已删除图层');
  }, [activeLayerId, commitLayerChange, pixelLayers, saveEditSnapshot, showToast]);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    saveEditSnapshot();
    const nextLayers = pixelLayers.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    );
    commitLayerChange(nextLayers);
  }, [commitLayerChange, pixelLayers, saveEditSnapshot]);

  const handleToggleLayerLock = useCallback((layerId: string) => {
    saveEditSnapshot();
    const nextLayers = pixelLayers.map(layer =>
      layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
    );
    commitLayerChange(nextLayers);
  }, [commitLayerChange, pixelLayers, saveEditSnapshot]);

  useEffect(() => {
    if (!isMounted || isRestoringProjectRef.current || !mappedPixelData || !gridDimensions) {
      return;
    }

    const snapshot = JSON.stringify(buildProjectState());
    latestStateSnapshotRef.current = snapshot;
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setHasUnsavedChanges(true);
    setSaveStatus(prev => (prev === 'saving' || prev === 'conflict' ? prev : 'dirty'));
  }, [
    isMounted,
    buildProjectState,
    mappedPixelData,
    gridDimensions,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges || saveStatus === 'saving' || saveStatus === 'conflict' || !mappedPixelData || !gridDimensions) {
      return;
    }

    const timer = window.setTimeout(() => {
      persistProject();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [hasUnsavedChanges, saveStatus, mappedPixelData, gridDimensions, persistProject]);

  useEffect(() => {
    if (!isMounted || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource('/api/projects/events');
    source.addEventListener('project', (message) => {
      void (async () => {
        try {
          const event = JSON.parse((message as MessageEvent).data) as {
            type: 'created' | 'updated' | 'renamed' | 'deleted' | 'restored';
            projectId: string;
            version: number;
            name: string;
            updated_at: string;
          };

          if (isProjectsModalOpen) {
            refreshProjects();
          }

          if (event.projectId !== currentProjectId) {
            return;
          }

          if (event.type === 'deleted') {
            setVersionConflict({
              error: 'VERSION_CONFLICT',
              serverVersion: event.version,
              clientVersion: currentProjectVersion,
            });
            setSaveStatus('conflict');
            showToast('褰撳墠椤圭洰宸插湪鍏朵粬璁惧鍒犻櫎');
            return;
          }

          if (event.version <= currentProjectVersion || saveStatus === 'saving') {
            return;
          }

          if (hasUnsavedChanges || saveStatus === 'conflict') {
            setVersionConflict({
              error: 'VERSION_CONFLICT',
              serverVersion: event.version,
              clientVersion: currentProjectVersion,
            });
            setSaveStatus('conflict');
            showToast('鍏朵粬璁惧鏈夋柊淇敼锛岃澶勭悊鐗堟湰鍐茬獊');
            return;
          }

          const project = await fetchProject(event.projectId);
          applyProject(project);
          showToast('宸插疄鏃跺悓姝ュ叾浠栬澶囩殑淇敼');
        } catch (error) {
          console.warn('澶勭悊瀹炴椂鍚屾浜嬩欢澶辫触:', error);
        }
      })();
    });

    source.onerror = () => {
      console.warn('实时同步连接暂时不可用，将保留轮询兜底');
    };

    return () => source.close();
  }, [
    applyProject,
    currentProjectId,
    currentProjectVersion,
    hasUnsavedChanges,
    isMounted,
    isProjectsModalOpen,
    refreshProjects,
    saveStatus,
    showToast,
  ]);

  useEffect(() => {
    if (!currentProjectId || hasUnsavedChanges || saveStatus === 'saving' || saveStatus === 'conflict') {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const project = await fetchProject(currentProjectId);
        if (project.version > currentProjectVersion && !hasUnsavedChanges) {
          applyProject(project);
          showToast('Server changes synced');
        }
      } catch (error) {
        console.warn('Failed to sync remote project version:', error);
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [currentProjectId, currentProjectVersion, hasUnsavedChanges, saveStatus, applyProject, showToast]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const processFile = (file: File) => {
    // 妫€鏌ユ枃浠剁被鍨?
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      // 澶勭悊CSV鏂囦欢
      console.log('姝ｅ湪瀵煎叆CSV鏂囦欢...');
      importCsvData(file)
        .then(({ mappedPixelData, gridDimensions }) => {
          console.log('成功导入 CSV 文件: ' + gridDimensions.N + 'x' + gridDimensions.M);
          
          setCanvasSource('csv');
          replaceProjectGrid(mappedPixelData, gridDimensions, '主体');
          setOriginalImageSrc(null);
          // 璁＄畻棰滆壊缁熻
          const colorCountsMap: { [key: string]: { count: number; color: string } } = {};
          let totalCount = 0;
          
          mappedPixelData.forEach(row => {
            row.forEach(cell => {
              if (cell && !cell.isExternal) {
                const colorKey = cell.color.toUpperCase();
                if (colorCountsMap[colorKey]) {
                  colorCountsMap[colorKey].count++;
                } else {
                  colorCountsMap[colorKey] = {
                    count: 1,
                    color: cell.color
                  };
                }
                totalCount++;
              }
            });
          });
          
          setColorCounts(colorCountsMap);
          setTotalBeadCount(totalCount);
          setInitialGridColorKeys(new Set(Object.keys(colorCountsMap)));
          setActiveSelection(null);
          setSelectionDragStart(null);
          setSelectionMoveState(null);
          setSelectionClipboard(null);
          
          // 鏍规嵁mappedPixelData鐢熸垚鍚堟垚鐨刼riginalImageSrc
          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          
          skipNextPixelateRef.current = true;
          setOriginalImageSrc(syntheticImageSrc);
          
          // 閲嶇疆鐘舵€?
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setIsEraseMode(false);
          
          // 璁剧疆鏍煎瓙鏁伴噺涓哄鍏ョ殑灏哄锛岄伩鍏嶉噸鏂版槧灏勬椂灏哄琚慨鏀?
          setGranularity(gridDimensions.N);
          setGranularityInput(gridDimensions.N.toString());
          
          alert('成功导入 CSV 文件！图纸尺寸：' + gridDimensions.N + 'x' + gridDimensions.M + '，共使用 ' + Object.keys(colorCountsMap).length + ' 种颜色。');
        })
        .catch(error => {
          console.error('CSV瀵煎叆澶辫触:', error);
          alert('CSV 导入失败：' + error.message);
        });
    } else {
      // 澶勭悊鍥剧墖鏂囦欢
      const applyImageSrc = (result: string) => {
        setCanvasSource('image');
        setOriginalImageSrc(result);
        replaceProjectGrid(null, null);
        setActiveSelection(null);
        setSelectionDragStart(null);
        setSelectionMoveState(null);
        setSelectionClipboard(null);
        // ++ 閲嶇疆妯酱鏍煎瓙鏁伴噺涓洪粯璁ゅ€?++
        const defaultGranularity = 100;
        setGranularity(defaultGranularity);
        setGranularityInput(defaultGranularity.toString());
        setRemapTrigger(prev => prev + 1); // Trigger full remap for new image
      };

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      if (isGif) {
        // GIF 璧?createImageBitmap锛岃鑼冧繚璇佽繑鍥為甯э紙default image锛夛紝鍐嶇儤鐒欎负 PNG dataURL
        createImageBitmap(file)
          .then((bitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 上下文');
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            applyImageSrc(canvas.toDataURL('image/png'));
          })
          .catch((error) => {
            console.error('GIF 澶勭悊澶辫触:', error);
            alert('无法读取 GIF 文件。');
            setInitialGridColorKeys(new Set());
          });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          applyImageSrc(e.target?.result as string);
        };
        reader.onerror = () => {
          console.error("鏂囦欢璇诲彇澶辫触");
          alert('无法读取文件。');
          setInitialGridColorKeys(new Set()); // ++ 閲嶇疆鍒濆閿?++
        };
        reader.readAsDataURL(file);
      }
      // ++ Reset manual coloring mode when a new file is processed ++
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setIsEraseMode(false);
    }
  };

  // 澶勭悊涓€閿摝闄ゆā寮忓垏鎹?
  const handleEraseToggle = () => {
    // 纭繚鍦ㄦ墜鍔ㄤ笂鑹叉ā寮忎笅鎵嶈兘浣跨敤鎿﹂櫎鍔熻兘
    if (!isManualColoringMode) {
      return;
    }
    
    // 濡傛灉褰撳墠鍦ㄩ鑹叉浛鎹㈡ā寮忥紝鍏堥€€鍑烘浛鎹㈡ā寮?
    if (colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    setIsEraseMode(!isEraseMode);
    // 濡傛灉寮€鍚摝闄ゆā寮忥紝鍙栨秷閫変腑鐨勯鑹?
    if (!isEraseMode) {
      setSelectedColor(null);
      setManualShapeStart(null);
    }
  };

  // ++ 鏂板锛氬鐞嗚緭鍏ユ鍙樺寲鐨勫嚱鏁?++
  const handleGranularityInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGranularityInput(event.target.value);
  };

  // ++ 娣诲姞锛氬鐞嗙浉浼煎害杈撳叆妗嗗彉鍖栫殑鍑芥暟 ++
  const handleSimilarityThresholdInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSimilarityThresholdInput(event.target.value);
  };

  // ++ 淇敼锛氬鐞嗙‘璁ゆ寜閽偣鍑荤殑鍑芥暟锛屽悓鏃跺鐞嗕袱涓弬鏁?++
  const handleConfirmParameters = () => {
    // 澶勭悊鏍煎瓙鏁?
    const minGranularity = 10;
    const maxGranularity = 300;
    let newGranularity = parseInt(granularityInput, 10);

    if (isNaN(newGranularity) || newGranularity < minGranularity) {
      newGranularity = minGranularity;
    } else if (newGranularity > maxGranularity) {
      newGranularity = maxGranularity;
    }

    // 澶勭悊鐩镐技搴﹂槇鍊?
    const minSimilarity = 0;
    const maxSimilarity = 100;
    let newSimilarity = parseInt(similarityThresholdInput, 10);
    
    if (isNaN(newSimilarity) || newSimilarity < minSimilarity) {
      newSimilarity = minSimilarity;
    } else if (newSimilarity > maxSimilarity) {
      newSimilarity = maxSimilarity;
    }

    // 妫€鏌ュ€兼槸鍚︽湁鍙樺寲
    const granularityChanged = newGranularity !== granularity;
    const similarityChanged = newSimilarity !== similarityThreshold;
    
    if (granularityChanged) {
      console.log(`Confirming new granularity: ${newGranularity}`);
      setGranularity(newGranularity);
    }
    
    if (similarityChanged) {
      console.log(`Confirming new similarity threshold: ${newSimilarity}`);
      setSimilarityThreshold(newSimilarity);
    }
    
    // 鍙湁鍦ㄦ湁鍊煎彉鍖栨椂鎵嶈Е鍙戦噸鏄犲皠
    if (granularityChanged || similarityChanged) {
      setRemapTrigger(prev => prev + 1);
      // 閫€鍑烘墜鍔ㄤ笂鑹叉ā寮?
      setIsManualColoringMode(false);
      setSelectedColor(null);
    }

    // 濮嬬粓鍚屾杈撳叆妗嗙殑鍊?
    setGranularityInput(newGranularity.toString());
    setSimilarityThresholdInput(newSimilarity.toString());
  };

  // 娣诲姞鍍忕礌鍖栨ā寮忓垏鎹㈠鐞嗗嚱鏁?
  const handlePixelationModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as PixelationMode;
    if (Object.values(PixelationMode).includes(newMode)) {
        setPixelationMode(newMode);
        setRemapTrigger(prev => prev + 1); // 瑙﹀彂閲嶆柊鏄犲皠
        setIsManualColoringMode(false); // 閫€鍑烘墜鍔ㄦā寮?
        setSelectedColor(null);
    } else {
        console.warn(`鏃犳晥鐨勫儚绱犲寲妯″紡: ${newMode}`);
    }
  };

  // 淇敼pixelateImage鍑芥暟鎺ユ敹妯″紡鍙傛暟
  const pixelateImage = (imageSrc: string, detailLevel: number, threshold: number, currentPalette: PaletteColor[], mode: PixelationMode) => {
    console.log(`Attempting to pixelate with detail: ${detailLevel}, threshold: ${threshold}, mode: ${mode}`);
    const originalCanvas = originalCanvasRef.current;
    const pixelatedCanvas = pixelatedCanvasRef.current;

    if (!originalCanvas || !pixelatedCanvas) { console.error("Canvas ref(s) not available."); return; }
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    const pixelatedCtx = pixelatedCanvas.getContext('2d');
    if (!originalCtx || !pixelatedCtx) { console.error("Canvas context(s) not found."); return; }
    console.log("Canvas contexts obtained.");

    if (currentPalette.length === 0) {
        console.error("Cannot pixelate: The selected color palette is empty (likely due to exclusions).");
        alert('错误：当前可用颜色板为空，无法处理图像。请先恢复部分颜色。');
        // Clear previous results visually
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        replaceProjectGrid(null, null);
        // Keep colorCounts potentially showing the last valid counts? Or clear them too?
        // setColorCounts(null); // Decide if clearing counts is desired when palette is empty
        // setTotalBeadCount(0);
        return; // Stop processing
    }
    const t1FallbackColor = currentPalette.find(p => p.key === 'T1')
                         || currentPalette.find(p => p.hex.toUpperCase() === '#FFFFFF')
                         || currentPalette[0]; // 浣跨敤绗竴涓彲鐢ㄩ鑹蹭綔涓哄鐢?
    console.log("Using fallback color for empty cells:", t1FallbackColor);

    const img = new window.Image();
    
    img.onerror = (error: Event | string) => {
      console.error("Image loading failed:", error); 
      alert('无法加载图片。');
      setOriginalImageSrc(null); 
      replaceProjectGrid(null, null);
    };
    
    img.onload = () => {
      console.log("Image loaded successfully.");
      const aspectRatio = img.height / img.width;
      const N = detailLevel;
      const M = Math.max(1, Math.round(N * aspectRatio));
      if (N <= 0 || M <= 0) { console.error("Invalid grid dimensions:", { N, M }); return; }
      console.log(`Grid size: ${N}x${M}`);

      // 鍔ㄦ€佽皟鏁寸敾甯冨昂瀵革細褰撴牸瀛愭暟閲忓ぇ浜?00鏃讹紝澧炲姞鐢诲竷灏哄浠ヤ繚鎸佹瘡涓牸瀛愮殑鍙鎬?
      const baseWidth = 500;
      const minCellSize = 4; // 姣忎釜鏍煎瓙鐨勬渶灏忓昂瀵革紙鍍忕礌锛?
      const recommendedCellSize = 6; // 鎺ㄨ崘鐨勬牸瀛愬昂瀵革紙鍍忕礌锛?
      
      let outputWidth = baseWidth;
      
      // 濡傛灉鏍煎瓙鏁伴噺澶т簬100锛岃绠楅渶瑕佺殑鐢诲竷瀹藉害
      if (N > 100) {
        const requiredWidthForMinSize = N * minCellSize;
        const requiredWidthForRecommendedSize = N * recommendedCellSize;
        
        // 浣跨敤鎺ㄨ崘灏哄锛屼絾涓嶈秴杩囧睆骞曞搴︾殑90%锛堟渶澶?200px锛?
        const maxWidth = Math.min(1200, window.innerWidth * 0.9);
        outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
        
        // 纭繚涓嶅皬浜庢渶灏忚姹?
        outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
        
        console.log(`Large grid detected (${N} columns). Adjusted canvas width from ${baseWidth} to ${outputWidth}px (cell size: ${Math.round(outputWidth / N)}px)`);
      }
      
      const outputHeight = Math.round(outputWidth * aspectRatio);
      
      // 鍦ㄦ帶鍒跺彴鎻愮ず鐢ㄦ埛鐢诲竷灏哄鍙樺寲
      if (N > 100) {
        console.log('Large grid detected: ' + N + 'x' + M);
      }
      originalCanvas.width = img.width; originalCanvas.height = img.height;
      pixelatedCanvas.width = outputWidth; pixelatedCanvas.height = outputHeight;
      console.log(`Canvas dimensions: Original ${img.width}x${img.height}, Output ${outputWidth}x${outputHeight}`);

      originalCtx.drawImage(img, 0, 0, img.width, img.height);
      console.log("Original image drawn.");

      // 1. 浣跨敤calculatePixelGrid杩涜鍒濆棰滆壊鏄犲皠
      console.log("Starting initial color mapping...");
      const initialMappedData = isJettMode(mode)
        ? calculateJettPixelGrid(
            originalCtx,
            img.width,
            img.height,
            N,
            M,
            currentPalette,
            mode,
            threshold
          )
        : calculatePixelGrid(
            originalCtx,
            img.width,
            img.height,
            N,
            M,
            currentPalette,
            mode,
            t1FallbackColor
          );
      console.log(`Initial data mapping complete using mode ${mode}. Starting global color merging...`);

      // --- 鏂扮殑鍏ㄥ眬棰滆壊鍚堝苟閫昏緫 ---
      const keyToRgbMap = new Map<string, RgbColor>();
      const keyToColorDataMap = new Map<string, PaletteColor>();
      currentPalette.forEach(p => {
        keyToRgbMap.set(p.key, p.rgb);
        keyToColorDataMap.set(p.key, p);
      });

      // 2. 缁熻鍒濆棰滆壊鏁伴噺
      const initialColorCounts: { [key: string]: number } = {};
      initialMappedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
              initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
          }
      });
      console.log("Initial color counts:", initialColorCounts);

      // 3. 鍒涘缓涓€涓鑹叉帓搴忓垪琛紝鎸夊嚭鐜伴鐜囦粠楂樺埌浣庢帓搴?
      const colorsByFrequency = Object.entries(initialColorCounts)
          .sort((a, b) => b[1] - a[1])  // 鎸夐鐜囬檷搴忔帓搴?
          .map(entry => entry[0]);      // 鍙繚鐣欓鑹查敭
      
      if (colorsByFrequency.length === 0) {
          console.log("No non-background colors found! Skipping merging.");
      }

      console.log("Colors sorted by frequency:", colorsByFrequency);
      
      // 4. 澶嶅埗鍒濆鏁版嵁锛屽噯澶囧悎骞?
      const mergedData: MappedPixel[][] = initialMappedData.map(row => 
          row.map(cell => ({ ...cell, isExternal: cell.isExternal ?? false }))
      );
      
      // 5. 澶勭悊鐩镐技棰滆壊鍚堝苟
      const similarityThresholdValue = threshold;
      
      // 宸茶鍚堝苟锛堟浛鎹級鐨勯鑹查泦鍚?
      const replacedColors = new Set<string>();
      
      // 瀵规瘡涓鑹叉寜棰戠巼浠庨珮鍒颁綆澶勭悊
      if (!isJettMode(mode)) for (let i = 0; i < colorsByFrequency.length; i++) {
          const currentKey = colorsByFrequency[i];
          
          // 濡傛灉褰撳墠棰滆壊宸茬粡琚悎骞跺埌鏇撮绻佺殑棰滆壊涓紝璺宠繃
          if (replacedColors.has(currentKey)) continue;
          
          const currentRgb = keyToRgbMap.get(currentKey);
          if (!currentRgb) {
              console.warn(`RGB not found for key ${currentKey}. Skipping.`);
              continue;
          }
          
          // 妫€鏌ュ墿浣欑殑浣庨棰滆壊
          for (let j = i + 1; j < colorsByFrequency.length; j++) {
              const lowerFreqKey = colorsByFrequency[j];
              
              // 濡傛灉浣庨棰滆壊宸茶鏇挎崲锛岃烦杩?
              if (replacedColors.has(lowerFreqKey)) continue;
              
              const lowerFreqRgb = keyToRgbMap.get(lowerFreqKey);
              if (!lowerFreqRgb) {
                  console.warn(`RGB not found for key ${lowerFreqKey}. Skipping.`);
                  continue;
              }
              
              // 璁＄畻棰滆壊璺濈
              const dist = colorDistance(currentRgb, lowerFreqRgb);
              
              // 濡傛灉璺濈灏忎簬闃堝€硷紝灏嗕綆棰戦鑹叉浛鎹负楂橀棰滆壊
              if (dist < similarityThresholdValue) {
                  console.log(`Merging color ${lowerFreqKey} into ${currentKey} (Distance: ${dist.toFixed(2)})`);
                  
                  // 鏍囪杩欎釜棰滆壊宸茶鏇挎崲
                  replacedColors.add(lowerFreqKey);
                  
                  // 鏇挎崲鎵€鏈変娇鐢ㄨ繖涓綆棰戦鑹茬殑鍗曞厓鏍?
                  for (let r = 0; r < M; r++) {
                      for (let c = 0; c < N; c++) {
                          if (mergedData[r][c].key === lowerFreqKey) {
                              const colorData = keyToColorDataMap.get(currentKey);
                              if (colorData) {
                                  mergedData[r][c] = {
                                      key: currentKey,
                                      color: colorData.hex,
                                      isExternal: false
                                  };
                              }
                          }
                      }
                  }
              }
          }
      }
      
      if (replacedColors.size > 0) {
          console.log(`Merged ${replacedColors.size} less frequent similar colors into more frequent ones.`);
      } else {
          console.log("No colors were similar enough to merge.");
      }
      // --- 缁撴潫鏂扮殑鍏ㄥ眬棰滆壊鍚堝苟閫昏緫 ---

      // --- 缁樺埗鍜岀姸鎬佹洿鏂?---
      if (pixelatedCanvasRef.current) {
        replaceProjectGrid(mergedData, { N, M }, '主体');

        const counts: { [key: string]: { count: number; color: string } } = {};
        let totalCount = 0;
        mergedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal) {
            // 浣跨敤hex鍊间綔涓虹粺璁￠敭鍊硷紝鑰屼笉鏄壊鍙?
            const hexKey = cell.color;
            if (!counts[hexKey]) {
              counts[hexKey] = { count: 0, color: cell.color };
            }
            counts[hexKey].count++;
            totalCount++;
          }
        });
        setColorCounts(counts);
        setTotalBeadCount(totalCount);
        setInitialGridColorKeys(new Set(Object.keys(counts)));
        setSaveStatus('dirty');
        setHasUnsavedChanges(true);
        console.log("Color counts updated based on merged data (after merging):", counts);
        console.log("Total bead count (total beads):", totalCount);
        console.log("Stored initial grid color keys:", Object.keys(counts));
      } else {
        console.error("Pixelated canvas ref is null, skipping draw call in pixelateImage.");
      }
    }; // 姝ｇ‘闂悎 img.onload 鍑芥暟
    
    console.log("Setting image source...");
    img.src = imageSrc;
    setIsManualColoringMode(false);
    setActiveSelection(null);
    setSelectionDragStart(null);
    setSelectionMoveState(null);
    setSelectedColor(null);
  }; // 姝ｇ‘闂悎 pixelateImage 鍑芥暟

  // 褰?remapTrigger 鍙樺寲鏃舵竻绌烘挙鍥炲巻鍙诧紙鍙傛暟璋冩暣/棰滆壊鎺掗櫎/鏂板浘涓婁紶绛夊潎浼氳Е鍙?remap锛?
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger]);

  // 淇敼useEffect涓殑pixelateImage璋冪敤锛屽姞鍏ユā寮忓弬鏁?
  useEffect(() => {
    if (canvasSource === 'blank') {
      return;
    }

    if (skipNextPixelateRef.current) {
      skipNextPixelateRef.current = false;
      return;
    }

    if (originalImageSrc && activeBeadPalette.length > 0) {
       const timeoutId = setTimeout(() => {
         if (originalImageSrc && originalCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
           console.log("useEffect triggered: Processing image due to src, granularity, threshold, palette selection, mode or remap trigger.");
           pixelateImage(originalImageSrc, granularity, similarityThreshold, activeBeadPalette, pixelationMode);
         } else {
            console.warn("useEffect check failed inside timeout: Refs or active palette not ready/empty.");
         }
       }, 50);
       return () => clearTimeout(timeoutId);
    } else if (originalImageSrc && activeBeadPalette.length === 0) {
        console.warn("Image selected, but the active palette is empty after exclusions. Cannot process. Clearing preview.");
        const pixelatedCanvas = pixelatedCanvasRef.current;
        const pixelatedCtx = pixelatedCanvas?.getContext('2d');
        if (pixelatedCtx && pixelatedCanvas) {
            pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
            // Draw a message on the canvas?
            pixelatedCtx.fillStyle = '#6b7280'; // gray-500
            pixelatedCtx.font = '16px sans-serif';
            pixelatedCtx.textAlign = 'center';
            pixelatedCtx.fillText('鏃犲彲鐢ㄩ鑹诧紝璇锋仮澶嶉儴鍒嗘帓闄ょ殑棰滆壊', pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        replaceProjectGrid(null, null);
        // Keep colorCounts to allow user to un-exclude colors
        // setColorCounts(null);
        // setTotalBeadCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSource, originalImageSrc, granularity, similarityThreshold, customPaletteSelections, pixelationMode, remapTrigger]);

  // 纭繚鏂囦欢杈撳叆妗嗗紩鐢ㄥ湪缁勪欢鎸傝浇鍚庢纭缃?
  useEffect(() => {
    // 寤惰繜鎵ц锛岀‘淇滵OM瀹屽叏娓叉煋
    const timer = setTimeout(() => {
      if (!fileInputRef.current) {
        console.warn('文件输入框引用在组件挂载后仍为空，上传功能可能异常');
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 璁剧疆缁勪欢鎸傝浇鐘舵€?
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 寮哄埗鏄剧ず涓撲笟宸ヤ綔鍙板脊绐楋紙姣忔杩涘叆椤甸潰閮藉脊锛屽紩瀵肩敤鎴峰墠寰€鏂扮増锛?
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SHOW_DESKTOP_MODAL === 'true') {
      setShowDesktopModal(true);
    }
  }, []);

  // 娣诲姞URL閲嶅畾鍚戞鏌?
  useEffect(() => {
    // 妫€鏌ユ槸鍚﹀湪娴忚鍣ㄧ幆澧冧腑
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;
      const targetDomain = process.env.NEXT_PUBLIC_CANONICAL_URL;

      if (!targetDomain) {
        return;
      }
      
      // 鎺掗櫎localhost鍜?27.0.0.1绛夋湰鍦板紑鍙戠幆澧?
      const isLocalhost = currentHostname === 'localhost' || 
                         currentHostname === '127.0.0.1' || 
                         currentHostname.startsWith('192.168.') ||
                         currentHostname.startsWith('10.') ||
                         currentHostname.endsWith('.local');
      
      // 妫€鏌ュ綋鍓峌RL鏄惁涓嶆槸鐩爣鍩熷悕锛屼笖涓嶆槸鏈湴寮€鍙戠幆澧?
      if (!currentUrl.startsWith(targetDomain) && !isLocalhost) {
        console.log(`褰撳墠URL: ${currentUrl}`);
        console.log(`鐩爣URL: ${targetDomain}`);
        console.log('姝ｅ湪閲嶅畾鍚戝埌瀹樻柟鍩熷悕...');
        
        // 淇濈暀褰撳墠璺緞鍜屾煡璇㈠弬鏁?
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const currentHash = window.location.hash;
        
        // 鏋勫缓瀹屾暣鐨勭洰鏍嘦RL
        let redirectUrl = targetDomain;
        
        // 濡傛灉涓嶆槸鏍硅矾寰勶紝娣诲姞璺緞
        if (currentPath && currentPath !== '/') {
          redirectUrl = redirectUrl.replace(/\/$/, '') + currentPath;
        }
        
        // 娣诲姞鏌ヨ鍙傛暟鍜屽搱甯?
        redirectUrl += currentSearch + currentHash;
        
        // 鎵ц閲嶅畾鍚?
        window.location.replace(redirectUrl);
      } else if (isLocalhost) {
        console.log(`妫€娴嬪埌鏈湴寮€鍙戠幆澧?(${currentHostname})锛岃烦杩囬噸瀹氬悜`);
      }
    }
  }, []); // 鍙湪缁勪欢棣栨鎸傝浇鏃舵墽琛?

    // --- Download function (ensure filename includes palette) ---
    const handleDownloadRequest = (options?: GridDownloadOptions) => {
        // 璋冪敤绉诲姩鍒皍tils/imageDownloader.ts涓殑downloadImage鍑芥暟
        downloadImage({
          mappedPixelData,
          gridDimensions,
          colorCounts,
          totalBeadCount,
          options: options || downloadOptions,
          activeBeadPalette,
          selectedColorSystem
        });
    };

    // --- Handler to toggle color exclusion ---
    const handleToggleExcludeColor = (hexKey: string) => {
        const currentExcluded = excludedColorKeys;
        const isExcluding = !currentExcluded.has(hexKey);

        if (isExcluding) {
            console.log(`---------\nAttempting to EXCLUDE color: ${hexKey}`);

            // --- 纭繚鍒濆棰滆壊閿凡璁板綍 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert('无法排除颜色，初始颜色数据尚未准备好，请稍候。');
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 浣跨敤鍒濆棰滆壊閿繘琛岄噸鏄犲皠鐩爣閫昏緫 ---
            // 1. 浠庡垵濮嬬綉鏍奸鑹查泦鍚堝紑濮嬶紙hex鍊硷級
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 绉婚櫎褰撳墠瑕佹帓闄ょ殑hex閿?
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 绉婚櫎浠讳綍*鍏朵粬*褰撳墠涔熻鎺掗櫎鐨刪ex閿?
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 鍩轰簬鍓╀綑鐨刪ex鍊煎垱寤洪噸鏄犲皠璋冭壊鏉?
            const remapTargetPalette = fullBeadPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 鍏抽敭妫€鏌?***锛氬鏋滃湪鑰冭檻鎵€鏈夋帓闄ら」鍚庯紝娌℃湁*鍒濆*棰滆壊鍙緵鏄犲皠锛屽垯闃绘姝ゆ鎺掗櫎
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert('无法排除颜色 ' + hexKey + '，因为没有其他可用颜色。请先恢复部分其他颜色。');
                console.log("---------");
                return; // 鍋滄鎺掗櫎杩囩▼
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 鏌ユ壘琚帓闄ら鑹茬殑RGB鍊肩敤浜庨噸鏄犲皠
            const excludedColorData = fullBeadPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 妫€鏌ユ帓闄ら鑹茬殑鏁版嵁鏄惁瀛樺湪
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert('无法排除颜色，缺少必要数据。');
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 浠呭湪闇€瑕侀噸鏄犲皠鏃跺垱寤烘繁鎷疯礉
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 姝ゆ潯浠舵纭湴浠呴拡瀵瑰叿鏈夋帓闄ex鍊肩殑鍗曞厓鏍?
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 浣跨敤娲剧敓鐨?remapTargetPalette 鏌ユ壘鏈€鎺ヨ繎鐨勯鑹?***
                    const replacementColor = findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette);
                        if (!firstReplacementHex) firstReplacementHex = replacementColor.hex;
                        newMappedData[j][i] = { 
                            ...cell, 
                            key: replacementColor.key, 
                            color: replacementColor.hex 
                        };
                    remappedCount++;
                }
                }
            }
            console.log(`Remapped ${remappedCount} cells. First replacement hex found was: ${firstReplacementHex || 'N/A'}`);

            // 鍚屾椂鏇存柊鐘舵€?
            setExcludedColorKeys(nextExcludedKeys); // 搴旂敤姝ら鑹茬殑鎺掗櫎
            replaceProjectGrid(newMappedData, gridDimensions, '主体');

            // 鍩轰簬*鏂?鏄犲皠鏁版嵁閲嶆柊璁＄畻璁℃暟锛堜互hex涓洪敭锛?
            const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
            let newTotalCount = 0;
            newMappedData.flat().forEach(cell => {
                if (cell && cell.color && !cell.isExternal) {
                    const cellHex = cell.color.toUpperCase();
                    if (!newCounts[cellHex]) {
                        newCounts[cellHex] = { count: 0, color: cellHex };
                }
                    newCounts[cellHex].count++;
                    newTotalCount++;
                }
            });
            setColorCounts(newCounts);
            setTotalBeadCount(newTotalCount);
            console.log("State updated after exclusion and local remap based on initial grid colors.");
            console.log("---------");

            // ++ 鍦ㄦ洿鏂扮姸鎬佸悗锛岄噸鏂扮粯鍒?Canvas ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              replaceProjectGrid(newMappedData, gridDimensions, '主体');
              // 涓嶈璋冪敤 setGridDimensions锛屽洜涓洪鑹叉帓闄や笉闇€瑕佹敼鍙樼綉鏍煎昂瀵?
            } else {
               console.error("Canvas ref or grid dimensions missing, skipping draw call in handleToggleExcludeColor.");
            }

        } else {
            // --- Re-including ---
            console.log(`---------\nAttempting to RE-INCLUDE color: ${hexKey}`);
            console.log(`Re-including color: ${hexKey}. Triggering full remap.`);
            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.delete(hexKey);
            setExcludedColorKeys(nextExcludedKeys);
            // 姝ゅ鏃犻渶閲嶇疆 initialGridColorKeys锛屽畬鍏ㄩ噸鏄犲皠浼氶€氳繃 pixelateImage 閲嶆柊璁＄畻瀹?
            setRemapTrigger(prev => prev + 1); // *** KEPT setRemapTrigger here for re-inclusion ***
            console.log("---------");
        }
        // ++ Exit manual mode if colors are excluded/included ++
        setIsManualColoringMode(false);
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

  // 涓€閿幓鑳屾櫙锛氳瘑鍒竟缂樹富鑹插苟娲按濉厖鍘婚櫎
  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert('请先生成图纸后再使用一键去背景。');
      return;
    }

    // 淇濆瓨蹇収鐢ㄤ簬鍗曟鎾ゅ洖
    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    // 鍘昏儗鏅細澶у箙鏀瑰彉鏁版嵁锛屾竻绌虹紪杈戞挙鍥炲巻鍙?
    setEditHistory([]);

    const { N, M } = gridDimensions;
    const borderCounts = new Map<string, number>();

    const countBorderCell = (row: number, col: number) => {
      const cell = mappedPixelData[row]?.[col];
      if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
      borderCounts.set(cell.key, (borderCounts.get(cell.key) || 0) + 1);
    };

    for (let col = 0; col < N; col++) {
      countBorderCell(0, col);
      if (M > 1) countBorderCell(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      countBorderCell(row, 0);
      if (N > 1) countBorderCell(row, N - 1);
    }

    if (borderCounts.size === 0) {
      alert('边缘没有可识别的背景颜色。');
      return;
    }

    let targetKey = '';
    let maxCount = -1;
    borderCounts.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        targetKey = key;
      }
    });

    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    const stack: { row: number; col: number }[] = [];

    const pushIfTarget = (row: number, col: number) => {
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        return;
      }
      const cell = newPixelData[row][col];
      if (!cell || cell.isExternal || cell.key !== targetKey) return;
      visited[row][col] = true;
      stack.push({ row, col });
    };

    for (let col = 0; col < N; col++) {
      pushIfTarget(0, col);
      if (M > 1) pushIfTarget(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      pushIfTarget(row, 0);
      if (N > 1) pushIfTarget(row, N - 1);
    }

    if (stack.length === 0) {
      alert('未找到可去除的背景区域。');
      return;
    }

    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      newPixelData[row][col] = { ...transparentColorData };
      pushIfTarget(row - 1, col);
      pushIfTarget(row + 1, col);
      pushIfTarget(row, col - 1);
      pushIfTarget(row, col + 1);
    }

    replaceProjectGrid(newPixelData, gridDimensions, '主体');

    const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
    let newTotalCount = 0;
    newPixelData.flat().forEach(cell => {
      if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        const cellHex = cell.color.toUpperCase();
        if (!newColorCounts[cellHex]) {
          newColorCounts[cellHex] = {
            count: 0,
            color: cellHex
          };
        }
        newColorCounts[cellHex].count++;
        newTotalCount++;
      }
    });

    setColorCounts(newColorCounts);
    setTotalBeadCount(newTotalCount);
    setInitialGridColorKeys(new Set(Object.keys(newColorCounts)));
  };

  // --- Tooltip Logic ---

  // --- Canvas Interaction ---

  // 娲按濉厖鎿﹂櫎鍑芥暟
  const floodFillErase = (startRow: number, startCol: number, targetKey: string) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    
    // 浣跨敤鏍堝疄鐜伴潪閫掑綊娲按濉厖
    const stack = [{ row: startRow, col: startCol }];
    
    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      
      // 妫€鏌ヨ竟鐣?
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        continue;
      }
      
      const currentCell = newPixelData[row][col];
      
      // 妫€鏌ユ槸鍚︽槸鐩爣棰滆壊涓斾笉鏄閮ㄥ尯鍩?
      if (!currentCell || currentCell.isExternal || currentCell.key !== targetKey) {
        continue;
      }
      
      // 鏍囪涓哄凡璁块棶
      visited[row][col] = true;
      
      // 鎿﹂櫎褰撳墠鍍忕礌锛堣涓洪€忔槑锛?
      newPixelData[row][col] = { ...transparentColorData };
      
      // 娣诲姞鐩搁偦鍍忕礌鍒版爤涓?
      stack.push(
        { row: row - 1, col }, // 涓?
        { row: row + 1, col }, // 涓?
        { row, col: col - 1 }, // 宸?
        { row, col: col + 1 }  // 鍙?
      );
    }
    
    // 鏇存柊鐘舵€?
    applyGridEdit(newPixelData);

    // 閲嶆柊璁＄畻棰滆壊缁熻
    if (colorCounts) {
      const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
      let newTotalCount = 0;
      
      newPixelData.flat().forEach(cell => {
        if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
          const cellHex = cell.color.toUpperCase();
          if (!newColorCounts[cellHex]) {
            newColorCounts[cellHex] = {
              count: 0,
              color: cellHex
            };
          }
          newColorCounts[cellHex].count++;
          newTotalCount++;
        }
      });
      
      setColorCounts(newColorCounts);
      setTotalBeadCount(newTotalCount);
    }
  };

  const getPaintCellForTool = useCallback((tool: ManualEditTool): MappedPixel | null => {
    if (tool === 'eraser') {
      return { ...transparentColorData };
    }

    if (!selectedColor) {
      return null;
    }

    if (selectedColor.key === TRANSPARENT_KEY) {
      return { ...transparentColorData };
    }

    return {
      ...selectedColor,
      isExternal: false,
    };
  }, [selectedColor]);

  const isSameGridCell = (cellA: MappedPixel | undefined, cellB: MappedPixel) => (
    Boolean(cellA?.isExternal) === Boolean(cellB.isExternal)
    && cellA?.key === cellB.key
    && (cellA?.color || '').toUpperCase() === cellB.color.toUpperCase()
  );

  const paintCells = useCallback((
    sourceData: MappedPixel[][],
    cells: { row: number; col: number }[],
    paintCell: MappedPixel
  ) => {
    const nextData = sourceData.map(row => row.map(cell => ({ ...cell })));
    let changed = false;

    cells.forEach(({ row, col }) => {
      if (!gridDimensions || row < 0 || col < 0 || row >= gridDimensions.M || col >= gridDimensions.N) {
        return;
      }

      if (isSameGridCell(nextData[row]?.[col], paintCell)) {
        return;
      }

      nextData[row][col] = { ...paintCell };
      changed = true;
    });

    return changed ? nextData : null;
  }, [gridDimensions]);

  const getLineCells = (start: { row: number; col: number }, end: { row: number; col: number }) => {
    const cells: { row: number; col: number }[] = [];
    let x0 = start.col;
    let y0 = start.row;
    const x1 = end.col;
    const y1 = end.row;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    while (true) {
      cells.push({ row: y0, col: x0 });
      if (x0 === x1 && y0 === y1) break;
      const doubledError = 2 * error;
      if (doubledError >= dy) {
        error += dy;
        x0 += sx;
      }
      if (doubledError <= dx) {
        error += dx;
        y0 += sy;
      }
    }

    return cells;
  };

  const getRectCells = (start: { row: number; col: number }, end: { row: number; col: number }) => {
    const top = Math.min(start.row, end.row);
    const bottom = Math.max(start.row, end.row);
    const left = Math.min(start.col, end.col);
    const right = Math.max(start.col, end.col);
    const cells: { row: number; col: number }[] = [];

    for (let col = left; col <= right; col++) {
      cells.push({ row: top, col });
      if (bottom !== top) cells.push({ row: bottom, col });
    }
    for (let row = top + 1; row < bottom; row++) {
      cells.push({ row, col: left });
      if (right !== left) cells.push({ row, col: right });
    }

    return cells;
  };

  const getBrushCells = useCallback((centerRow: number, centerCol: number, size: number) => {
    if (!gridDimensions) return [{ row: centerRow, col: centerCol }];

    const normalizedSize = Math.max(1, Math.min(9, Math.round(size)));
    const radiusBefore = Math.floor((normalizedSize - 1) / 2);
    const radiusAfter = normalizedSize - 1 - radiusBefore;
    const cells: { row: number; col: number }[] = [];

    for (let row = centerRow - radiusBefore; row <= centerRow + radiusAfter; row++) {
      for (let col = centerCol - radiusBefore; col <= centerCol + radiusAfter; col++) {
        if (row >= 0 && col >= 0 && row < gridDimensions.M && col < gridDimensions.N) {
          cells.push({ row, col });
        }
      }
    }

    return cells;
  }, [gridDimensions]);

  const handleManualCanvasEdit = useCallback((row: number, col: number) => {
    if (!mappedPixelData || !gridDimensions) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;

    if (manualEditTool === 'pan' || manualEditTool === 'select' || manualEditTool === 'move' || manualEditTool === 'paste') {
      return;
    }

    const currentCell = editPixelData[row]?.[col];

    if (manualEditTool === 'picker') {
      if (currentCell && !currentCell.isExternal && currentCell.key !== TRANSPARENT_KEY) {
        setSelectedColor({
          key: getColorKeyByHex(currentCell.color, selectedColorSystem),
          color: currentCell.color,
          isExternal: false,
        });
        setManualEditTool('brush');
        showToast('已取色');
      }
      setTooltipData(null);
      return;
    }

    const paintCell = getPaintCellForTool(manualEditTool);
    if (!paintCell) {
      setIsFloatingPaletteOpen(true);
      setShowFullPalette(true);
      showToast('璇峰厛閫夋嫨棰滆壊');
      return;
    }

    if (manualEditTool === 'fill') {
      if (!currentCell || isSameGridCell(currentCell, paintCell)) return;

      const targetKey = currentCell.key;
      const targetColor = currentCell.color.toUpperCase();
      const targetIsExternal = Boolean(currentCell.isExternal);
      const visited = Array.from({ length: gridDimensions.M }, () => Array(gridDimensions.N).fill(false));
      const stack = [{ row, col }];
      const cells: { row: number; col: number }[] = [];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (
          current.row < 0
          || current.col < 0
          || current.row >= gridDimensions.M
          || current.col >= gridDimensions.N
          || visited[current.row][current.col]
        ) {
          continue;
        }

        const candidate = editPixelData[current.row]?.[current.col];
        if (
          !candidate
          || candidate.key !== targetKey
          || candidate.color.toUpperCase() !== targetColor
          || Boolean(candidate.isExternal) !== targetIsExternal
        ) {
          continue;
        }

        visited[current.row][current.col] = true;
        cells.push(current);
        stack.push(
          { row: current.row - 1, col: current.col },
          { row: current.row + 1, col: current.col },
          { row: current.row, col: current.col - 1 },
          { row: current.row, col: current.col + 1 }
        );
      }

      const nextData = paintCells(editPixelData, cells, paintCell);
      if (nextData) {
        applyGridEdit(nextData);
      }
      setTooltipData(null);
      return;
    }

    if (manualEditTool === 'line' || manualEditTool === 'rect') {
      if (!manualShapeStart) {
        setManualShapeStart({ row, col });
        showToast(manualEditTool === 'line' ? '已设置直线起点' : '已设置矩形起点');
        return;
      }

      const cells = manualEditTool === 'line'
        ? getLineCells(manualShapeStart, { row, col })
        : getRectCells(manualShapeStart, { row, col });
      const nextData = paintCells(editPixelData, cells, paintCell);
      if (nextData) {
        applyGridEdit(nextData);
      }
      setManualShapeStart(null);
      setTooltipData(null);
      return;
    }

    const cells = manualEditTool === 'brush' || manualEditTool === 'eraser'
      ? getBrushCells(row, col, manualBrushSize)
      : [{ row, col }];
    const nextData = paintCells(editPixelData, cells, paintCell);
    if (nextData) {
      applyGridEdit(nextData);
    }
    setTooltipData(null);
  }, [
    applyGridEdit,
    activePixelLayer,
    getBrushCells,
    getPaintCellForTool,
    gridDimensions,
    manualBrushSize,
    manualEditTool,
    manualShapeStart,
    mappedPixelData,
    paintCells,
    selectedColorSystem,
    showToast,
  ]);

  const handleManualPointerCell = useCallback((
    phase: 'down' | 'move' | 'up',
    row: number,
    col: number
  ) => {
    if (!isManualColoringMode || !mappedPixelData || !gridDimensions || manualEditTool === 'pan') return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;

    if (manualEditTool === 'select') {
      if (phase === 'down') {
        const start = { row, col };
        setSelectionDragStart(start);
        setActiveSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
        setManualShapeStart(null);
        return;
      }

      if (selectionDragStart) {
        const nextSelection = {
          startRow: selectionDragStart.row,
          startCol: selectionDragStart.col,
          endRow: row,
          endCol: col,
        };
        setActiveSelection(nextSelection);
        if (phase === 'up') {
          setActiveSelection(normalizeSelection(nextSelection, gridDimensions));
          setSelectionDragStart(null);
          showToast('已框选区域');
        }
      }
      return;
    }

    if (manualEditTool === 'move') {
      const selection = getNormalizedActiveSelection();
      if (!selection) {
        if (phase === 'down') showToast('请先框选区域');
        return;
      }

      if (phase === 'down') {
        if (!selectionContainsCell(selection, row, col)) {
          showToast('请从选区内拖动');
          return;
        }

        setSelectionMoveState({
          origin: { row, col },
          selection,
          clipboard: copySelection(editPixelData, selection),
          baseData: clearSelection(editPixelData, selection),
        });
        return;
      }

      if (selectionMoveState) {
        const rowOffset = row - selectionMoveState.origin.row;
        const colOffset = col - selectionMoveState.origin.col;
        const movedSelection = offsetSelection(selectionMoveState.selection, rowOffset, colOffset);
        setActiveSelection(movedSelection);

        if (phase === 'up') {
          applyGridEdit(pasteClipboard(
            selectionMoveState.baseData,
            gridDimensions,
            selectionMoveState.clipboard,
            movedSelection.startRow,
            movedSelection.startCol
          ));
          setSelectionMoveState(null);
          showToast('选区已移动');
        }
      }
      return;
    }

    if (manualEditTool === 'paste' && phase === 'down') {
      if (!selectionClipboard) {
        showToast('剪贴板为空');
        return;
      }
      applyGridEdit(pasteClipboard(editPixelData, gridDimensions, selectionClipboard, row, col));
      setActiveSelection({
        startRow: row,
        startCol: col,
        endRow: Math.min(gridDimensions.M - 1, row + selectionClipboard.length - 1),
        endCol: Math.min(gridDimensions.N - 1, col + (selectionClipboard[0]?.length || 1) - 1),
      });
      showToast('选区已粘贴');
    }
  }, [
    applyGridEdit,
    activePixelLayer,
    getNormalizedActiveSelection,
    gridDimensions,
    isManualColoringMode,
    manualEditTool,
    mappedPixelData,
    offsetSelection,
    selectionClipboard,
    selectionDragStart,
    selectionMoveState,
    showToast,
  ]);

  // ++ Re-introduce the combined interaction handler ++
  const handleCanvasInteraction = (
    clientX: number, 
    clientY: number, 
    pageX: number, 
    pageY: number, 
    isClick: boolean = false,
    isTouchEnd: boolean = false
  ) => {
    // 濡傛灉鏄Е鎽哥粨鏉熸垨榧犳爣绂诲紑浜嬩欢锛岄殣钘忔彁绀?
    if (isTouchEnd) {
      setTooltipData(null);
      return;
    }

    const canvas = pixelatedCanvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) {
      setTooltipData(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const { N, M } = gridDimensions;
    const cellWidthOutput = canvas.width / N;
    const cellHeightOutput = canvas.height / M;

    const i = Math.floor(canvasX / cellWidthOutput);
    const j = Math.floor(canvasY / cellHeightOutput);

    if (i >= 0 && i < N && j >= 0 && j < M) {
      const cellData = mappedPixelData[j][i];

      if (isClick && isManualColoringMode && !colorReplaceState.isActive && !isEraseMode) {
        handleManualCanvasEdit(j, i);
        return;
      }

      // 棰滆壊鏇挎崲妯″紡閫昏緫 - 閫夋嫨婧愰鑹?
      if (isClick && colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 鎵ц閫夋嫨婧愰鑹?
          handleCanvasColorSelect({
            key: cellData.key,
            color: cellData.color
          });
          setTooltipData(null);
        }
        return;
      }

      // 涓€閿摝闄ゆā寮忛€昏緫
      if (isClick && isEraseMode) {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 鎵ц娲按濉厖鎿﹂櫎
          floodFillErase(j, i, cellData.key);
          setIsEraseMode(false); // 鎿﹂櫎瀹屾垚鍚庨€€鍑烘摝闄ゆā寮?
          setTooltipData(null);
        }
        return;
      }

      // Manual Coloring Logic - 淇濇寔鍘熸湁鐨勪笂鑹查€昏緫
      if (isClick && isManualColoringMode && selectedColor) {
        // 鎵嬪姩涓婅壊妯″紡閫昏緫淇濇寔涓嶅彉
        // ...鐜版湁浠ｇ爜...
        const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
        const currentCell = newPixelData[j]?.[i];

        if (!currentCell) return;

        const previousKey = currentCell.key;
        const wasExternal = currentCell.isExternal;
        
        let newCellData: MappedPixel;
        
        if (selectedColor.key === TRANSPARENT_KEY) {
          newCellData = { ...transparentColorData };
        } else {
          newCellData = { ...selectedColor, isExternal: false };
        }

        // Only update if state changes
        if (newCellData.key !== previousKey || newCellData.isExternal !== wasExternal) {
          newPixelData[j][i] = newCellData;
          applyGridEdit(newPixelData);

          // Update color counts
          if (colorCounts) {
            const newColorCounts = { ...colorCounts };
            let newTotalCount = totalBeadCount;

            // 澶勭悊涔嬪墠棰滆壊鐨勫噺灏戯紙浣跨敤hex鍊硷級
            if (!wasExternal && previousKey !== TRANSPARENT_KEY) {
              const previousCell = mappedPixelData[j][i];
              const previousHex = previousCell?.color?.toUpperCase();
              if (previousHex && newColorCounts[previousHex]) {
                newColorCounts[previousHex].count--;
                if (newColorCounts[previousHex].count <= 0) {
                  delete newColorCounts[previousHex];
              }
              newTotalCount--;
              }
            }

            // 澶勭悊鏂伴鑹茬殑澧炲姞锛堜娇鐢╤ex鍊硷級
            if (!newCellData.isExternal && newCellData.key !== TRANSPARENT_KEY) {
              const newHex = newCellData.color.toUpperCase();
              if (!newColorCounts[newHex]) {
                newColorCounts[newHex] = {
                  count: 0,
                  color: newHex
                };
              }
              newColorCounts[newHex].count++;
              newTotalCount++;
            }

            setColorCounts(newColorCounts);
            setTotalBeadCount(newTotalCount);
          }
        }
        
        // 涓婅壊鎿嶄綔鍚庨殣钘忔彁绀?
        setTooltipData(null);
      }
      // Tooltip Logic (闈炴墜鍔ㄤ笂鑹叉ā寮忕偣鍑绘垨鎮仠)
      else if (!isManualColoringMode) {
        // 鍙湁鍗曞厓鏍煎疄闄呮湁鍐呭锛堥潪鑳屾櫙/澶栭儴鍖哄煙锛夋墠浼氭樉绀烘彁绀?
        if (cellData && !cellData.isExternal && cellData.key) {
          // 妫€鏌ユ槸鍚﹀凡缁忔樉绀轰簡鎻愮ず妗嗭紝骞朵笖鏄惁鐐瑰嚮鐨勬槸鍚屼竴涓綅缃?
          // 瀵逛簬绉诲姩璁惧锛屼綅缃彲鑳芥湁缁嗗井鍋忓樊锛屾墍浠ユ垜浠鏌ュ崟鍏冩牸绱㈠紩鑰屼笉鏄叿浣撳潗鏍?
          if (tooltipData) {
            // 濡傛灉宸茬粡鏈夋彁绀烘锛岃绠楀綋鍓嶆彁绀烘瀵瑰簲鐨勬牸瀛愮殑绱㈠紩
            const tooltipRect = canvas.getBoundingClientRect();
            
            // 杩樺師鎻愮ず妗嗕綅缃负鐩稿浜巆anvas鐨勫潗鏍?
            const prevX = tooltipData.x; // 椤甸潰X鍧愭爣
            const prevY = tooltipData.y; // 椤甸潰Y鍧愭爣
            
            // 杞崲涓虹浉瀵逛簬canvas鐨勫潗鏍?
            const prevCanvasX = (prevX - tooltipRect.left) * scaleX;
            const prevCanvasY = (prevY - tooltipRect.top) * scaleY;
            
            // 璁＄畻涔嬪墠鏄剧ず鎻愮ず妗嗕綅缃搴旂殑缃戞牸绱㈠紩
            const prevCellI = Math.floor(prevCanvasX / cellWidthOutput);
            const prevCellJ = Math.floor(prevCanvasY / cellHeightOutput);
            
            // 濡傛灉鐐瑰嚮鐨勬槸鍚屼竴涓牸瀛愶紝鍒欏垏鎹ooltip鐨勬樉绀?闅愯棌鐘舵€?
            if (i === prevCellI && j === prevCellJ) {
              setTooltipData(null); // 闅愯棌鎻愮ず
              return;
            }
          }
          
          // 璁＄畻鐩稿浜巑ain鍏冪礌鐨勪綅缃?
          const mainElement = mainRef.current;
          if (mainElement) {
            const mainRect = mainElement.getBoundingClientRect();
            // 璁＄畻鐩稿浜巑ain鍏冪礌鐨勫潗鏍?
            const relativeX = pageX - mainRect.left - window.scrollX;
            const relativeY = pageY - mainRect.top - window.scrollY;
            
            // 濡傛灉鏄Щ鍔?鎮仠鍒颁竴涓柊鐨勬湁鏁堟牸瀛愶紝鎴栬€呯偣鍑讳簡涓嶅悓鐨勬牸瀛愶紝鍒欐樉绀烘彁绀?
            setTooltipData({
              x: relativeX,
              y: relativeY,
              key: cellData.key,
              color: cellData.color,
            });
          } else {
            // 濡傛灉娌℃湁鎵惧埌main鍏冪礌锛屼娇鐢ㄥ師濮嬪潗鏍?
            setTooltipData({
              x: pageX,
              y: pageY,
              key: cellData.key,
              color: cellData.color,
            });
          }
        } else {
          // 濡傛灉鐐瑰嚮/鎮仠鍦ㄥ閮ㄥ尯鍩熸垨鑳屾櫙涓婏紝闅愯棌鎻愮ず
          setTooltipData(null);
        }
      }
    } else {
      // 濡傛灉鐐瑰嚮/鎮仠鍦ㄧ敾甯冨閮紝闅愯棌鎻愮ず
      setTooltipData(null);
    }
  };

  // 澶勭悊鑷畾涔夎壊鏉夸腑鍗曚釜棰滆壊鐨勯€夋嫨鍙樺寲
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 淇濆瓨鑷畾涔夎壊鏉垮苟搴旂敤
  const handleSaveCustomPalette = () => {
    savePaletteSelections(customPaletteSelections);
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 瑙﹀彂鍥惧儚閲嶆柊澶勭悊
    setRemapTrigger(prev => prev + 1);
    // 閫€鍑烘墜鍔ㄤ笂鑹叉ā寮?
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 鏂板锛氬鍑鸿嚜瀹氫箟鑹叉澘閰嶇疆 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert('当前没有选中的颜色，无法导出。');
      return;
    }

    // 瀵煎嚭鏍煎紡锛氫粎鍩轰簬hex鍊?
    const exportData = {
      version: "3.0", // 鏂扮増鏈彿
      selectedHexValues: selectedHexValues,
      exportDate: new Date().toISOString(),
      totalColors: selectedHexValues.length
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-perler-palette.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ++ 鏂板锛氬鐞嗗鍏ョ殑鑹叉澘鏂囦欢 ++
  const handleImportPaletteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 妫€鏌ユ枃浠舵牸寮?
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error("无效的文件格式：文件必须包含 'selectedHexValues' 数组。");
        }

        console.log("妫€娴嬪埌鍩轰簬hex鍊肩殑鑹叉澘鏂囦欢");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // 楠岃瘉hex鍊?
        importedHexValues.forEach(hex => {
          const normalizedHex = hex.toUpperCase();
          const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === normalizedHex);
          if (colorData) {
            validHexValues.push(normalizedHex);
          } else {
            invalidHexValues.push(hex);
          }
        });

        if (invalidHexValues.length > 0) {
          console.warn("瀵煎叆鏃跺彂鐜版棤鏁堢殑hex鍊?", invalidHexValues);
          alert('导入完成，但以下颜色无效已被忽略：\n' + invalidHexValues.join(', '));
        }

        if (validHexValues.length === 0) {
          alert('导入的文件中不包含任何有效颜色。');
          return;
        }

        console.log('成功验证 ' + validHexValues.length + ' 个有效 hex 值');

        // 鍩轰簬鏈夋晥鐨刪ex鍊煎垱寤烘柊鐨剆elections瀵硅薄
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 鏍囪涓鸿嚜瀹氫箟
        alert('成功导入 ' + validHexValues.length + ' 个颜色！');

      } catch (error) {
        console.error("瀵煎叆鑹叉澘閰嶇疆澶辫触:", error);
        alert('导入失败: ' + (error instanceof Error ? error.message : '未知错误'));
      } finally {
        // 閲嶇疆鏂囦欢杈撳叆锛屼互渚垮彲浠ュ啀娆″鍏ョ浉鍚岀殑鏂囦欢
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.onerror = () => {
      alert('读取文件失败。');
       // 閲嶇疆鏂囦欢杈撳叆
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ++ 鏂板锛氳Е鍙戝鍏ユ枃浠堕€夋嫨 ++
  const triggerImportPalette = () => {
    importPaletteInputRef.current?.click();
  };

  // 鏂板锛氬鐞嗛鑹查珮浜?
  const handleHighlightColor = (colorHex: string) => {
    setHighlightColorKey(colorHex);
  };

  // 鏂板锛氶珮浜畬鎴愬洖璋?
  const handleHighlightComplete = () => {
    setHighlightColorKey(null);
  };

  // 鏂板锛氬垏鎹㈠畬鏁磋壊鏉挎樉绀?
  const handleToggleFullPalette = () => {
    setShowFullPalette(!showFullPalette);
  };

  // 鏂板锛氬鐞嗛鑹查€夋嫨锛屽悓鏃剁鐞嗘ā寮忓垏鎹?
  const handleColorSelect = (colorData: { key: string; color: string; isExternal?: boolean }) => {
    // 濡傛灉閫夋嫨鐨勬槸姗＄毊鎿︼紙閫忔槑鑹诧級涓斿綋鍓嶅湪棰滆壊鏇挎崲妯″紡锛岄€€鍑烘浛鎹㈡ā寮?
    if (colorData.key === TRANSPARENT_KEY && colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    // 閫夋嫨浠讳綍棰滆壊锛堝寘鎷鐨摝锛夋椂锛岄兘搴旇閫€鍑轰竴閿摝闄ゆā寮?
    if (isEraseMode) {
      setIsEraseMode(false);
    }
    
    // 璁剧疆閫変腑鐨勯鑹?
    setSelectedColor(colorData);
    setManualEditTool(colorData.key === TRANSPARENT_KEY ? 'eraser' : 'brush');
    setManualShapeStart(null);
  };

  // 鏂板锛氶鑹叉浛鎹㈢浉鍏冲鐞嗗嚱鏁?
  const handleColorReplaceToggle = () => {
    setColorReplaceState(prev => {
      if (prev.isActive) {
        // 閫€鍑烘浛鎹㈡ā寮?
        return {
          isActive: false,
          step: 'select-source'
        };
      } else {
        // 杩涘叆鏇挎崲妯″紡
        // 鍙€€鍑哄啿绐佺殑妯″紡锛屼絾淇濇寔鍦ㄦ墜鍔ㄤ笂鑹叉ā寮忎笅
        setIsEraseMode(false);
        setSelectedColor(null);
        return {
          isActive: true,
          step: 'select-source'
        };
      }
    });
  };

  // 鏂板锛氬鐞嗕粠鐢诲竷閫夋嫨婧愰鑹?
  const handleCanvasColorSelect = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
      // 楂樹寒鏄剧ず閫変腑鐨勯鑹?
      setHighlightColorKey(colorData.color);
      // 杩涘叆绗簩姝ワ細閫夋嫨鐩爣棰滆壊
      setColorReplaceState({
        isActive: true,
        step: 'select-target',
        sourceColor: colorData
      });
    }
  };

  // 鏂板锛氭墽琛岄鑹叉浛鎹?
  const handleColorReplace = (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    let replaceCount = 0;

    // 閬嶅巻鎵€鏈夊儚绱狅紝鏇挎崲鍖归厤鐨勯鑹?
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const currentCell = newPixelData[j][i];
        if (currentCell && !currentCell.isExternal && 
            currentCell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
          // 鏇挎崲棰滆壊
          newPixelData[j][i] = {
            key: targetColor.key,
            color: targetColor.color,
            isExternal: false
          };
          replaceCount++;
        }
      }
    }

    if (replaceCount > 0) {
      // 鏇存柊鍍忕礌鏁版嵁
      saveEditSnapshot();
      replaceProjectGrid(newPixelData, gridDimensions, '主体');

      // 閲嶆柊璁＄畻棰滆壊缁熻
      if (colorCounts) {
        const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
        let newTotalCount = 0;

        newPixelData.flat().forEach(cell => {
          if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
            const cellHex = cell.color.toUpperCase();
            if (!newColorCounts[cellHex]) {
              newColorCounts[cellHex] = {
                count: 0,
                color: cellHex
              };
            }
            newColorCounts[cellHex].count++;
            newTotalCount++;
          }
        });

        setColorCounts(newColorCounts);
        setTotalBeadCount(newTotalCount);
      }

      console.log('颜色替换完成：将 ' + replaceCount + ' 个 ' + sourceColor.key + ' 替换为 ' + targetColor.key);
    }

    // 閫€鍑烘浛鎹㈡ā寮?
    setColorReplaceState({
      isActive: false,
      step: 'select-source'
    });
    
    // 娓呴櫎楂樹寒
    setHighlightColorKey(null);
  };

  // 鐢熸垚瀹屾暣鑹叉澘鏁版嵁锛堢敤鎴疯嚜瀹氫箟鑹叉澘涓€変腑鐨勬墍鏈夐鑹诧級
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 鏍规嵁閫夋嫨鐨勮壊鍙风郴缁熻幏鍙栨樉绀虹殑鑹插彿
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 浣跨敤鑹茬浉鎺掑簭鑰屼笉鏄壊鍙锋帓搴?
    return sortColorsByHue(selectedColors);
  }, [customPaletteSelections, selectedColorSystem]);

  if (!originalImageSrc) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
        <InstallPWA />
        <input
          type="file"
          accept="image/jpeg, image/png, image/gif, .csv, text/csv, application/csv, text/plain"
          onChange={handleFileChange}
          ref={fileInputRef}
          className="hidden"
        />
        <ModernWorkspaceShell
          selectedColorSystem={selectedColorSystem}
          colorCount={Object.values(customPaletteSelections).filter(Boolean).length}
          saveStatus={saveStatus}
          hasCanvas={false}
          onUpload={triggerFileInput}
          onCreateBlank={handleCreateBlankCanvas}
          onOpenProjects={handleOpenProjects}
          onSave={() => persistProject()}
          onSaveAs={() => persistProject({ saveAs: true })}
          onDownload={() => setIsDownloadSettingsOpen(true)}
          onShare={() => openShareModal('share')}
          onImportShare={() => openShareModal('import')}
        />
        <ProjectListModal
          open={isProjectsModalOpen}
          loading={isProjectsLoading}
          projects={projects}
          onClose={() => setIsProjectsModalOpen(false)}
          onRefresh={refreshProjects}
          onOpen={handleOpenProject}
          onRename={handleRenameProject}
          onDelete={handleDeleteProject}
        />
        <ConflictModal
          conflict={versionConflict}
          onLoadServer={() => {
            if (currentProjectId) {
              handleOpenProject(currentProjectId);
            }
          }}
          onOverwrite={() => persistProject({ force: true })}
          onSaveAs={() => persistProject({ saveAs: true })}
        />
        <ShareCodeModal
          open={isShareModalOpen}
          shareCode={shareCode}
          isGenerating={isShareCodeGenerating}
          canShare={Boolean(mappedPixelData && gridDimensions)}
          projectName={currentProjectName}
          initialPanel={shareModalInitialPanel}
          onClose={() => setIsShareModalOpen(false)}
          onGenerate={handleGenerateShareCode}
          onImport={handleImportShareCode}
        />
        {toastMessage && (
          <div className="fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
            {toastMessage}
          </div>
        )}
      </>
    );
  }

  return (
    <>
    {/* 娣诲姞鑷畾涔夊姩鐢绘牱寮?*/}
    <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
    <style dangerouslySetInnerHTML={{ __html: '@keyframes toastFadeInOut{0%{opacity:0;transform:translate(-50%,10px)}15%{opacity:1;transform:translate(-50%,0)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}' }} />
    
    {/* PWA 瀹夎鎸夐挳 */}
    <InstallPWA />
    
    {/* ++ 淇敼锛氭坊鍔?onLoad 鍥炶皟鍑芥暟 ++ */}
    <Script
      async
      src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"
      strategy="lazyOnload"
      onLoad={() => {
        const basePV = 378536; // ++ 棰勮 PV 鍩烘暟 ++
        const baseUV = 257864; // ++ 棰勮 UV 鍩烘暟 ++

        const updateCount = (spanId: string, baseValue: number) => {
          const targetNode = document.getElementById(spanId);
          if (!targetNode) return;

          const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
              if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const currentValueText = targetNode.textContent?.trim() || '0';
                if (currentValueText !== '...') {
                  const currentValue = parseInt(currentValueText.replace(/,/g, ''), 10) || 0;
                  targetNode.textContent = (currentValue + baseValue).toLocaleString();
                  observer.disconnect(); // ++ 鏇存柊鍚庡仠姝㈣瀵?++ 
                  // console.log(`Updated ${spanId} from ${currentValueText} to ${targetNode.textContent}`);
                  break; // 澶勭悊瀹岀涓€涓湁鏁堟洿鏂板嵆鍙?
                }
              }
            }
          });

          observer.observe(targetNode, { childList: true, characterData: true, subtree: true });

          // ++ 澶勭悊鍒濆鍊煎凡缁忔槸鏁板瓧鐨勬儏鍐?(濡傛灉鑴氭湰鍔犺浇寰堝揩) ++
          const initialValueText = targetNode.textContent?.trim() || '0';
          if (initialValueText !== '...') {
             const initialValue = parseInt(initialValueText.replace(/,/g, ''), 10) || 0;
             targetNode.textContent = (initialValue + baseValue).toLocaleString();
             observer.disconnect(); // 宸叉洿鏂帮紝鏃犻渶鍐嶈瀵?
          }
        };

        updateCount('busuanzi_value_site_pv', basePV);
        updateCount('busuanzi_value_site_uv', baseUV);
      }}
    />

    {/* Apply dark mode styles to the main container */}
    <div className="modern-workspace min-h-screen flex flex-col overflow-x-hidden font-[family-name:var(--font-geist-sans)]">
      <header className="sticky top-0 z-40 w-full px-2 pb-1 pt-2 sm:px-4">
        <div className="modern-glass mx-auto flex min-h-14 w-full max-w-screen-2xl flex-wrap items-center gap-2 rounded-2xl px-2 py-1.5 sm:gap-3">
          <button type="button" className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg active:opacity-70" title="鍥炲埌宸ヤ綔鍙?>
            <span className="grid grid-cols-2 gap-0.5 rounded-lg bg-white/55 p-1.5 dark:bg-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </button>
          <div className="min-w-0 flex-1 sm:min-w-[9rem]">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">鎷艰眴</p>
            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{currentProjectName}</p>
          </div>
          {mappedPixelData && gridDimensions && (
            <div className="order-last flex w-full justify-center gap-1 sm:order-none sm:w-auto">
              {[
                { label: '浼樺寲', active: !isManualColoringMode, action: () => setIsManualColoringMode(false) },
                { label: '缂栬緫', active: isManualColoringMode, action: () => {
                  setIsManualColoringMode(true);
                  setManualEditTool(prev => prev === 'pan' ? prev : 'pan');
                  setSelectedColor(prev => prev || getDefaultPaintColor());
                  setShowFullPalette(true);
                  setIsFloatingPaletteOpen(false);
                  setTooltipData(null);
                } },
                { label: '棰勮', active: false, action: () => setIsPreviewModalOpen(true) },
                { label: '鎷艰眴', active: false, action: handleEnterFocusMode },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className={`min-h-9 rounded-xl px-3 text-xs font-medium transition-colors sm:px-4 ${
                    item.active
                      ? 'bg-[#d97757] text-white'
                      : 'text-gray-700 active:bg-white/50 dark:text-gray-200 dark:active:bg-white/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex min-w-0 basis-full flex-wrap items-center justify-start gap-1 sm:basis-auto sm:flex-1 sm:justify-end sm:gap-1.5">
            <button type="button" className="flex min-h-10 flex-col items-start rounded-xl bg-white/50 px-2 py-1 text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-2.5" title={`鑹叉澘璁剧疆 路 ${selectedColorSystem} 路 ${totalBeadCount || 0} 棰梎}>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">{selectedColorSystem || 'MARD'}</span>
              <span className="text-[11px] font-semibold">{totalBeadCount || 0}</span>
            </button>
            <button type="button" onClick={handleOpenProjects} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              鎴戠殑椤圭洰
            </button>
            <button type="button" onClick={isMounted ? triggerFileInput : undefined} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              瀵煎叆
            </button>
            <button type="button" onClick={() => setIsDownloadSettingsOpen(true)} disabled={!mappedPixelData} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              涓嬭浇
            </button>
            <button type="button" onClick={() => persistProject()} disabled={!mappedPixelData || !gridDimensions || saveStatus === 'saving'} className="min-h-10 rounded-xl bg-[#d97757] px-3 text-xs font-semibold text-white transition-colors active:bg-[#c4684a] disabled:bg-[#d97757]/40 disabled:text-white/70 sm:min-h-[44px] sm:px-4">
              {saveStatus === 'saving' ? '淇濆瓨涓? : '淇濆瓨'}
            </button>
            <button type="button" onClick={() => openShareModal('share')} disabled={!mappedPixelData || !gridDimensions} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              鍒嗕韩
            </button>
          </div>
        </div>
      </header>
      {/* Apply dark mode styles to the header */}
      <header className="hidden">
        {/* Adjust decorative background colors for dark mode */}
        <div className="absolute top-0 left-0 w-48 h-48 bg-blue-100 dark:bg-blue-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-pink-100 dark:bg-pink-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>

        {/* Adjust decorative dots color */}
        <div className="absolute top-0 right-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>

        {/* Header content - Ultra fancy integrated logo and titles */}
        <div className="relative z-10 py-8">
          {/* Integrated super fancy logo and title container */}
          <div className="relative flex flex-col items-center">
            {/* Ultra cute hyper-detailed 16-bead icon */}
            <div className="relative mb-6 animate-float">
              <div className="relative grid grid-cols-4 gap-2 p-4 bg-white/95 dark:bg-gray-800/95 rounded-3xl shadow-2xl border-4 border-gradient-to-r from-pink-300 via-purple-300 to-blue-300 dark:border-gray-600">
                {['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400',
                  'bg-purple-400', 'bg-pink-400', 'bg-orange-400', 'bg-teal-400',
                  'bg-indigo-400', 'bg-cyan-400', 'bg-lime-400', 'bg-amber-400',
                  'bg-rose-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400'].map((color, i) => (
                  <div key={i} className="relative">
                    <div
                      className={`w-5 h-5 rounded-full ${color} transition-all duration-500 hover:scale-150 shadow-xl hover:shadow-2xl relative z-10`}
                      style={{
                        animation: `float ${2 + (i % 3)}s ease-in-out infinite ${i * 0.1}s`,
                        boxShadow: `0 0 20px ${color.includes('red') ? '#f87171' : color.includes('blue') ? '#60a5fa' : color.includes('yellow') ? '#fbbf24' : color.includes('green') ? '#4ade80' : color.includes('purple') ? '#a855f7' : color.includes('pink') ? '#f472b6' : color.includes('orange') ? '#fb923c' : color.includes('teal') ? '#2dd4bf' : color.includes('indigo') ? '#818cf8' : color.includes('cyan') ? '#22d3ee' : color.includes('lime') ? '#84cc16' : color.includes('amber') ? '#f59e0b' : color.includes('rose') ? '#fb7185' : color.includes('sky') ? '#0ea5e9' : color.includes('emerald') ? '#10b981' : '#8b5cf6'}70`
                      }}
                    ></div>
                    {/* Mini decorations around each bead */}
                    {i % 4 === 0 && <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-yellow-300 rounded-full animate-ping"></div>}
                    {i % 4 === 1 && <div className="absolute -bottom-0.5 -left-0.5 w-0.5 h-0.5 bg-pink-300 rounded-full animate-pulse"></div>}
                    {i % 4 === 2 && <div className="absolute -top-0.5 -left-0.5 w-0.5 h-0.5 bg-blue-300 rounded-full animate-bounce"></div>}
                    {i % 4 === 3 && <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 bg-purple-300 rounded-full animate-spin"></div>}
                  </div>
                ))}
              </div>
              
              {/* Super cute decorations around the icon */}
              <div className="absolute -top-3 -right-4 w-3 h-3 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-ping transform rotate-12"></div>
              <div className="absolute -top-1 -right-2 w-2 h-2 bg-gradient-to-br from-pink-400 to-purple-500 rotate-45 animate-spin"></div>
              <div className="absolute -bottom-3 -left-4 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-bounce"></div>
              <div className="absolute -bottom-1 -left-2 w-1.5 h-1.5 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-pulse"></div>
              <div className="absolute top-0 -right-1 w-1 h-1 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-100"></div>
              <div className="absolute -top-2 left-2 w-1 h-1 bg-gradient-to-br from-orange-400 to-red-500 rounded-full animate-bounce delay-200"></div>
              <div className="absolute bottom-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-indigo-400 to-purple-500 rotate-45 animate-spin delay-300"></div>
              <div className="absolute -bottom-2 right-1 w-0.5 h-0.5 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-ping delay-400"></div>
              
              {/* Extra tiny sparkles */}
              <div className="absolute -top-4 left-1 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-pulse delay-500"></div>
              <div className="absolute top-2 -left-4 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-600"></div>
              <div className="absolute -bottom-4 right-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-700"></div>
              <div className="absolute bottom-2 -right-5 w-0.5 h-0.5 bg-purple-300 rounded-full animate-pulse delay-800"></div>
            </div>

            {/* Ultra fancy brand name and tool name with hyper cute decorations */}
            <div className="relative flex flex-col items-center space-y-3">
              {/* Brand name */}
              <div className="relative">
                <h1 className="relative text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 via-blue-500 to-cyan-400 tracking-wider drop-shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  鎷艰眴
                </h1>
                
                {/* Super fancy geometric decorations */}
                <div className="absolute -top-4 -right-5 w-4 h-4 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-spin transform rotate-12"></div>
                <div className="absolute -top-2 -right-2 w-2.5 h-2.5 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-0.5 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-blue-500 rotate-45 animate-pulse delay-100"></div>
                <div className="absolute -bottom-3 -left-5 w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rotate-45 animate-bounce delay-200"></div>
                <div className="absolute -bottom-1 -left-2 w-2 h-2 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-spin delay-300"></div>
                <div className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-400"></div>
                <div className="absolute -bottom-4 -right-3 w-3 h-3 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-full animate-bounce delay-500"></div>
                <div className="absolute top-1 -left-4 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rotate-45 animate-ping delay-600"></div>
                
                {/* Extra tiny sparkles around brand name */}
                <div className="absolute -top-3 left-0 w-1 h-1 bg-yellow-300 rounded-full animate-pulse delay-700"></div>
                <div className="absolute -top-2 right-3 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-800"></div>
                <div className="absolute bottom-0 -left-1 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute bottom-1 right-0 w-1 h-1 bg-purple-300 rounded-full animate-pulse delay-1000"></div>
              </div>
              
              {/* Tool name - 鎷艰眴搴曠鐢熸垚鍣?with hyper cute style */}
              <div className="relative">
                <h2 className="relative text-xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-teal-500 via-green-500 to-emerald-400 tracking-widest transform hover:scale-102 transition-all duration-300">
                  鎷艰眴搴曠鐢熸垚鍣?
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 tracking-widest ml-1 align-middle">绔栧睆鐗?/span>
                </h2>
                
                {/* Super cute geometric shapes */}
                <div className="absolute -top-3 -left-6 w-3.5 h-3.5 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full animate-bounce delay-75"></div>
                <div className="absolute -top-1 -left-3 w-2 h-2 bg-gradient-to-br from-teal-400 to-green-500 rounded-full animate-ping delay-150"></div>
                <div className="absolute -top-0.5 -left-1 w-1 h-1 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-pulse delay-225"></div>
                <div className="absolute -top-3 -right-6 w-3 h-3 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-spin delay-300"></div>
                <div className="absolute -top-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full animate-bounce delay-375"></div>
                <div className="absolute -bottom-2 -right-3 w-2.5 h-2.5 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full animate-pulse delay-450"></div>
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-gradient-to-br from-teal-400 to-blue-500 rotate-45 animate-spin delay-525"></div>
                
                {/* Mini sparkles around tool name */}
                <div className="absolute -top-2 left-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-600"></div>
                <div className="absolute -top-1 right-2 w-1 h-1 bg-teal-300 rounded-full animate-pulse delay-675"></div>
                <div className="absolute bottom-0 left-4 w-0.5 h-0.5 bg-green-300 rounded-full animate-bounce delay-750"></div>
                <div className="absolute bottom-1 right-4 w-0.5 h-0.5 bg-emerald-300 rounded-full animate-pulse delay-825"></div>
                <div className="absolute top-2 -left-2 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute top-2 -right-2 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-975"></div>
              </div>
            </div>
            
            {/* Ultra cute floating elements constellation around the entire group */}
            <div className="absolute -top-10 -left-10 w-3 h-3 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-float"></div>
            <div className="absolute -top-8 -left-6 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rotate-45 animate-spin delay-100"></div>
            <div className="absolute -top-6 -left-12 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rounded-full animate-bounce delay-200"></div>
            
            <div className="absolute -top-10 -right-10 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-ping delay-300"></div>
            <div className="absolute -top-6 -right-14 w-1 h-1 bg-gradient-to-br from-cyan-400 to-blue-500 rotate-45 animate-pulse delay-400"></div>
            <div className="absolute -top-4 -right-8 w-3 h-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full animate-bounce delay-500"></div>
            
            <div className="absolute -bottom-10 -left-10 w-2 h-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full animate-pulse delay-600"></div>
            <div className="absolute -bottom-8 -left-14 w-1.5 h-1.5 bg-gradient-to-br from-orange-400 to-red-500 rotate-45 animate-spin delay-700"></div>
            <div className="absolute -bottom-6 -left-6 w-2.5 h-2.5 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-float delay-800"></div>
            
            <div className="absolute -bottom-10 -right-10 w-3 h-3 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-bounce delay-900"></div>
            <div className="absolute -bottom-8 -right-6 w-1 h-1 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full animate-ping delay-1000"></div>
            <div className="absolute -bottom-6 -right-14 w-2 h-2 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full animate-pulse delay-1100"></div>
            
            {/* Extra tiny magical sparkles */}
            <div className="absolute -top-12 left-0 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-ping delay-1200"></div>
            <div className="absolute -top-2 -left-16 w-1 h-1 bg-pink-300 rounded-full animate-bounce delay-1300"></div>
            <div className="absolute top-2 -right-18 w-0.5 h-0.5 bg-blue-300 rounded-full animate-pulse delay-1400"></div>
            <div className="absolute -bottom-12 right-0 w-1 h-1 bg-purple-300 rounded-full animate-float delay-1500"></div>
            <div className="absolute -bottom-2 -right-16 w-0.5 h-0.5 bg-green-300 rounded-full animate-ping delay-1600"></div>
            <div className="absolute bottom-2 -left-18 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-1700"></div>
          </div>
          {/* Slogan */}
          <p className="mt-3 text-sm sm:text-base font-light text-gray-500 dark:text-gray-400 text-center tracking-[0.15em]">
            璁╁儚绱犲垱鎰忓睘浜庢瘡涓€涓汉
          </p>

          {/* 妯睆璁惧寮圭獥 */}
          {showDesktopModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDesktopModal(false)}>
              <div className="relative mx-4 w-full max-w-md rounded-2xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowDesktopModal(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-blue-500 dark:text-blue-300">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v8h12V4H4zm-1 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">涓撲笟宸ヤ綔鍙板凡涓婄嚎</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">涓撲笟宸ヤ綔鍙版嫢鏈夋洿瀹屾暣鐨勫姛鑳藉拰鏇村ソ鐨勬搷浣滀綋楠岋紝鎺ㄨ崘鍓嶅線浣跨敤銆?/p>
                  <div className="mt-5 flex w-full gap-3">
                    <button
                      onClick={() => setShowDesktopModal(false)}
                      className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      鐣欏湪姝ら〉
                    </button>
                    <a
                      href="https://perlerbeads.zippland.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      鍓嶅線涓撲笟宸ヤ綔鍙?
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h9.586L11.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 閾炬帴琛岋細涓撲笟宸ヤ綔鍙奥?灏忕孩涔?路 GitHub */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs">
            <a href="https://perlerbeads.zippland.com/" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v8h12V4H4zm-1 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              涓撲笟宸ヤ綔鍙?
              <span className="px-1 py-px rounded bg-indigo-500 text-[9px] font-bold text-white leading-none">NEW</span>
            </a>
            <span className="text-gray-300 dark:text-gray-600">路</span>
            <a href="https://www.xiaohongshu.com/user/profile/623e8b080000000010007721" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m238.8 360.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8zM448 496l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z m248.9 43.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z"/>
              </svg>
              灏忕孩涔?
            </a>
            <span className="text-gray-300 dark:text-gray-600">路</span>
            <a href="https://github.com/Zippland/perler-beads" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 0C5.37 0 0 5.48 0 12.25c0 5.42 3.44 10.01 8.2 11.63.6.12.82-.27.82-.6 0-.3-.01-1.08-.02-2.13-3.34.74-4.04-1.65-4.04-1.65-.55-1.44-1.35-1.83-1.35-1.83-1.1-.78.08-.77.08-.77 1.21.09 1.85 1.26 1.85 1.26 1.08 1.9 2.83 1.35 3.52 1.03.11-.81.42-1.35.77-1.66-2.66-.31-5.46-1.36-5.46-6.06 0-1.34.46-2.43 1.22-3.29-.12-.31-.53-1.55.12-3.23 0 0 1-.33 3.29 1.25a10.96 10.96 0 0 1 5.98 0c2.29-1.58 3.29-1.25 3.29-1.25.65 1.68.24 2.92.12 3.23.76.86 1.22 1.95 1.22 3.29 0 4.71-2.81 5.74-5.49 6.05.43.38.81 1.13.81 2.28 0 1.65-.02 2.98-.02 3.39 0 .33.22.72.83.59C20.56 22.25 24 17.67 24 12.25 24 5.48 18.63 0 12 0Z" />
              </svg>
              GitHub
            </a>
          </div>
          {/* 鏉ユ簮鎻愮ず */}
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">鍙戝竷骞冲彴璇锋爣娉ㄦ潵婧愭垨淇濈暀鍥剧墖姘村嵃鍙婃爣璇?/p>
        </div>
      </header>

      <div className={`mx-auto grid w-full max-w-screen-2xl flex-1 gap-3 px-2 py-3 sm:px-4 ${
        isManualColoringMode ? 'xl:grid-cols-1 xl:pl-[88px] xl:pr-[328px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]'
      }`}>
      {/* Apply dark mode styles to the main section */}
      <main ref={mainRef} className="modern-stage w-full overflow-hidden rounded-2xl px-3 py-4 flex flex-col items-center space-y-5 sm:space-y-6 relative sm:px-5">
        {!isManualColoringMode && (
          <ProjectToolbar
            projectName={currentProjectName}
            saveStatus={saveStatus}
            disabled={!mappedPixelData || !gridDimensions || saveStatus === 'saving'}
            onSave={() => persistProject()}
            onSaveAs={() => persistProject({ saveAs: true })}
            onOpenProjects={handleOpenProjects}
            onEditImage={() => setIsImageEditorOpen(true)}
            onCanvasTools={() => setIsCanvasToolsOpen(true)}
            onShare={() => openShareModal('share')}
            onImportShare={() => openShareModal('import')}
            onNameChange={(name) => {
              setCurrentProjectName(name);
              if (mappedPixelData && gridDimensions) {
                setHasUnsavedChanges(true);
                setSaveStatus('dirty');
              }
            }}
          />
        )}

        {/* Apply dark mode styles to the Drop Zone */}
        {!mappedPixelData && (
          <div
            onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragOver}
            onClick={isMounted ? triggerFileInput : undefined}
            className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center ${isMounted ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-800' : 'cursor-wait'} transition-all duration-300 w-full md:max-w-md flex flex-col justify-center items-center shadow-sm hover:shadow-md`}
            style={{ minHeight: '130px' }}
          >
            {/* Icon color */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500 mb-2 sm:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {/* Text color */}
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">鎷栨斁鍥剧墖鍒版澶勶紝鎴?span className="font-medium text-blue-600 dark:text-blue-400">鐐瑰嚮閫夋嫨鏂囦欢</span></p>
            {/* Text color */}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">鏀寔 JPG, PNG, GIF 鍥剧墖鏍煎紡锛屾垨 CSV 鏁版嵁鏂囦欢</p>
          </div>
        )}

        {mappedPixelData && !isManualColoringMode && (
          <div
            role="button"
            tabIndex={0}
            onClick={isMounted ? triggerFileInput : undefined}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && isMounted) {
                event.preventDefault();
                triggerFileInput();
              }
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            className="w-full max-w-3xl cursor-pointer rounded-xl border border-dashed border-gray-300 bg-white/55 px-4 py-2 text-center text-xs font-medium text-gray-500 transition-colors active:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
          >
            鎷栨斁鍥剧墖鎴?CSV 鍒拌繖閲岋紝鎴栫偣鍑诲鍏?鏇挎崲搴曠
          </div>
        )}

        {/* Apply dark mode styles to the Tip Box */}
        {!originalImageSrc && !isManualColoringMode && (
          <div className="w-full md:max-w-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 p-3 rounded-lg border border-blue-100 dark:border-gray-600 shadow-sm">
            {/* Icon color */}
            <p className="text-xs text-indigo-700 dark:text-indigo-300 flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 flex-shrink-0 text-blue-500 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {/* Text color */}
              <span className="text-indigo-700 dark:text-indigo-300">灏忚创澹細浣跨敤鍍忕礌鍥捐繘琛岃浆鎹㈠墠锛岃纭繚鍥剧墖鐨勮竟缂樺惢鍚堝儚绱犳牸瀛愮殑杈圭晫绾匡紝杩欐牱鍙互鑾峰緱鏇寸簿纭殑鍒囧壊鏁堟灉鍜屾洿濂界殑鎴愬搧銆?/span>
            </p>
          </div>
        )}

                      <input type="file" accept="image/jpeg, image/png, image/gif, .csv, text/csv, application/csv, text/plain" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

        {/* Controls and Output Area */}
        {originalImageSrc && (
          <div className="w-full flex flex-col items-center space-y-5 sm:space-y-6">
            {/* ++ HIDE Control Row in manual mode ++ */}
            {!isManualColoringMode && (
              /* 淇敼鎺у埗闈㈡澘缃戞牸甯冨眬 */
              <div className="w-full md:max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                {/* Granularity Input */}
                <div className="flex-1">
                  {/* Label color */}
                  <label htmlFor="granularityInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    妯酱鍒囧壊鏁伴噺 (10-300):
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Input field styles */}
                    <input
                      type="number"
                      id="granularityInput"
                      value={granularityInput}
                      onChange={handleGranularityInputChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                      min="10"
                      max="300"
                    />
                  </div>
                </div>

                {/* Similarity Threshold Input */}
                <div className="flex-1">
                    {/* Label color */}
                    <label htmlFor="similarityThresholdInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                        棰滆壊鍚堝苟闃堝€?(0-100):
                    </label>
                    <div className="flex items-center gap-2">
                      {/* Input field styles */}
                      <input
                        type="number"
                        id="similarityThresholdInput"
                        value={similarityThresholdInput}
                        onChange={handleSimilarityThresholdInputChange}
                        className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                        min="0"
                        max="100"
                      />
                    </div>
                </div>

                {/* 蹇嵎鎸夐挳 */}
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleConfirmParameters}
                    className="h-9 bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 rounded-md whitespace-nowrap transition-colors duration-200 shadow-sm"
                  >
                    搴旂敤鏁板瓧
                  </button>
                  <button
                    onClick={handleAutoRemoveBackground}
                    disabled={!mappedPixelData || !gridDimensions}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    涓€閿幓鑳屾櫙
                  </button>
                  <button
                    onClick={handleUndoBgRemoval}
                    disabled={!bgRemovalSnapshot}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    鍥炴挙涓婁竴姝?
                  </button>
                </div>

                {/* Pixelation Mode Selector */}
                <div className="sm:col-span-2">
                  {/* Label color */}
                  <label htmlFor="pixelationModeSelect" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">澶勭悊妯″紡:</label>
                  <div className="flex items-center gap-2">
                    {/* Select field styles */}
                    <select
                      id="pixelationModeSelect"
                      value={pixelationMode}
                      onChange={handlePixelationModeChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                    >
                      <option value={PixelationMode.JettCartoon} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">Jett Cartoon</option>
                      <option value={PixelationMode.JettRealistic} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">Jett Realistic</option>
                      <option value={PixelationMode.Dominant} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">鍗￠€?(涓昏壊)</option>
                      <option value={PixelationMode.Average} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">鐪熷疄 (骞冲潎)</option>
                    </select>
                  </div>
                </div>

                {/* 鑹插彿绯荤粺閫夋嫨鍣?*/}
                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">鑹插彿绯荤粺:</label>
                  <div className="flex flex-wrap gap-2">
                    {colorSystemOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => setSelectedColorSystem(option.key as ColorSystem)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex-shrink-0 ${
                          selectedColorSystem === option.key
                            ? 'bg-blue-500 text-white border-blue-500 shadow-md transform scale-105'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 鑷畾涔夎壊鏉挎寜閽?*/}
                <div className="sm:col-span-2 mt-3">
                  <button
                    onClick={() => setIsCustomPaletteEditorOpen(true)}
                    className="w-full py-2.5 px-3 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:from-blue-600 hover:to-purple-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                    </svg>
                    绠＄悊鑹叉澘 ({Object.values(customPaletteSelections).filter(Boolean).length} 鑹?
                  </button>
                  {isCustomPalette && (
                    <p className="text-xs text-center text-blue-500 dark:text-blue-400 mt-1.5">褰撳墠浣跨敤鑷畾涔夎壊鏉?/p>
                  )}
                </div>
              </div>
            )}

            {/* 鑷畾涔夎壊鏉跨紪杈戝櫒寮圭獥 - 杩欐槸鏂板鐨勯儴鍒?*/}
            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                   {/* 娣诲姞闅愯棌鐨勬枃浠惰緭鍏ユ */}
                   <input
                    type="file"
                    accept=".json"
                    ref={importPaletteInputRef}
                    onChange={handleImportPaletteFile}
                    className="hidden"
                  />
                  <div className="p-4 sm:p-6 flex-1 overflow-y-auto"> {/* 璁╁唴瀹瑰尯鍩熷彲婊氬姩 */}
                    <CustomPaletteEditor
                      allColors={fullBeadPalette}
                      currentSelections={customPaletteSelections}
                      onSelectionChange={handleSelectionChange}
                      onSaveCustomPalette={handleSaveCustomPalette}
                      onClose={() => setIsCustomPaletteEditorOpen(false)}
                      onExportCustomPalette={handleExportCustomPalette}
                      onImportCustomPalette={triggerImportPalette}
                      selectedColorSystem={selectedColorSystem}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Output Section */}
            <div className="w-full md:max-w-2xl">
              <canvas ref={originalCanvasRef} className="hidden"></canvas>

              {/* ++ 鎵嬪姩缂栬緫妯″紡鎻愮ず淇℃伅 ++ */}
              {false && isManualColoringMode && mappedPixelData && gridDimensions && (
                <div className="w-full mb-4 p-3 bg-blue-50 dark:bg-gray-800 rounded-lg shadow-sm border border-blue-100 dark:border-gray-700">
                  <div className="flex justify-center">
                    <div className="bg-blue-50 dark:bg-gray-700 border border-blue-100 dark:border-gray-600 rounded-lg p-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs text-gray-600 dark:text-gray-300 w-full sm:w-auto">
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>浣跨敤鎮诞宸ュ叿鏍忔搷浣?/span>
                      </div>
                      <span className="hidden sm:inline text-gray-300 dark:text-gray-500">|</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>鎺ㄨ崘鐢佃剳鎿嶄綔锛屼笂鑹叉洿绮惧噯</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {false && isManualColoringMode && mappedPixelData && gridDimensions && (
                <div className="mb-4 w-full rounded-xl border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {manualEditTools.map(({ tool, label, title }) => (
                        <button
                          key={tool}
                          type="button"
                          onClick={() => {
                            setManualEditTool(tool);
                            setManualShapeStart(null);
                            if (tool === 'brush' || tool === 'fill' || tool === 'line' || tool === 'rect' || tool === 'select' || tool === 'move' || tool === 'paste') {
                              setIsEraseMode(false);
                              setColorReplaceState({ isActive: false, step: 'select-source' });
                            }
                          }}
                          title={title}
                          className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors ${
                            manualEditTool === tool
                              ? 'bg-[#d97757] text-white shadow-sm'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span>褰撳墠</span>
                      <span
                        className="h-5 w-5 rounded border border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: manualEditTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
                      />
                      <span>
                        {manualEditTool === 'eraser'
                          ? '姗＄毊'
                          : selectedColor
                            ? getColorKeyByHex(selectedColor?.color || '#FFFFFF', selectedColorSystem)
                            : '鏈€夐鑹?}
                      </span>
                      {manualShapeStart && (
                        <span className="rounded bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                          宸查€夎捣鐐?{(manualShapeStart?.col ?? 0) + 1},{(manualShapeStart?.row ?? 0) + 1}
                        </span>
                      )}
                      {activeSelection && (
                        <span className="rounded bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                          閫夊尯 {Math.abs((activeSelection?.endCol ?? 0) - (activeSelection?.startCol ?? 0)) + 1}x{Math.abs((activeSelection?.endRow ?? 0) - (activeSelection?.startRow ?? 0)) + 1}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                    <button type="button" disabled={!activeSelection} onClick={handleCopyActiveSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      澶嶅埗
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={handleCutActiveSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      鍓垏
                    </button>
                    <button type="button" disabled={!selectionClipboard || !activeSelection} onClick={handlePasteAtSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      绮樿创鍒伴€夊尯
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={handleDeleteActiveSelection} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-40 dark:border-red-800 dark:text-red-300">
                      鍒犻櫎
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={() => setActiveSelection(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      鍙栨秷閫夊尯
                    </button>
                  </div>
                </div>
              )}

              {/* Canvas Preview Container */}
              {/* Apply dark mode styles */}
              <div className={
                isManualColoringMode
                  ? 'fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.24)_1px,transparent_0)] [background-size:24px_24px] bg-[#f4f0ea] dark:bg-gray-950'
                  : 'bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-700'
              }>
                {/* 澶х敾甯冩彁绀轰俊鎭?*/}
                {!isManualColoringMode && gridDimensions && gridDimensions.N > 100 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>楂樼簿搴︾綉鏍?({gridDimensions.N}脳{gridDimensions.M}) - 鐢诲竷宸茶嚜鍔ㄦ斁澶э紝鍙乏鍙虫粴鍔ㄣ€佹斁澶ф煡鐪嬬簿缁嗗浘鍍?/span>
                    </div>
                  </div>
                )}
                 {/* Inner container background - 鍏佽姘村钩婊氬姩浠ラ€傚簲澶х敾甯?*/}
                <div
                  className={
                    isManualColoringMode
                      ? 'relative h-full w-full overflow-hidden'
                      : 'flex justify-center mb-3 sm:mb-4 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg overflow-x-auto overflow-y-hidden'
                  }
                  style={isManualColoringMode ? undefined : { minHeight: '150px' }}
                >
                  {/* PixelatedPreviewCanvas component needs internal changes for dark mode drawing */}
                  <PixelatedPreviewCanvas
                    canvasRef={pixelatedCanvasRef}
                    mappedPixelData={mappedPixelData}
                    gridDimensions={gridDimensions}
                    activeSelection={activeSelection}
                    isManualColoringMode={isManualColoringMode}
                    continuousManualInput={manualEditTool === 'brush' || manualEditTool === 'eraser'}
                    isPanTool={manualEditTool === 'pan'}
                    onInteraction={handleCanvasInteraction}
                    onManualPointerCell={handleManualPointerCell}
                    highlightColorKey={highlightColorKey}
                    onHighlightComplete={handleHighlightComplete}
                  />
                </div>
              </div>
            </div>
          </div> // This closes the main div started after originalImageSrc check
        )}

        {/* ++ HIDE Color Counts in manual mode ++ */}
        {!isManualColoringMode && originalImageSrc && colorCounts && Object.keys(colorCounts).length > 0 && (
          // Apply dark mode styles to color counts container
          <div className="w-full md:max-w-2xl mt-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-700 color-stats-panel">
            {/* Title color */}
            <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200 text-center">
              鍘婚櫎鏉傝壊 
            </h3>
            {/* Subtitle color */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">鐐瑰嚮涓嬫柟鍒楄〃涓殑棰滆壊鍙皢鍏朵粠鍙敤鍒楄〃涓帓闄ゃ€傛€昏: {totalBeadCount} 棰?/p>
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-2 text-sm">
              {Object.keys(colorCounts)
                .sort((a, b) => {
                  const countDelta = colorCounts[a].count - colorCounts[b].count;
                  return countDelta !== 0 ? countDelta : sortColorKeys(a, b);
                })
                .map((hexKey) => {
                  // 鐜板湪key鏄痟ex鍊硷紝闇€瑕侀€氳繃hex鑾峰彇瀵瑰簲鑹插彿绯荤粺鐨勮壊鍙?
                  const displayColorKey = getColorKeyByHex(hexKey, selectedColorSystem);
                  const isExcluded = excludedColorKeys.has(hexKey);
                  const count = colorCounts[hexKey].count;
                  const colorHex = colorCounts[hexKey].color;

                  return (
                    <li
                      key={hexKey}
                      onClick={() => handleToggleExcludeColor(hexKey)}
                       // Apply dark mode styles for list items (normal and excluded)
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${ 
                        isExcluded
                          ? 'bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 opacity-60 dark:opacity-70' // Darker red background for excluded
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={isExcluded ? `鐐瑰嚮鎭㈠ ${displayColorKey}` : `鐐瑰嚮鎺掗櫎 ${displayColorKey}`}
                    >
                      <div className={`flex items-center space-x-2 ${isExcluded ? 'line-through' : ''}`}>
                        {/* Adjust color swatch border */}
                        <span
                          className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                          style={{ backgroundColor: isExcluded ? '#666' : colorHex }} // Darker gray for excluded swatch
                        ></span>
                        {/* Adjust text color for key (normal and excluded) */}
                        <span className={`font-mono font-medium ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{displayColorKey}</span>
                      </div>
                      {/* Adjust text color for count (normal and excluded) */}
                      <span className={`text-xs ${isExcluded ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-300'}`}>{count} 棰?/span>
                    </li>
                  );
                })}
            </ul>
            {excludedColorKeys.size > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowExcludedColors(prev => !prev)}
                    className="w-full text-xs py-1.5 px-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-between"
                  >
                    <span>宸叉帓闄ょ殑棰滆壊 ({excludedColorKeys.size})</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${showExcludedColors ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExcludedColors && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md p-2 bg-gray-100 dark:bg-gray-800">
                      <div className="max-h-40 overflow-y-auto">
                        {Array.from(excludedColorKeys).length > 0 ? (
                          <ul className="space-y-1">
                            {Array.from(excludedColorKeys).sort(sortColorKeys).map(hexKey => {
                              const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === hexKey.toUpperCase());
                              return (
                                <li key={hexKey} className="flex justify-between items-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                                      style={{ backgroundColor: colorData?.hex || hexKey }}
                                    ></span>
                                    <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{getColorKeyByHex(hexKey, selectedColorSystem)}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      // 瀹炵幇鎭㈠鍗曚釜棰滆壊鐨勯€昏緫
                                      const newExcludedKeys = new Set(excludedColorKeys);
                                      newExcludedKeys.delete(hexKey);
                                      setExcludedColorKeys(newExcludedKeys);
                                      setRemapTrigger(prev => prev + 1);
                                      setIsManualColoringMode(false);
                                      setSelectedColor(null);
                                      console.log(`Restored color: ${hexKey}`);
                                    }}
                                    className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40"
                                  >
                                    鎭㈠
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                            娌℃湁鎺掗櫎鐨勯鑹?
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          // 鎭㈠鎵€鏈夐鑹茬殑閫昏緫
                          setExcludedColorKeys(new Set());
                          setRemapTrigger(prev => prev + 1);
                          setIsManualColoringMode(false);
                          setSelectedColor(null);
                          console.log("Restored all excluded colors");
                        }}
                        className="mt-2 w-full text-xs py-1 px-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        涓€閿仮澶嶆墍鏈夐鑹?
                      </button>
                    </div>
                  )}
                </div>
            )}
          </div>
        )} {/* ++ End of HIDE Color Counts ++ */}

        {/* Message if palette becomes empty (Also hide in manual mode) */}
         {!isManualColoringMode && originalImageSrc && activeBeadPalette.length === 0 && excludedColorKeys.size > 0 && (
             // Apply dark mode styles to the warning box
             <div className="w-full md:max-w-2xl mt-6 bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded-lg shadow border border-yellow-200 dark:border-yellow-800/60 text-center text-sm text-yellow-800 dark:text-yellow-300">
                 褰撳墠鍙敤棰滆壊杩囧皯鎴栦负绌恒€傝鍦ㄤ笂鏂圭粺璁″垪琛ㄤ腑鏌ョ湅宸叉帓闄ょ殑棰滆壊骞舵仮澶嶉儴鍒嗭紝鎴栨洿鎹㈣壊鏉裤€?
                 {excludedColorKeys.size > 0 && (
                      // Apply dark mode styles to the inline "restore all" button
                      <button
                          onClick={() => {
                            setShowExcludedColors(true); // 灞曞紑鎺掗櫎棰滆壊鍒楄〃
                            // 婊氬姩鍒伴鑹插垪琛ㄥ
                            setTimeout(() => {
                              const listElement = document.querySelector('.color-stats-panel');
                              if (listElement) {
                                listElement.scrollIntoView({ behavior: 'smooth' });
                              }
                            }, 100);
                          }}
                          className="mt-2 ml-2 text-xs py-1 px-2 bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-300 dark:hover:bg-yellow-600/70 transition-colors"
                      >
                          鏌ョ湅宸叉帓闄ら鑹?({excludedColorKeys.size})
                      </button>
                  )}
             </div>
         )}

        {/* ++ RENDER Enter Manual Mode Button ONLY when NOT in manual mode (before downloads) ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && gridDimensions && (
            <div className="w-full md:max-w-2xl mt-4 space-y-3"> {/* Wrapper div */} 
             {/* Manual Edit Mode Button */}
             <button
                onClick={() => {
                  setIsManualColoringMode(true); // Enter mode
                  setManualEditTool('brush');
                  setManualShapeStart(null);
                  setSelectedColor(getDefaultPaintColor());
                  setShowFullPalette(true);
                  setIsFloatingPaletteOpen(true);
                  setTooltipData(null);
                }}
                className={`w-full py-2.5 px-4 text-sm sm:text-base rounded-lg transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg hover:translate-y-[-1px]`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /> </svg>
                 杩涘叆鎵嬪姩缂栬緫妯″紡
             </button>

             {/* Focus Mode Button */}
             <button
                onClick={handleEnterFocusMode}
                className={`w-full py-2.5 px-4 text-sm sm:text-base rounded-lg transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg hover:translate-y-[-1px]`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                 </svg>
                 杩涘叆涓撳績鎷艰眴妯″紡锛圓plhaTest锛?
             </button>
            </div>
        )} {/* ++ End of RENDER Enter Manual Mode Button ++ */}

        {/* ++ HIDE Download Buttons in manual mode ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && (
            <div className="w-full md:max-w-2xl mt-4">
              {/* 浣跨敤涓€涓ぇ鎸夐挳锛岀幇鍦ㄦ墍鏈夌殑涓嬭浇璁剧疆閮介€氳繃寮圭獥鎺у埗 */}
              <button
                onClick={() => setIsDownloadSettingsOpen(true)}
                disabled={!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm sm:text-base rounded-lg hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:translate-y-[-1px] disabled:hover:translate-y-0 disabled:hover:shadow-md"
               >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                涓嬭浇鎷艰眴鍥剧焊
              </button>
            </div>
        )} {/* ++ End of HIDE Download Buttons ++ */}

         {/* Tooltip Display (Needs update in GridTooltip.tsx) */}
         {tooltipData && (
            <GridTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
          )}

      </main>

      <aside className={`modern-side-panel hidden rounded-2xl ${isManualColoringMode ? 'xl:hidden' : 'xl:flex'}`}>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
          <section className="rounded-xl border border-white/50 bg-white/45 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">椤圭洰</p>
            <h2 className="mt-1 truncate text-base font-semibold text-gray-800 dark:text-gray-100">{currentProjectName}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">鐢诲竷</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">璞嗘暟</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{totalBeadCount || 0}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">鑹叉澘</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{selectedColorSystem}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">鐘舵€?/p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{saveStatus === 'saved' ? '宸蹭繚瀛? : saveStatus === 'saving' ? '淇濆瓨涓? : saveStatus === 'dirty' ? '鏈繚瀛? : saveStatus === 'conflict' ? '鏈夊啿绐? : '闇€妫€鏌?}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/50 bg-white/45 p-4 dark:border-white/10 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">蹇嵎鎿嶄綔</h2>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={handleOpenProjects} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                鎵撳紑鎴戠殑椤圭洰
              </button>
              <button type="button" onClick={() => setIsImageEditorOpen(true)} disabled={!originalImageSrc} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                缂栬緫鍘熷浘
              </button>
              <button type="button" onClick={() => setIsCanvasToolsOpen(true)} disabled={!mappedPixelData || !gridDimensions} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                鐢诲竷宸ュ叿
              </button>
              <button type="button" onClick={handleOpenHistory} disabled={!currentProjectId} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                鍘嗗彶涓庡浠?              </button>
              <button type="button" onClick={() => openShareModal('import')} disabled={!mappedPixelData || !gridDimensions} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                鍒嗕韩鐮佸鍏?瀵煎嚭
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">绉佹湁鍚屾</h2>
            <p className="mt-2 text-xs leading-6 text-emerald-800/80 dark:text-emerald-100/75">
              褰撳墠鐗堟湰浣跨敤鏈嶅姟鍣?SQLite 淇濆瓨椤圭洰锛屾墜鏈哄拰鐢佃剳璁块棶鍚屼竴鍦板潃鍚庯紝鍙互鎵撳紑鍚屼竴椤圭洰缁х画淇敼銆傚叕寮€鐢诲粖鍙戝竷鍔熻兘鎸夎姹備笉鎺ュ叆銆?
            </p>
          </section>
        </div>
      </aside>
      </div>

      {isManualColoringMode && (
        <ManualEditDock
          activeTool={manualEditTool}
          onToolChange={(tool) => {
            setManualEditTool(tool);
            setManualShapeStart(null);
            if (tool === 'brush' || tool === 'pan' || tool === 'fill' || tool === 'line' || tool === 'rect' || tool === 'select' || tool === 'move' || tool === 'paste') {
              setIsEraseMode(false);
              setColorReplaceState({ isActive: false, step: 'select-source' });
            }
            if (tool === 'eraser') {
              setIsEraseMode(true);
              setSelectedColor(transparentColorData);
            }
          }}
          brushSize={manualBrushSize}
          onBrushSizeChange={setManualBrushSize}
          layers={pixelLayers}
          activeLayerId={activeLayerId}
          onLayerSelect={setActiveLayerId}
          onAddLayer={handleAddLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayer={handleDeleteLayer}
          onToggleLayerVisibility={handleToggleLayerVisibility}
          onToggleLayerLock={handleToggleLayerLock}
          selectedColor={selectedColor}
          selectedColorSystem={selectedColorSystem}
          currentGridColors={currentGridColors}
          fullPaletteColors={fullPaletteColors}
          showFullPalette={showFullPalette}
          onToggleFullPalette={handleToggleFullPalette}
          onColorSelect={handleColorSelect}
          onExitManualMode={() => {
            setIsManualColoringMode(false);
            setManualEditTool('brush');
            setManualShapeStart(null);
            setActiveSelection(null);
            setSelectionDragStart(null);
            setSelectionMoveState(null);
            setSelectedColor(null);
            setTooltipData(null);
            setIsEraseMode(false);
            setColorReplaceState({ isActive: false, step: 'select-source' });
            setHighlightColorKey(null);
            setIsMagnifierActive(false);
            setMagnifierSelectionArea(null);
            clearEditHistory();
          }}
          onCanvasTools={() => setIsCanvasToolsOpen(true)}
          onToggleMagnifier={handleToggleMagnifier}
          isMagnifierActive={isMagnifierActive}
          canUndo={editHistory.length > 0}
          onUndo={handleUndoEdit}
          gridDimensions={gridDimensions}
          totalBeadCount={totalBeadCount}
          projectName={currentProjectName}
          manualShapeStart={manualShapeStart}
          activeSelection={activeSelection}
          hasClipboard={Boolean(selectionClipboard)}
          onCopySelection={handleCopyActiveSelection}
          onCutSelection={handleCutActiveSelection}
          onDeleteSelection={handleDeleteActiveSelection}
          onPasteAtSelection={handlePasteAtSelection}
          onClearSelection={() => setActiveSelection(null)}
        />
      )}

      {/* 鎮诞宸ュ叿鏍?*/}
      <FloatingToolbar
        isManualColoringMode={false}
        isPaletteOpen={isFloatingPaletteOpen}
        onTogglePalette={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
        onExitManualMode={() => {
          setIsManualColoringMode(false);
          setManualEditTool('brush');
          setManualShapeStart(null);
          setActiveSelection(null);
          setSelectionDragStart(null);
          setSelectionMoveState(null);
          setSelectedColor(null);
          setTooltipData(null);
          setIsEraseMode(false);
          setColorReplaceState({
            isActive: false,
            step: 'select-source'
          });
          setHighlightColorKey(null);
          setIsMagnifierActive(false);
          setMagnifierSelectionArea(null);
          clearEditHistory();
        }}
        onToggleMagnifier={handleToggleMagnifier}
        isMagnifierActive={isMagnifierActive}
      />

      {/* 鎮诞璋冭壊鐩?*/}
      {false && isManualColoringMode && (
        <FloatingColorPalette
          colors={currentGridColors}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          selectedColorSystem={selectedColorSystem}
          isEraseMode={isEraseMode}
          onEraseToggle={handleEraseToggle}
          fullPaletteColors={fullPaletteColors}
          showFullPalette={showFullPalette}
          onToggleFullPalette={handleToggleFullPalette}
          colorReplaceState={colorReplaceState}
          onColorReplaceToggle={handleColorReplaceToggle}
          onColorReplace={handleColorReplace}
          onHighlightColor={handleHighlightColor}
          isOpen={isFloatingPaletteOpen}
          onToggleOpen={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
          isActive={activeFloatingTool === 'palette'}
          onActivate={handleActivatePalette}
          canUndo={editHistory.length > 0}
          onUndo={handleUndoEdit}
        />
      )}

      {/* 鏀惧ぇ闀滃伐鍏?*/}
      {isManualColoringMode && (
        <>
          <MagnifierTool
            isActive={isMagnifierActive}
            onToggle={handleToggleMagnifier}
            mappedPixelData={mappedPixelData}
            gridDimensions={gridDimensions}
            selectedColor={selectedColor}
            selectedColorSystem={selectedColorSystem}
            onPixelEdit={handleMagnifierPixelEdit}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            selectionArea={magnifierSelectionArea}
            onClearSelection={() => setMagnifierSelectionArea(null)}
            isFloatingActive={activeFloatingTool === 'magnifier'}
            onActivateFloating={handleActivateMagnifier}
            highlightColorKey={highlightColorKey}
          />
          
          {/* 鏀惧ぇ闀滈€夋嫨瑕嗙洊灞?*/}
          <MagnifierSelectionOverlay
            isActive={isMagnifierActive && !magnifierSelectionArea}
            canvasRef={pixelatedCanvasRef}
            gridDimensions={gridDimensions}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            onSelectionComplete={setMagnifierSelectionArea}
          />
        </>
      )}

      {!isManualColoringMode && (
        <footer className="w-full md:max-w-4xl mt-10 mb-6 py-6 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800/50 rounded-lg shadow-inner">
          <p className="font-medium text-gray-600 dark:text-gray-300">
            鎷艰眴搴曠鐢熸垚鍣?&copy; {new Date().getFullYear()}
          </p>
        </footer>
      )}

      {/* 浣跨敤瀵煎叆鐨勪笅杞借缃脊绐楃粍浠?*/}
      <DownloadSettingsModal 
        isOpen={isDownloadSettingsOpen}
        onClose={() => setIsDownloadSettingsOpen(false)}
        options={downloadOptions}
        onOptionsChange={setDownloadOptions}
        onDownload={handleDownloadRequest}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        totalBeadCount={totalBeadCount}
        selectedColorSystem={selectedColorSystem}
      />

      {/* 涓撳績鎷艰眴妯″紡杩涘叆鍓嶄笅杞芥彁閱掑脊绐?*/}
      <FocusModePreDownloadModal
        isOpen={isFocusModePreDownloadModalOpen}
        onClose={() => setIsFocusModePreDownloadModalOpen(false)}
        onProceedWithoutDownload={handleProceedToFocusMode}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        selectedColorSystem={selectedColorSystem}
      />

      <ProjectListModal
        open={isProjectsModalOpen}
        loading={isProjectsLoading}
        projects={projects}
        onClose={() => setIsProjectsModalOpen(false)}
        onRefresh={refreshProjects}
        onOpen={handleOpenProject}
        onRename={handleRenameProject}
        onDelete={handleDeleteProject}
      />

      <ConflictModal
        conflict={versionConflict}
        onLoadServer={() => {
          if (currentProjectId) {
            handleOpenProject(currentProjectId);
          }
        }}
        onOverwrite={() => persistProject({ force: true })}
        onSaveAs={() => persistProject({ saveAs: true })}
      />

      <ShareCodeModal
        open={isShareModalOpen}
        shareCode={shareCode}
        isGenerating={isShareCodeGenerating}
        canShare={Boolean(mappedPixelData && gridDimensions)}
        projectName={currentProjectName}
        initialPanel={shareModalInitialPanel}
        onClose={() => setIsShareModalOpen(false)}
        onGenerate={handleGenerateShareCode}
        onImport={handleImportShareCode}
      />

      <PreviewCardModal
        open={isPreviewModalOpen}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        totalBeadCount={totalBeadCount}
        projectName={currentProjectName}
        onClose={() => setIsPreviewModalOpen(false)}
      />

      <HistoryBackupModal
        open={isHistoryModalOpen}
        loading={isHistoryLoading}
        versions={projectVersions}
        backups={databaseBackups}
        currentVersion={currentProjectVersion}
        onClose={() => setIsHistoryModalOpen(false)}
        onRefresh={refreshHistoryAndBackups}
        onRestore={handleRestoreVersion}
        onCreateBackup={handleCreateBackup}
      />

      <ImageEditorModal
        open={isImageEditorOpen}
        imageSrc={originalImageSrc}
        onClose={() => setIsImageEditorOpen(false)}
        onApply={handleApplyEditedImage}
      />

      <CanvasToolsModal
        open={isCanvasToolsOpen}
        dimensions={gridDimensions}
        hasClipboard={Boolean(selectionClipboard)}
        onClose={() => setIsCanvasToolsOpen(false)}
        onResize={handleResizeCanvas}
        onCopy={handleCopySelection}
        onCut={handleCutSelection}
        onDelete={handleDeleteSelection}
        onPaste={handlePasteSelection}
      />

      {/* 杞婚噺鎻愮ず Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-[200] text-sm whitespace-nowrap"
             style={{ animation: 'toastFadeInOut 2s ease-in-out' }}>
          {toastMessage}
        </div>
      )}
    </div>
   </>
  );
}
