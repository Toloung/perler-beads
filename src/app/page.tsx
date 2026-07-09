'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo, useCallback } from 'react';
import Script from 'next/script';
import InstallPWA from '../components/InstallPWA';
import CanvasToolsModal from '../components/CanvasToolsModal';
import ImageEditorModal from '../components/ImageEditorModal';

// 导入像素化工具和类型
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

// 导入新的类型和组件
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

// 添加自定义动画样式
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

// Helper function for sorting color keys - 保留原有实现，因为未在utils中导出
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
// 从colorSystemMapping.json获取所有MARD色号
const mardToHexMapping = getMardToHexMapping();

// Pre-process the FULL palette data once - 使用colorSystemMapping而不是beadPaletteData
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 使用hex值作为key，符合新的架构设计
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

// 1. 导入新组件
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
  createPixelLayer,
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
  // 添加像素化模式状态
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.JettCartoon); // 默认使用 Jett Cartoon
  
  // 新增：色号系统选择状态
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');
  
  const [activeBeadPalette, setActiveBeadPalette] = useState<PaletteColor[]>(() => {
      return fullBeadPalette; // 默认使用全部颜色
  });
  // 状态变量：存储被排除的颜色（hex值）
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState<boolean>(false);
  // 用于记录初始网格颜色（hex值），用于显示排除功能
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
  // 新增：一键擦除模式状态
  const [isEraseMode, setIsEraseMode] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [isCustomPalette, setIsCustomPalette] = useState<boolean>(false);
  
  // ++ 新增：下载设置相关状态 ++
  const [isDownloadSettingsOpen, setIsDownloadSettingsOpen] = useState<boolean>(false);
  const [downloadOptions, setDownloadOptions] = useState<GridDownloadOptions>({
    downloadTarget: 'image',
    showGrid: true,
    gridInterval: 10,
    showCoordinates: true,
    showCellNumbers: true,
    gridLineColor: gridLineColorOptions[0].value,
    includeStats: true, // 默认包含统计信息
    exportCsv: false, // 默认不导出CSV
    outputScale: DEFAULT_DOWNLOAD_OUTPUT_SCALE,
    watermarkEnabled: true,
    watermarkText: '@拼豆',
    watermarkStyle: 'tile'
  });

  // 新增：高亮相关状态
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);

  // 新增：完整色板切换状态
  const [showFullPalette, setShowFullPalette] = useState<boolean>(false);
  
  // 新增：颜色替换相关状态
  const [colorReplaceState, setColorReplaceState] = useState<{
    isActive: boolean;
    step: 'select-source' | 'select-target';
    sourceColor?: { key: string; color: string };
  }>({
    isActive: false,
    step: 'select-source'
  });

  // 新增：组件挂载状态
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 新增：悬浮调色盘状态
  const [isFloatingPaletteOpen, setIsFloatingPaletteOpen] = useState<boolean>(true);

  // 新增：放大镜状态
  const [isMagnifierActive, setIsMagnifierActive] = useState<boolean>(false);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // 新增：活跃工具层级管理
  const [activeFloatingTool, setActiveFloatingTool] = useState<'palette' | 'magnifier' | null>(null);

  // 新增：专心拼豆模式进入前下载提醒弹窗
  const [isFocusModePreDownloadModalOpen, setIsFocusModePreDownloadModalOpen] = useState<boolean>(false);

  // 新增：横屏设备弹窗状态
  const [showDesktopModal, setShowDesktopModal] = useState<boolean>(false);

  // 新增：编辑撤回历史栈（多步）
  interface EditSnapshot {
    mappedPixelData: MappedPixel[][];
    pixelLayers?: PixelLayer[];
    activeLayerId?: string | null;
    colorCounts: { [key: string]: { count: number; color: string } };
    totalBeadCount: number;
  }
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([]);

  // 新增：一键去背景撤回快照（单步）
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 新增：轻量提示
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

  // 放大镜切换处理函数
  const handleToggleMagnifier = () => {
    const newActiveState = !isMagnifierActive;
    setIsMagnifierActive(newActiveState);
    
    // 如果关闭放大镜，清除选择区域，重新开始
    if (!newActiveState) {
      setMagnifierSelectionArea(null);
    }
  };

  // 激活工具处理函数
  const handleActivatePalette = () => {
    setActiveFloatingTool('palette');
  };

  const handleActivateMagnifier = () => {
    setActiveFloatingTool('magnifier');
  };

  // --- 撤回功能 ---

  // 保存编辑快照到历史栈
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

  // 编辑模式多步撤回
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

  // 一键去背景单步撤回
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

  // 清空编辑历史（参数变化、退出编辑模式等时调用）
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  // 放大镜像素编辑处理函数
  const handleMagnifierPixelEdit = (row: number, col: number, colorData: { key: string; color: string }) => {
    if (!mappedPixelData) return;
    const editPixelData = activePixelLayer?.data || mappedPixelData;

    const oldPixel = editPixelData[row][col];
    if (!oldPixel || oldPixel.key === colorData.key) return;

    // 创建新的像素数据
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

    // 更新颜色统计
    if (colorCounts) {
      const newColorCounts = { ...colorCounts };

      // 减少原颜色的计数
      if (newColorCounts[oldPixel.key]) {
        newColorCounts[oldPixel.key].count--;
        if (newColorCounts[oldPixel.key].count === 0) {
          delete newColorCounts[oldPixel.key];
        }
      }

      // 增加新颜色的计数
      if (newColorCounts[colorData.key]) {
        newColorCounts[colorData.key].count++;
      } else {
        newColorCounts[colorData.key] = {
          count: 1,
          color: colorData.color
        };
      }

      setColorCounts(newColorCounts);

      // 更新总计数
      const newTotal = Object.values(newColorCounts).reduce((sum, item) => sum + item.count, 0);
      setTotalBeadCount(newTotal);
    }
  };

  // 当前活跃图层
  const activePixelLayer = useMemo(() => {
    if (!activeLayerId || pixelLayers.length === 0) return null;
    return pixelLayers.find(layer => layer.id === activeLayerId) || null;
  }, [activeLayerId, pixelLayers]);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ++ 添加: Ref for import file input ++
  const importPaletteInputRef = useRef<HTMLInputElement>(null);
  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ Re-add touch refs needed for tooltip logic ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ Add a ref for the main element ++
  const mainRef = useRef<HTMLElement>(null);

  // --- 图层管理处理函数 ---
  const handleAddLayer = useCallback(() => {
    if (!mappedPixelData) return;
    const newLayer = createPixelLayer(`图层 ${pixelLayers.length + 1}`, mappedPixelData);
    setPixelLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [mappedPixelData, pixelLayers]);

  const handleDuplicateLayer = useCallback((layerId: string) => {
    const sourceLayer = pixelLayers.find(l => l.id === layerId);
    if (!sourceLayer) return;
    const newLayer = createPixelLayer(`${sourceLayer.name} 副本`, sourceLayer.data);
    setPixelLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [pixelLayers]);

  const handleDeleteLayer = useCallback((layerId: string) => {
    setPixelLayers(prev => {
      const filtered = prev.filter(l => l.id !== layerId);
      if (filtered.length === 0) return prev;
      return filtered;
    });
    setActiveLayerId(prev => prev === layerId ? (pixelLayers.length > 1 ? pixelLayers[0].id : null) : prev);
  }, [pixelLayers]);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setPixelLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ));
  }, []);

  const handleToggleLayerLock = useCallback((layerId: string) => {
    setPixelLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, locked: !l.locked } : l
    ));
  }, []);

  // --- Derived State ---

  // Update active palette based on selection and exclusions
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 根据选择的色号系统转换调色板
    const convertedPalette = convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem);
    setActiveBeadPalette(convertedPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // ++ 添加：当状态变化时同步更新输入框的值 ++
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, similarityThreshold]);

  // ++ Calculate unique colors currently on the grid for the palette ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // 使用hex值进行去重，避免多个MARD色号对应同一个目标色号系统值时产生重复key
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 存储hex值作为key，保持颜色信息
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 转换为数组并为每个hex值生成对应的色号系统显示
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 使用色相排序而不是色号排序
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  // 初始化时从本地存储加载自定义色板选择
  useEffect(() => {
    // 尝试从localStorage加载
    const savedSelections = loadPaletteSelections();
    if (savedSelections && Object.keys(savedSelections).length > 0) {
      console.log('从localStorage加载的数据键数量:', Object.keys(savedSelections).length);
      // 验证加载的数据是否都是有效的hex值
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      let hasValidData = false;
      let validCount = 0;
      let invalidCount = 0;
      
      Object.entries(savedSelections).forEach(([key, value]) => {
        // 严格验证：键必须是有效的hex格式，并且存在于调色板中
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
          hasValidData = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      console.log(`验证结果: 有效键 ${validCount} 个, 无效键 ${invalidCount} 个`);
      
      if (hasValidData) {
        setCustomPaletteSelections(validSelections);
    setIsCustomPalette(true);
    } else {
        console.log('所有数据都无效，清除localStorage并重新初始化');
        // 如果本地数据无效，清除localStorage并默认选择所有颜色
        localStorage.removeItem('customPerlerPaletteSelections');
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
    } else {
      console.log('没有localStorage数据，默认选择所有颜色');
      // 如果没有保存的选择，默认选择所有颜色
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
  }, []); // 只在组件首次加载时执行

  // 更新 activeBeadPalette 基于自定义选择和排除列表
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      // 使用hex值进行排除检查
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 不进行色号系统转换，保持原始的MARD色号和hex值
    setActiveBeadPalette(newActiveBeadPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger]);

  // --- Event Handlers ---

  // 专心拼豆模式相关处理函数
  const handleEnterFocusMode = () => {
    setIsFocusModePreDownloadModalOpen(true);
  };

  const handleProceedToFocusMode = () => {
    // 保存数据到localStorage供专心拼豆模式使用
    localStorage.setItem('focusMode_pixelData', JSON.stringify(mappedPixelData));
    localStorage.setItem('focusMode_gridDimensions', JSON.stringify(gridDimensions));
    localStorage.setItem('focusMode_colorCounts', JSON.stringify(colorCounts));
    localStorage.setItem('focusMode_selectedColorSystem', selectedColorSystem);
    
    // 跳转到专心拼豆页面
    window.location.href = '/focus';
  };

  // 添加一个安全的文件输入触发函数
  const triggerFileInput = useCallback(() => {
    // 检查组件是否已挂载
    if (!isMounted) {
      console.warn("组件尚未完全挂载，延迟触发文件选择");
      setTimeout(() => triggerFileInput(), 200);
      return;
    }
    
    // 检查 ref 是否存在
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
      } catch (error) {
        console.error("触发文件选择失败:", error);
        // 如果直接点击失败，尝试延迟执行
        setTimeout(() => {
          try {
            fileInputRef.current?.click();
          } catch (retryError) {
            console.error("重试触发文件选择失败:", retryError);
          }
        }, 100);
      }
    } else {
      // 如果 ref 不存在，延迟重试
      console.warn("文件输入引用不存在，将在100ms后重试");
      setTimeout(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.click();
          } catch (error) {
            console.error("延迟触发文件选择失败:", error);
          }
        }
      }, 100);
    }
  }, [isMounted]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 检查文件类型是否支持
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      
      // 支持的图片类型
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      // 支持的CSV MIME类型（不同浏览器可能返回不同的MIME类型）
      const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

      const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
      const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

      if (isImageFile || isCsvFile) {
        setExcludedColorKeys(new Set()); // ++ 重置排除列表 ++
        processFile(file);
      } else {
        alert(`不支持的文件类型: ${file.type || '未知'}。请选择 JPG、PNG、GIF 格式的图片文件，或 CSV 数据文件。\n文件名: ${file.name}`);
        console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
      }
    }
    // 重置文件输入框的值，这样用户可以重新选择同一个文件
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
        
        // 使用与handleFileChange相同的文件类型检查逻辑
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();
        
        // 支持的图片类型
        const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        // 支持的CSV MIME类型（不同浏览器可能返回不同的MIME类型）
        const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

        const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
        const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

        if (isImageFile || isCsvFile) {
          setExcludedColorKeys(new Set()); // ++ 重置排除列表 ++
          processFile(file);
        } else {
          alert(`不支持的文件类型: ${file.type || '未知'}。请拖放 JPG、PNG、GIF 格式的图片文件，或 CSV 数据文件。\n文件名: ${file.name}`);
          console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
        }
      }
    } catch (error) {
      console.error("处理拖拽文件时发生错误:", error);
      alert("处理文件时发生错误，请重试。");
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 根据mappedPixelData生成合成的originalImageSrc
  const generateSyntheticImageFromPixelData = (pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('无法创建canvas上下文');
      return '';
    }
    
    // 设置画布尺寸，每个像素用8x8像素来表示以确保清晰度
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 绘制每个像素
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          // 使用颜色，外部单元格用白色
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
    
    // 转换为dataURL
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
    const blankPixelData: MappedPixel[][] = Array.from({ length: M }, () =>
      Array.from({ length: N }, () => ({ ...transparentColorData }))
    );
    const dimensions = { N, M };

    skipNextPixelateRef.current = true;
    setCanvasSource('blank');
    setOriginalImageSrc(generateSyntheticImageFromPixelData(blankPixelData, dimensions));
    setMappedPixelData(blankPixelData);
    setGridDimensions(dimensions);
    setColorCounts({});
    setTotalBeadCount(0);
    setInitialGridColorKeys(new Set());
    setExcludedColorKeys(new Set());
    setGranularity(N);
    setGranularityInput(N.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
    setCurrentProjectId(null);
    setCurrentProjectName(`空白画布 ${N}x${M}`);
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
    showToast(`已创建空白画布 ${N}x${M}`);
  }, [getDefaultPaintColor, similarityThreshold, showToast]);

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
    setInitialGridColorKeys(new Set(state.initialGridColorKeys));
    setMappedPixelData(state.mappedPixelData);
    setGridDimensions(state.gridDimensions);
    setColorCounts(state.colorCounts);
    setTotalBeadCount(state.totalBeadCount);
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
      console.error('加载项目列表失败:', error);
      showToast('加载项目列表失败');
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
      console.error('加载历史与备份失败:', error);
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
    if (!window.confirm(`确定恢复到版本 ${version} 吗？当前状态会被保存为新的恢复版本。`)) return;

    try {
      const project = await restoreProjectVersionOnServer(currentProjectId, version);
      applyProject(project);
      refreshHistoryAndBackups();
      refreshProjects();
      showToast(`已恢复到版本 ${version}`);
    } catch (error) {
      console.error('恢复版本失败:', error);
      showToast('恢复版本失败');
    }
  }, [applyProject, currentProjectId, refreshHistoryAndBackups, refreshProjects, showToast]);

  const handleCreateBackup = useCallback(async () => {
    try {
      await createDatabaseBackupOnServer('manual');
      setDatabaseBackups(await fetchDatabaseBackups());
      showToast('服务器备份已创建');
    } catch (error) {
      console.error('创建备份失败:', error);
      showToast('创建备份失败');
    }
  }, [showToast]);

  const persistProject = useCallback(async (options?: { saveAs?: boolean; force?: boolean }) => {
    if (!mappedPixelData || !gridDimensions) {
      showToast('请先生成拼豆图纸');
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

      console.error('保存项目失败:', error);
      setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      showToast('保存失败，请手动重试');
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
      showToast('项目已打开');
    } catch (error) {
      console.error('打开项目失败:', error);
      showToast('打开项目失败');
    }
  }, [applyProject, hasUnsavedChanges, showToast]);

  const handleRenameProject = useCallback(async (project: ProjectSummary) => {
    const name = window.prompt('输入新的项目名称', project.name);
    if (!name) return;

    try {
      const renamed = await renameProjectOnServer(project.id, name);
      if (project.id === currentProjectId) {
        setCurrentProjectName(renamed.name);
      }
      refreshProjects();
      showToast('项目已重命名');
    } catch (error) {
      console.error('重命名项目失败:', error);
      showToast('重命名失败');
    }
  }, [currentProjectId, refreshProjects, showToast]);

  const handleDeleteProject = useCallback(async (project: ProjectSummary) => {
    if (!window.confirm(`确定删除“${project.name}”吗？`)) return;

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
      console.error('删除项目失败:', error);
      showToast('删除失败');
    }
  }, [currentProjectId, refreshProjects, showToast]);

  const handleGenerateShareCode = useCallback(async (options: ShareGenerateOptions) => {
    if (!mappedPixelData || !gridDimensions) {
      showToast('请先生成拼豆图纸');
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
      showToast('分享码已生成');
    } catch (error) {
      console.error('生成分享码失败:', error);
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
        name: `${sharedProject.name || '分享作品'} 副本`,
        version: 0,
      });
      setSaveStatus('dirty');
      setHasUnsavedChanges(true);
      setIsShareModalOpen(false);
      showToast('分享码已导入');
    } catch (error) {
      console.error('导入分享码失败:', error);
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
    const stats = recalculateGridStats(nextPixelData);
    setMappedPixelData(nextPixelData);
    if (nextDimensions) {
      setGridDimensions(nextDimensions);
      setGranularity(nextDimensions.N);
      setGranularityInput(nextDimensions.N.toString());
    }
    setColorCounts(stats.colorCounts);
    setTotalBeadCount(stats.totalBeadCount);
    setInitialGridColorKeys(stats.initialGridColorKeys);
    setSaveStatus('dirty');
    setHasUnsavedChanges(true);
  }, [saveEditSnapshot]);

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

    applyGridEdit(resizeGrid(mappedPixelData, gridDimensions, nextDimensions, anchor), nextDimensions);
    showToast(`画布尺寸已调整为 ${nextDimensions.N}x${nextDimensions.M}`);
  }, [mappedPixelData, gridDimensions, applyGridEdit, showToast]);

  const handleCopySelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    const normalized = normalizeSelection(selection, gridDimensions);
    setSelectionClipboard(copySelection(mappedPixelData, normalized));
    setActiveSelection(normalized);
    showToast('选区已复制');
  }, [mappedPixelData, gridDimensions, showToast]);

  const handleCutSelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    const normalized = normalizeSelection(selection, gridDimensions);
    setSelectionClipboard(copySelection(mappedPixelData, normalized));
    applyGridEdit(clearSelection(mappedPixelData, normalized));
    setActiveSelection(null);
    showToast('选区已剪切');
  }, [mappedPixelData, gridDimensions, applyGridEdit, showToast]);

  const handleDeleteSelection = useCallback((selection: GridSelection) => {
    if (!mappedPixelData || !gridDimensions) return;
    applyGridEdit(clearSelection(mappedPixelData, normalizeSelection(selection, gridDimensions)));
    setActiveSelection(null);
    showToast('选区已删除');
  }, [mappedPixelData, gridDimensions, applyGridEdit, showToast]);

  const handlePasteSelection = useCallback((row: number, col: number) => {
    if (!mappedPixelData || !gridDimensions || !selectionClipboard) return;
    applyGridEdit(pasteClipboard(mappedPixelData, gridDimensions, selectionClipboard, row, col));
    setActiveSelection({
      startRow: row,
      startCol: col,
      endRow: Math.min(gridDimensions.M - 1, row + selectionClipboard.length - 1),
      endCol: Math.min(gridDimensions.N - 1, col + (selectionClipboard[0]?.length || 1) - 1),
    });
    showToast('选区已粘贴');
  }, [mappedPixelData, gridDimensions, selectionClipboard, applyGridEdit, showToast]);

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
    setSelectionClipboard(copySelection(mappedPixelData, selection));
    showToast('选区已复制');
  }, [getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handleCutActiveSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData) return;
    setSelectionClipboard(copySelection(mappedPixelData, selection));
    applyGridEdit(clearSelection(mappedPixelData, selection));
    setActiveSelection(null);
    showToast('选区已剪切');
  }, [applyGridEdit, getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handleDeleteActiveSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData) return;
    applyGridEdit(clearSelection(mappedPixelData, selection));
    setActiveSelection(null);
    showToast('选区已删除');
  }, [applyGridEdit, getNormalizedActiveSelection, mappedPixelData, showToast]);

  const handlePasteAtSelection = useCallback(() => {
    const selection = getNormalizedActiveSelection();
    if (!selection || !mappedPixelData || !gridDimensions || !selectionClipboard) return;
    applyGridEdit(pasteClipboard(mappedPixelData, gridDimensions, selectionClipboard, selection.startRow, selection.startCol));
    showToast('已粘贴到选区起点');
  }, [applyGridEdit, getNormalizedActiveSelection, gridDimensions, mappedPixelData, selectionClipboard, showToast]);

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
            showToast('当前项目已在其他设备删除');
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
            showToast('其他设备有新修改，请处理版本冲突');
            return;
          }

          const project = await fetchProject(event.projectId);
          applyProject(project);
          showToast('已实时同步其他设备的修改');
        } catch (error) {
          console.warn('处理实时同步事件失败:', error);
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
    // 检查文件类型
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      // 处理CSV文件
      console.log('正在导入CSV文件...');
      importCsvData(file)
        .then(({ mappedPixelData, gridDimensions }) => {
          console.log(`成功导入CSV文件: ${gridDimensions.N}x${gridDimensions.M}`);
          
          // 设置导入的数据
          setCanvasSource('csv');
          setMappedPixelData(mappedPixelData);
          setGridDimensions(gridDimensions);
          setOriginalImageSrc(null); // CSV导入时没有原始图片
          
          // 计算颜色统计
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
          
          // 根据mappedPixelData生成合成的originalImageSrc
          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          
          skipNextPixelateRef.current = true;
          setOriginalImageSrc(syntheticImageSrc);
          
          // 重置状态
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setIsEraseMode(false);
          
          // 设置格子数量为导入的尺寸，避免重新映射时尺寸被修改
          setGranularity(gridDimensions.N);
          setGranularityInput(gridDimensions.N.toString());
          
          alert(`成功导入CSV文件！图纸尺寸：${gridDimensions.N}x${gridDimensions.M}，共使用${Object.keys(colorCountsMap).length}种颜色。`);
        })
        .catch(error => {
          console.error('CSV导入失败:', error);
          alert(`CSV导入失败：${error.message}`);
        });
    } else {
      // 处理图片文件
      const applyImageSrc = (result: string) => {
        setCanvasSource('image');
        setOriginalImageSrc(result);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setTotalBeadCount(0);
        setInitialGridColorKeys(new Set()); // ++ 重置初始键 ++
        setActiveSelection(null);
        setSelectionDragStart(null);
        setSelectionMoveState(null);
        setSelectionClipboard(null);
        // ++ 重置横轴格子数量为默认值 ++
        const defaultGranularity = 100;
        setGranularity(defaultGranularity);
        setGranularityInput(defaultGranularity.toString());
        setRemapTrigger(prev => prev + 1); // Trigger full remap for new image
      };

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      if (isGif) {
        // GIF 走 createImageBitmap，规范保证返回首帧（default image），再烘焙为 PNG dataURL
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
            console.error('GIF 处理失败:', error);
            alert('无法读取 GIF 文件。');
            setInitialGridColorKeys(new Set());
          });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          applyImageSrc(e.target?.result as string);
        };
        reader.onerror = () => {
          console.error("文件读取失败");
          alert("无法读取文件。");
          setInitialGridColorKeys(new Set()); // ++ 重置初始键 ++
        };
        reader.readAsDataURL(file);
      }
      // ++ Reset manual coloring mode when a new file is processed ++
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setIsEraseMode(false);
    }
  };

  // 处理一键擦除模式切换
  const handleEraseToggle = () => {
    // 确保在手动上色模式下才能使用擦除功能
    if (!isManualColoringMode) {
      return;
    }
    
    // 如果当前在颜色替换模式，先退出替换模式
    if (colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    setIsEraseMode(!isEraseMode);
    // 如果开启擦除模式，取消选中的颜色
    if (!isEraseMode) {
      setSelectedColor(null);
      setManualShapeStart(null);
    }
  };

  // ++ 新增：处理输入框变化的函数 ++
  const handleGranularityInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGranularityInput(event.target.value);
  };

  // ++ 添加：处理相似度输入框变化的函数 ++
  const handleSimilarityThresholdInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSimilarityThresholdInput(event.target.value);
  };

  // ++ 修改：处理确认按钮点击的函数，同时处理两个参数 ++
  const handleConfirmParameters = () => {
    // 处理格子数
    const minGranularity = 10;
    const maxGranularity = 300;
    let newGranularity = parseInt(granularityInput, 10);

    if (isNaN(newGranularity) || newGranularity < minGranularity) {
      newGranularity = minGranularity;
    } else if (newGranularity > maxGranularity) {
      newGranularity = maxGranularity;
    }

    // 处理相似度阈值
    const minSimilarity = 0;
    const maxSimilarity = 100;
    let newSimilarity = parseInt(similarityThresholdInput, 10);
    
    if (isNaN(newSimilarity) || newSimilarity < minSimilarity) {
      newSimilarity = minSimilarity;
    } else if (newSimilarity > maxSimilarity) {
      newSimilarity = maxSimilarity;
    }

    // 检查值是否有变化
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
    
    // 只有在有值变化时才触发重映射
    if (granularityChanged || similarityChanged) {
      setRemapTrigger(prev => prev + 1);
      // 退出手动上色模式
      setIsManualColoringMode(false);
      setSelectedColor(null);
    }

    // 始终同步输入框的值
    setGranularityInput(newGranularity.toString());
    setSimilarityThresholdInput(newSimilarity.toString());
  };

  // 添加像素化模式切换处理函数
  const handlePixelationModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as PixelationMode;
    if (Object.values(PixelationMode).includes(newMode)) {
        setPixelationMode(newMode);
        setRemapTrigger(prev => prev + 1); // 触发重新映射
        setIsManualColoringMode(false); // 退出手动模式
        setSelectedColor(null);
    } else {
        console.warn(`无效的像素化模式: ${newMode}`);
    }
  };

  // 修改pixelateImage函数接收模式参数
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
        alert("错误：当前可用颜色板为空（可能所有颜色都被排除了），无法处理图像。请尝试恢复部分颜色。");
        // Clear previous results visually
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts potentially showing the last valid counts? Or clear them too?
        // setColorCounts(null); // Decide if clearing counts is desired when palette is empty
        // setTotalBeadCount(0);
        return; // Stop processing
    }
    const t1FallbackColor = currentPalette.find(p => p.key === 'T1')
                         || currentPalette.find(p => p.hex.toUpperCase() === '#FFFFFF')
                         || currentPalette[0]; // 使用第一个可用颜色作为备用
    console.log("Using fallback color for empty cells:", t1FallbackColor);

    const img = new window.Image();
    
    img.onerror = (error: Event | string) => {
      console.error("Image loading failed:", error); 
      alert("无法加载图片。");
      setOriginalImageSrc(null); 
      setMappedPixelData(null); 
      setGridDimensions(null); 
      setColorCounts(null); 
      setInitialGridColorKeys(new Set());
    };
    
    img.onload = () => {
      console.log("Image loaded successfully.");
      const aspectRatio = img.height / img.width;
      const N = detailLevel;
      const M = Math.max(1, Math.round(N * aspectRatio));
      if (N <= 0 || M <= 0) { console.error("Invalid grid dimensions:", { N, M }); return; }
      console.log(`Grid size: ${N}x${M}`);

      // 动态调整画布尺寸：当格子数量大于100时，增加画布尺寸以保持每个格子的可见性
      const baseWidth = 500;
      const minCellSize = 4; // 每个格子的最小尺寸（像素）
      const recommendedCellSize = 6; // 推荐的格子尺寸（像素）
      
      let outputWidth = baseWidth;
      
      // 如果格子数量大于100，计算需要的画布宽度
      if (N > 100) {
        const requiredWidthForMinSize = N * minCellSize;
        const requiredWidthForRecommendedSize = N * recommendedCellSize;
        
        // 使用推荐尺寸，但不超过屏幕宽度的90%（最大1200px）
        const maxWidth = Math.min(1200, window.innerWidth * 0.9);
        outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
        
        // 确保不小于最小要求
        outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
        
        console.log(`Large grid detected (${N} columns). Adjusted canvas width from ${baseWidth} to ${outputWidth}px (cell size: ${Math.round(outputWidth / N)}px)`);
      }
      
      const outputHeight = Math.round(outputWidth * aspectRatio);
      
      // 在控制台提示用户画布尺寸变化
      if (N > 100) {
        console.log(`💡 由于格子数量较多 (${N}x${M})，画布已自动放大以保持清晰度。可以使用水平滚动查看完整图像。`);
      }
      originalCanvas.width = img.width; originalCanvas.height = img.height;
      pixelatedCanvas.width = outputWidth; pixelatedCanvas.height = outputHeight;
      console.log(`Canvas dimensions: Original ${img.width}x${img.height}, Output ${outputWidth}x${outputHeight}`);

      originalCtx.drawImage(img, 0, 0, img.width, img.height);
      console.log("Original image drawn.");

      // 1. 使用calculatePixelGrid进行初始颜色映射
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

      // --- 新的全局颜色合并逻辑 ---
      const keyToRgbMap = new Map<string, RgbColor>();
      const keyToColorDataMap = new Map<string, PaletteColor>();
      currentPalette.forEach(p => {
        keyToRgbMap.set(p.key, p.rgb);
        keyToColorDataMap.set(p.key, p);
      });

      // 2. 统计初始颜色数量
      const initialColorCounts: { [key: string]: number } = {};
      initialMappedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
              initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
          }
      });
      console.log("Initial color counts:", initialColorCounts);

      // 3. 创建一个颜色排序列表，按出现频率从高到低排序
      const colorsByFrequency = Object.entries(initialColorCounts)
          .sort((a, b) => b[1] - a[1])  // 按频率降序排序
          .map(entry => entry[0]);      // 只保留颜色键
      
      if (colorsByFrequency.length === 0) {
          console.log("No non-background colors found! Skipping merging.");
      }

      console.log("Colors sorted by frequency:", colorsByFrequency);
      
      // 4. 复制初始数据，准备合并
      const mergedData: MappedPixel[][] = initialMappedData.map(row => 
          row.map(cell => ({ ...cell, isExternal: cell.isExternal ?? false }))
      );
      
      // 5. 处理相似颜色合并
      const similarityThresholdValue = threshold;
      
      // 已被合并（替换）的颜色集合
      const replacedColors = new Set<string>();
      
      // 对每个颜色按频率从高到低处理
      if (!isJettMode(mode)) for (let i = 0; i < colorsByFrequency.length; i++) {
          const currentKey = colorsByFrequency[i];
          
          // 如果当前颜色已经被合并到更频繁的颜色中，跳过
          if (replacedColors.has(currentKey)) continue;
          
          const currentRgb = keyToRgbMap.get(currentKey);
          if (!currentRgb) {
              console.warn(`RGB not found for key ${currentKey}. Skipping.`);
              continue;
          }
          
          // 检查剩余的低频颜色
          for (let j = i + 1; j < colorsByFrequency.length; j++) {
              const lowerFreqKey = colorsByFrequency[j];
              
              // 如果低频颜色已被替换，跳过
              if (replacedColors.has(lowerFreqKey)) continue;
              
              const lowerFreqRgb = keyToRgbMap.get(lowerFreqKey);
              if (!lowerFreqRgb) {
                  console.warn(`RGB not found for key ${lowerFreqKey}. Skipping.`);
                  continue;
              }
              
              // 计算颜色距离
              const dist = colorDistance(currentRgb, lowerFreqRgb);
              
              // 如果距离小于阈值，将低频颜色替换为高频颜色
              if (dist < similarityThresholdValue) {
                  console.log(`Merging color ${lowerFreqKey} into ${currentKey} (Distance: ${dist.toFixed(2)})`);
                  
                  // 标记这个颜色已被替换
                  replacedColors.add(lowerFreqKey);
                  
                  // 替换所有使用这个低频颜色的单元格
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
      // --- 结束新的全局颜色合并逻辑 ---

      // --- 绘制和状态更新 ---
      if (pixelatedCanvasRef.current) {
        setMappedPixelData(mergedData);
        setGridDimensions({ N, M });

        const counts: { [key: string]: { count: number; color: string } } = {};
        let totalCount = 0;
        mergedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal) {
            // 使用hex值作为统计键值，而不是色号
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
    }; // 正确闭合 img.onload 函数
    
    console.log("Setting image source...");
    img.src = imageSrc;
    setIsManualColoringMode(false);
    setActiveSelection(null);
    setSelectionDragStart(null);
    setSelectionMoveState(null);
    setSelectedColor(null);
  }; // 正确闭合 pixelateImage 函数

  // 当 remapTrigger 变化时清空撤回历史（参数调整/颜色排除/新图上传等均会触发 remap）
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger]);

  // 修改useEffect中的pixelateImage调用，加入模式参数
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
            pixelatedCtx.fillText('无可用颜色，请恢复部分排除的颜色', pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts to allow user to un-exclude colors
        // setColorCounts(null);
        // setTotalBeadCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSource, originalImageSrc, granularity, similarityThreshold, customPaletteSelections, pixelationMode, remapTrigger]);

  // 确保文件输入框引用在组件挂载后正确设置
  useEffect(() => {
    // 延迟执行，确保DOM完全渲染
    const timer = setTimeout(() => {
      if (!fileInputRef.current) {
        console.warn("文件输入框引用在组件挂载后仍为null，这可能会导致上传功能异常");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 设置组件挂载状态
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 强制显示专业工作台弹窗（每次进入页面都弹，引导用户前往新版）
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SHOW_DESKTOP_MODAL === 'true') {
      setShowDesktopModal(true);
    }
  }, []);

  // 添加URL重定向检查
  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;
      const targetDomain = process.env.NEXT_PUBLIC_CANONICAL_URL;

      if (!targetDomain) {
        return;
      }
      
      // 排除localhost和127.0.0.1等本地开发环境
      const isLocalhost = currentHostname === 'localhost' || 
                         currentHostname === '127.0.0.1' || 
                         currentHostname.startsWith('192.168.') ||
                         currentHostname.startsWith('10.') ||
                         currentHostname.endsWith('.local');
      
      // 检查当前URL是否不是目标域名，且不是本地开发环境
      if (!currentUrl.startsWith(targetDomain) && !isLocalhost) {
        console.log(`当前URL: ${currentUrl}`);
        console.log(`目标URL: ${targetDomain}`);
        console.log('正在重定向到官方域名...');
        
        // 保留当前路径和查询参数
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const currentHash = window.location.hash;
        
        // 构建完整的目标URL
        let redirectUrl = targetDomain;
        
        // 如果不是根路径，添加路径
        if (currentPath && currentPath !== '/') {
          redirectUrl = redirectUrl.replace(/\/$/, '') + currentPath;
        }
        
        // 添加查询参数和哈希
        redirectUrl += currentSearch + currentHash;
        
        // 执行重定向
        window.location.replace(redirectUrl);
      } else if (isLocalhost) {
        console.log(`检测到本地开发环境 (${currentHostname})，跳过重定向`);
      }
    }
  }, []); // 只在组件首次挂载时执行

    // --- Download function (ensure filename includes palette) ---
    const handleDownloadRequest = (options?: GridDownloadOptions) => {
        // 调用移动到utils/imageDownloader.ts中的downloadImage函数
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

            // --- 确保初始颜色键已记录 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert("无法排除颜色，初始颜色数据尚未准备好，请稍候。");
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 使用初始颜色键进行重映射目标逻辑 ---
            // 1. 从初始网格颜色集合开始（hex值）
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 移除当前要排除的hex键
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 移除任何*其他*当前也被排除的hex键
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 基于剩余的hex值创建重映射调色板
            const remapTargetPalette = fullBeadPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 关键检查 ***：如果在考虑所有排除项后，没有*初始*颜色可供映射，则阻止此次排除
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert(`无法排除颜色 ${hexKey}，因为图中最初存在的其他可用颜色也已被排除。请先恢复部分其他颜色。`);
                console.log("---------");
                return; // 停止排除过程
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 查找被排除颜色的RGB值用于重映射
            const excludedColorData = fullBeadPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 检查排除颜色的数据是否存在
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert("无法排除颜色，缺少必要数据。");
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 仅在需要重映射时创建深拷贝
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 此条件正确地仅针对具有排除hex值的单元格
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 使用派生的 remapTargetPalette 查找最接近的颜色 ***
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

            // 同时更新状态
            setExcludedColorKeys(nextExcludedKeys); // 应用此颜色的排除
            setMappedPixelData(newMappedData); // 使用重映射的数据更新

            // 基于*新*映射数据重新计算计数（以hex为键）
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

            // ++ 在更新状态后，重新绘制 Canvas ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              setMappedPixelData(newMappedData);
              // 不要调用 setGridDimensions，因为颜色排除不需要改变网格尺寸
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
            // 此处无需重置 initialGridColorKeys，完全重映射会通过 pixelateImage 重新计算它
            setRemapTrigger(prev => prev + 1); // *** KEPT setRemapTrigger here for re-inclusion ***
            console.log("---------");
        }
        // ++ Exit manual mode if colors are excluded/included ++
        setIsManualColoringMode(false);
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

  // 一键去背景：识别边缘主色并洪水填充去除
  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert('请先生成图纸后再使用一键去背景。');
      return;
    }

    // 保存快照用于单步撤回
    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    // 去背景会大幅改变数据，清空编辑撤回历史
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

    setMappedPixelData(newPixelData);

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

  // 洪水填充擦除函数
  const floodFillErase = (startRow: number, startCol: number, targetKey: string) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    
    // 使用栈实现非递归洪水填充
    const stack = [{ row: startRow, col: startCol }];
    
    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      
      // 检查边界
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        continue;
      }
      
      const currentCell = newPixelData[row][col];
      
      // 检查是否是目标颜色且不是外部区域
      if (!currentCell || currentCell.isExternal || currentCell.key !== targetKey) {
        continue;
      }
      
      // 标记为已访问
      visited[row][col] = true;
      
      // 擦除当前像素（设为透明）
      newPixelData[row][col] = { ...transparentColorData };
      
      // 添加相邻像素到栈中
      stack.push(
        { row: row - 1, col }, // 上
        { row: row + 1, col }, // 下
        { row, col: col - 1 }, // 左
        { row, col: col + 1 }  // 右
      );
    }
    
    // 更新状态
    saveEditSnapshot();
    setMappedPixelData(newPixelData);

    // 重新计算颜色统计
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

  const handleManualCanvasEdit = useCallback((row: number, col: number) => {
    if (!mappedPixelData || !gridDimensions) return;

    if (manualEditTool === 'pan' || manualEditTool === 'select' || manualEditTool === 'move' || manualEditTool === 'paste') {
      return;
    }

    const currentCell = mappedPixelData[row]?.[col];

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
      showToast('请先选择颜色');
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

        const candidate = mappedPixelData[current.row]?.[current.col];
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

      const nextData = paintCells(mappedPixelData, cells, paintCell);
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
      const nextData = paintCells(mappedPixelData, cells, paintCell);
      if (nextData) {
        applyGridEdit(nextData);
      }
      setManualShapeStart(null);
      setTooltipData(null);
      return;
    }

    const nextData = paintCells(mappedPixelData, [{ row, col }], paintCell);
    if (nextData) {
      applyGridEdit(nextData);
    }
    setTooltipData(null);
  }, [
    applyGridEdit,
    getPaintCellForTool,
    gridDimensions,
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
          clipboard: copySelection(mappedPixelData, selection),
          baseData: clearSelection(mappedPixelData, selection),
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
      applyGridEdit(pasteClipboard(mappedPixelData, gridDimensions, selectionClipboard, row, col));
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
    // 如果是触摸结束或鼠标离开事件，隐藏提示
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

      // 颜色替换模式逻辑 - 选择源颜色
      if (isClick && colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行选择源颜色
          handleCanvasColorSelect({
            key: cellData.key,
            color: cellData.color
          });
          setTooltipData(null);
        }
        return;
      }

      // 一键擦除模式逻辑
      if (isClick && isEraseMode) {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行洪水填充擦除
          floodFillErase(j, i, cellData.key);
          setIsEraseMode(false); // 擦除完成后退出擦除模式
          setTooltipData(null);
        }
        return;
      }

      // Manual Coloring Logic - 保持原有的上色逻辑
      if (isClick && isManualColoringMode && selectedColor) {
        // 手动上色模式逻辑保持不变
        // ...现有代码...
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
          saveEditSnapshot();
          newPixelData[j][i] = newCellData;
          setMappedPixelData(newPixelData);

          // Update color counts
          if (colorCounts) {
            const newColorCounts = { ...colorCounts };
            let newTotalCount = totalBeadCount;

            // 处理之前颜色的减少（使用hex值）
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

            // 处理新颜色的增加（使用hex值）
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
        
        // 上色操作后隐藏提示
        setTooltipData(null);
      }
      // Tooltip Logic (非手动上色模式点击或悬停)
      else if (!isManualColoringMode) {
        // 只有单元格实际有内容（非背景/外部区域）才会显示提示
        if (cellData && !cellData.isExternal && cellData.key) {
          // 检查是否已经显示了提示框，并且是否点击的是同一个位置
          // 对于移动设备，位置可能有细微偏差，所以我们检查单元格索引而不是具体坐标
          if (tooltipData) {
            // 如果已经有提示框，计算当前提示框对应的格子的索引
            const tooltipRect = canvas.getBoundingClientRect();
            
            // 还原提示框位置为相对于canvas的坐标
            const prevX = tooltipData.x; // 页面X坐标
            const prevY = tooltipData.y; // 页面Y坐标
            
            // 转换为相对于canvas的坐标
            const prevCanvasX = (prevX - tooltipRect.left) * scaleX;
            const prevCanvasY = (prevY - tooltipRect.top) * scaleY;
            
            // 计算之前显示提示框位置对应的网格索引
            const prevCellI = Math.floor(prevCanvasX / cellWidthOutput);
            const prevCellJ = Math.floor(prevCanvasY / cellHeightOutput);
            
            // 如果点击的是同一个格子，则切换tooltip的显示/隐藏状态
            if (i === prevCellI && j === prevCellJ) {
              setTooltipData(null); // 隐藏提示
              return;
            }
          }
          
          // 计算相对于main元素的位置
          const mainElement = mainRef.current;
          if (mainElement) {
            const mainRect = mainElement.getBoundingClientRect();
            // 计算相对于main元素的坐标
            const relativeX = pageX - mainRect.left - window.scrollX;
            const relativeY = pageY - mainRect.top - window.scrollY;
            
            // 如果是移动/悬停到一个新的有效格子，或者点击了不同的格子，则显示提示
            setTooltipData({
              x: relativeX,
              y: relativeY,
              key: cellData.key,
              color: cellData.color,
            });
          } else {
            // 如果没有找到main元素，使用原始坐标
            setTooltipData({
              x: pageX,
              y: pageY,
              key: cellData.key,
              color: cellData.color,
            });
          }
        } else {
          // 如果点击/悬停在外部区域或背景上，隐藏提示
          setTooltipData(null);
        }
      }
    } else {
      // 如果点击/悬停在画布外部，隐藏提示
      setTooltipData(null);
    }
  };

  // 处理自定义色板中单个颜色的选择变化
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 保存自定义色板并应用
  const handleSaveCustomPalette = () => {
    savePaletteSelections(customPaletteSelections);
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 触发图像重新处理
    setRemapTrigger(prev => prev + 1);
    // 退出手动上色模式
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 新增：导出自定义色板配置 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert("当前没有选中的颜色，无法导出。");
      return;
    }

    // 导出格式：仅基于hex值
    const exportData = {
      version: "3.0", // 新版本号
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

  // ++ 新增：处理导入的色板文件 ++
  const handleImportPaletteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 检查文件格式
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error("无效的文件格式：文件必须包含 'selectedHexValues' 数组。");
        }

        console.log("检测到基于hex值的色板文件");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // 验证hex值
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
          console.warn("导入时发现无效的hex值:", invalidHexValues);
          alert(`导入完成，但以下颜色无效已被忽略：\n${invalidHexValues.join(', ')}`);
        }

        if (validHexValues.length === 0) {
          alert("导入的文件中不包含任何有效的颜色。");
          return;
        }

        console.log(`成功验证 ${validHexValues.length} 个有效的hex值`);

        // 基于有效的hex值创建新的selections对象
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 标记为自定义
        alert(`成功导入 ${validHexValues.length} 个颜色！`);

      } catch (error) {
        console.error("导入色板配置失败:", error);
        alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        // 重置文件输入，以便可以再次导入相同的文件
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.onerror = () => {
      alert("读取文件失败。");
       // 重置文件输入
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ++ 新增：触发导入文件选择 ++
  const triggerImportPalette = () => {
    importPaletteInputRef.current?.click();
  };

  // 新增：处理颜色高亮
  const handleHighlightColor = (colorHex: string) => {
    setHighlightColorKey(colorHex);
  };

  // 新增：高亮完成回调
  const handleHighlightComplete = () => {
    setHighlightColorKey(null);
  };

  // 新增：切换完整色板显示
  const handleToggleFullPalette = () => {
    setShowFullPalette(!showFullPalette);
  };

  // 新增：处理颜色选择，同时管理模式切换
  const handleColorSelect = (colorData: { key: string; color: string; isExternal?: boolean }) => {
    // 如果选择的是橡皮擦（透明色）且当前在颜色替换模式，退出替换模式
    if (colorData.key === TRANSPARENT_KEY && colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    // 选择任何颜色（包括橡皮擦）时，都应该退出一键擦除模式
    if (isEraseMode) {
      setIsEraseMode(false);
    }
    
    // 设置选中的颜色
    setSelectedColor(colorData);
    setManualEditTool(colorData.key === TRANSPARENT_KEY ? 'eraser' : 'brush');
    setManualShapeStart(null);
  };

  // 新增：颜色替换相关处理函数
  const handleColorReplaceToggle = () => {
    setColorReplaceState(prev => {
      if (prev.isActive) {
        // 退出替换模式
        return {
          isActive: false,
          step: 'select-source'
        };
      } else {
        // 进入替换模式
        // 只退出冲突的模式，但保持在手动上色模式下
        setIsEraseMode(false);
        setSelectedColor(null);
        return {
          isActive: true,
          step: 'select-source'
        };
      }
    });
  };

  // 新增：处理从画布选择源颜色
  const handleCanvasColorSelect = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
      // 高亮显示选中的颜色
      setHighlightColorKey(colorData.color);
      // 进入第二步：选择目标颜色
      setColorReplaceState({
        isActive: true,
        step: 'select-target',
        sourceColor: colorData
      });
    }
  };

  // 新增：执行颜色替换
  const handleColorReplace = (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    let replaceCount = 0;

    // 遍历所有像素，替换匹配的颜色
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const currentCell = newPixelData[j][i];
        if (currentCell && !currentCell.isExternal && 
            currentCell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
          // 替换颜色
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
      // 更新像素数据
      saveEditSnapshot();
      setMappedPixelData(newPixelData);

      // 重新计算颜色统计
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

      console.log(`颜色替换完成：将 ${replaceCount} 个 ${sourceColor.key} 替换为 ${targetColor.key}`);
    }

    // 退出替换模式
    setColorReplaceState({
      isActive: false,
      step: 'select-source'
    });
    
    // 清除高亮
    setHighlightColorKey(null);
  };

  // 生成完整色板数据（用户自定义色板中选中的所有颜色）
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 根据选择的色号系统获取显示的色号
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 使用色相排序而不是色号排序
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
    {/* 添加自定义动画样式 */}
    <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
    <style dangerouslySetInnerHTML={{ __html: '@keyframes toastFadeInOut{0%{opacity:0;transform:translate(-50%,10px)}15%{opacity:1;transform:translate(-50%,0)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}' }} />
    
    {/* PWA 安装按钮 */}
    <InstallPWA />
    
    {/* ++ 修改：添加 onLoad 回调函数 ++ */}
    <Script
      async
      src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"
      strategy="lazyOnload"
      onLoad={() => {
        const basePV = 378536; // ++ 预设 PV 基数 ++
        const baseUV = 257864; // ++ 预设 UV 基数 ++

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
                  observer.disconnect(); // ++ 更新后停止观察 ++ 
                  // console.log(`Updated ${spanId} from ${currentValueText} to ${targetNode.textContent}`);
                  break; // 处理完第一个有效更新即可
                }
              }
            }
          });

          observer.observe(targetNode, { childList: true, characterData: true, subtree: true });

          // ++ 处理初始值已经是数字的情况 (如果脚本加载很快) ++
          const initialValueText = targetNode.textContent?.trim() || '0';
          if (initialValueText !== '...') {
             const initialValue = parseInt(initialValueText.replace(/,/g, ''), 10) || 0;
             targetNode.textContent = (initialValue + baseValue).toLocaleString();
             observer.disconnect(); // 已更新，无需再观察
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
          <button type="button" className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg active:opacity-70" title="回到工作台">
            <span className="grid grid-cols-2 gap-0.5 rounded-lg bg-white/55 p-1.5 dark:bg-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </button>
          <div className="min-w-0 flex-1 sm:min-w-[9rem]">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">拼豆</p>
            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{currentProjectName}</p>
          </div>
          {mappedPixelData && gridDimensions && (
            <div className="order-last flex w-full justify-center gap-1 sm:order-none sm:w-auto">
              {[
                { label: '优化', active: !isManualColoringMode, action: () => setIsManualColoringMode(false) },
                { label: '编辑', active: isManualColoringMode, action: () => {
                  setIsManualColoringMode(true);
                  setManualEditTool(prev => prev === 'pan' ? prev : 'pan');
                  setSelectedColor(prev => prev || getDefaultPaintColor());
                  setShowFullPalette(true);
                  setIsFloatingPaletteOpen(false);
                  setTooltipData(null);
                } },
                { label: '预览', active: false, action: () => setIsPreviewModalOpen(true) },
                { label: '拼豆', active: false, action: handleEnterFocusMode },
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
            <button type="button" className="flex min-h-10 flex-col items-start rounded-xl bg-white/50 px-2 py-1 text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-2.5" title={`色板设置 · ${selectedColorSystem} · ${totalBeadCount || 0} 颗`}>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">{selectedColorSystem || 'MARD'}</span>
              <span className="text-[11px] font-semibold">{totalBeadCount || 0}</span>
            </button>
            <button type="button" onClick={handleOpenProjects} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              我的项目
            </button>
            <button type="button" onClick={isMounted ? triggerFileInput : undefined} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              导入
            </button>
            <button type="button" onClick={() => setIsDownloadSettingsOpen(true)} disabled={!mappedPixelData} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              下载
            </button>
            <button type="button" onClick={() => persistProject()} disabled={!mappedPixelData || !gridDimensions || saveStatus === 'saving'} className="min-h-10 rounded-xl bg-[#d97757] px-3 text-xs font-semibold text-white transition-colors active:bg-[#c4684a] disabled:bg-[#d97757]/40 disabled:text-white/70 sm:min-h-[44px] sm:px-4">
              {saveStatus === 'saving' ? '保存中' : '保存'}
            </button>
            <button type="button" onClick={() => openShareModal('share')} disabled={!mappedPixelData || !gridDimensions} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              分享
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
                  拼豆
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
              
              {/* Tool name - 拼豆底稿生成器 with hyper cute style */}
              <div className="relative">
                <h2 className="relative text-xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-teal-500 via-green-500 to-emerald-400 tracking-widest transform hover:scale-102 transition-all duration-300">
                  拼豆底稿生成器
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 tracking-widest ml-1 align-middle">竖屏版</span>
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
            让像素创意属于每一个人
          </p>

          {/* 横屏设备弹窗 */}
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
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">专业工作台已上线</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">专业工作台拥有更完整的功能和更好的操作体验，推荐前往使用。</p>
                  <div className="mt-5 flex w-full gap-3">
                    <button
                      onClick={() => setShowDesktopModal(false)}
                      className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      留在此页
                    </button>
                    <a
                      href="https://perlerbeads.zippland.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      前往专业工作台
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h9.586L11.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 链接行：专业工作台· 小红书 · GitHub */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs">
            <a href="https://perlerbeads.zippland.com/" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v8h12V4H4zm-1 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              专业工作台
              <span className="px-1 py-px rounded bg-indigo-500 text-[9px] font-bold text-white leading-none">NEW</span>
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <a href="https://www.xiaohongshu.com/user/profile/623e8b080000000010007721" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m238.8 360.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8zM448 496l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z m248.9 43.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z"/>
              </svg>
              小红书
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <a href="https://github.com/Zippland/perler-beads" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 0C5.37 0 0 5.48 0 12.25c0 5.42 3.44 10.01 8.2 11.63.6.12.82-.27.82-.6 0-.3-.01-1.08-.02-2.13-3.34.74-4.04-1.65-4.04-1.65-.55-1.44-1.35-1.83-1.35-1.83-1.1-.78.08-.77.08-.77 1.21.09 1.85 1.26 1.85 1.26 1.08 1.9 2.83 1.35 3.52 1.03.11-.81.42-1.35.77-1.66-2.66-.31-5.46-1.36-5.46-6.06 0-1.34.46-2.43 1.22-3.29-.12-.31-.53-1.55.12-3.23 0 0 1-.33 3.29 1.25a10.96 10.96 0 0 1 5.98 0c2.29-1.58 3.29-1.25 3.29-1.25.65 1.68.24 2.92.12 3.23.76.86 1.22 1.95 1.22 3.29 0 4.71-2.81 5.74-5.49 6.05.43.38.81 1.13.81 2.28 0 1.65-.02 2.98-.02 3.39 0 .33.22.72.83.59C20.56 22.25 24 17.67 24 12.25 24 5.48 18.63 0 12 0Z" />
              </svg>
              GitHub
            </a>
          </div>
          {/* 来源提示 */}
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">发布平台请标注来源或保留图片水印及标识</p>
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
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">拖放图片到此处，或<span className="font-medium text-blue-600 dark:text-blue-400">点击选择文件</span></p>
            {/* Text color */}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">支持 JPG, PNG, GIF 图片格式，或 CSV 数据文件</p>
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
            拖放图片或 CSV 到这里，或点击导入/替换底稿
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
              <span className="text-indigo-700 dark:text-indigo-300">小贴士：使用像素图进行转换前，请确保图片的边缘吻合像素格子的边界线，这样可以获得更精确的切割效果和更好的成品。</span>
            </p>
          </div>
        )}

                      <input type="file" accept="image/jpeg, image/png, image/gif, .csv, text/csv, application/csv, text/plain" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

        {/* Controls and Output Area */}
        {originalImageSrc && (
          <div className="w-full flex flex-col items-center space-y-5 sm:space-y-6">
            {/* ++ HIDE Control Row in manual mode ++ */}
            {!isManualColoringMode && (
              /* 修改控制面板网格布局 */
              <div className="w-full md:max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                {/* Granularity Input */}
                <div className="flex-1">
                  {/* Label color */}
                  <label htmlFor="granularityInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    横轴切割数量 (10-300):
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
                        颜色合并阈值 (0-100):
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

                {/* 快捷按钮 */}
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleConfirmParameters}
                    className="h-9 bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 rounded-md whitespace-nowrap transition-colors duration-200 shadow-sm"
                  >
                    应用数字
                  </button>
                  <button
                    onClick={handleAutoRemoveBackground}
                    disabled={!mappedPixelData || !gridDimensions}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    一键去背景
                  </button>
                  <button
                    onClick={handleUndoBgRemoval}
                    disabled={!bgRemovalSnapshot}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    回撤上一步
                  </button>
                </div>

                {/* Pixelation Mode Selector */}
                <div className="sm:col-span-2">
                  {/* Label color */}
                  <label htmlFor="pixelationModeSelect" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">处理模式:</label>
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
                      <option value={PixelationMode.Dominant} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">卡通 (主色)</option>
                      <option value={PixelationMode.Average} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">真实 (平均)</option>
                    </select>
                  </div>
                </div>

                {/* 色号系统选择器 */}
                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">色号系统:</label>
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

                {/* 自定义色板按钮 */}
                <div className="sm:col-span-2 mt-3">
                  <button
                    onClick={() => setIsCustomPaletteEditorOpen(true)}
                    className="w-full py-2.5 px-3 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:from-blue-600 hover:to-purple-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                    </svg>
                    管理色板 ({Object.values(customPaletteSelections).filter(Boolean).length} 色)
                  </button>
                  {isCustomPalette && (
                    <p className="text-xs text-center text-blue-500 dark:text-blue-400 mt-1.5">当前使用自定义色板</p>
                  )}
                </div>
              </div>
            )}

            {/* 自定义色板编辑器弹窗 - 这是新增的部分 */}
            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                   {/* 添加隐藏的文件输入框 */}
                   <input
                    type="file"
                    accept=".json"
                    ref={importPaletteInputRef}
                    onChange={handleImportPaletteFile}
                    className="hidden"
                  />
                  <div className="p-4 sm:p-6 flex-1 overflow-y-auto"> {/* 让内容区域可滚动 */}
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

              {/* ++ 手动编辑模式提示信息 ++ */}
              {false && isManualColoringMode && mappedPixelData && gridDimensions && (
                <div className="w-full mb-4 p-3 bg-blue-50 dark:bg-gray-800 rounded-lg shadow-sm border border-blue-100 dark:border-gray-700">
                  <div className="flex justify-center">
                    <div className="bg-blue-50 dark:bg-gray-700 border border-blue-100 dark:border-gray-600 rounded-lg p-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs text-gray-600 dark:text-gray-300 w-full sm:w-auto">
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>使用悬浮工具栏操作</span>
                      </div>
                      <span className="hidden sm:inline text-gray-300 dark:text-gray-500">|</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>推荐电脑操作，上色更精准</span>
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
                      <span>当前</span>
                      <span
                        className="h-5 w-5 rounded border border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: manualEditTool === 'eraser' ? '#FFFFFF' : selectedColor?.color || '#FFFFFF' }}
                      />
                      <span>
                        {manualEditTool === 'eraser'
                          ? '橡皮'
                          : selectedColor
                            ? getColorKeyByHex(selectedColor?.color || '#FFFFFF', selectedColorSystem)
                            : '未选颜色'}
                      </span>
                      {manualShapeStart && (
                        <span className="rounded bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                          已选起点 {(manualShapeStart?.col ?? 0) + 1},{(manualShapeStart?.row ?? 0) + 1}
                        </span>
                      )}
                      {activeSelection && (
                        <span className="rounded bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                          选区 {Math.abs((activeSelection?.endCol ?? 0) - (activeSelection?.startCol ?? 0)) + 1}x{Math.abs((activeSelection?.endRow ?? 0) - (activeSelection?.startRow ?? 0)) + 1}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                    <button type="button" disabled={!activeSelection} onClick={handleCopyActiveSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      复制
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={handleCutActiveSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      剪切
                    </button>
                    <button type="button" disabled={!selectionClipboard || !activeSelection} onClick={handlePasteAtSelection} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      粘贴到选区
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={handleDeleteActiveSelection} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-40 dark:border-red-800 dark:text-red-300">
                      删除
                    </button>
                    <button type="button" disabled={!activeSelection} onClick={() => setActiveSelection(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      取消选区
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
                {/* 大画布提示信息 */}
                {!isManualColoringMode && gridDimensions && gridDimensions.N > 100 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>高精度网格 ({gridDimensions.N}×{gridDimensions.M}) - 画布已自动放大，可左右滚动、放大查看精细图像</span>
                    </div>
                  </div>
                )}
                 {/* Inner container background - 允许水平滚动以适应大画布 */}
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
              去除杂色 
            </h3>
            {/* Subtitle color */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">点击下方列表中的颜色可将其从可用列表中排除。总计: {totalBeadCount} 颗</p>
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-2 text-sm">
              {Object.keys(colorCounts)
                .sort((a, b) => {
                  const countDelta = colorCounts[a].count - colorCounts[b].count;
                  return countDelta !== 0 ? countDelta : sortColorKeys(a, b);
                })
                .map((hexKey) => {
                  // 现在key是hex值，需要通过hex获取对应色号系统的色号
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
                      title={isExcluded ? `点击恢复 ${displayColorKey}` : `点击排除 ${displayColorKey}`}
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
                      <span className={`text-xs ${isExcluded ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-300'}`}>{count} 颗</span>
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
                    <span>已排除的颜色 ({excludedColorKeys.size})</span>
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
                                      // 实现恢复单个颜色的逻辑
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
                                    恢复
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                            没有排除的颜色
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          // 恢复所有颜色的逻辑
                          setExcludedColorKeys(new Set());
                          setRemapTrigger(prev => prev + 1);
                          setIsManualColoringMode(false);
                          setSelectedColor(null);
                          console.log("Restored all excluded colors");
                        }}
                        className="mt-2 w-full text-xs py-1 px-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        一键恢复所有颜色
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
                 当前可用颜色过少或为空。请在上方统计列表中查看已排除的颜色并恢复部分，或更换色板。
                 {excludedColorKeys.size > 0 && (
                      // Apply dark mode styles to the inline "restore all" button
                      <button
                          onClick={() => {
                            setShowExcludedColors(true); // 展开排除颜色列表
                            // 滚动到颜色列表处
                            setTimeout(() => {
                              const listElement = document.querySelector('.color-stats-panel');
                              if (listElement) {
                                listElement.scrollIntoView({ behavior: 'smooth' });
                              }
                            }, 100);
                          }}
                          className="mt-2 ml-2 text-xs py-1 px-2 bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-300 dark:hover:bg-yellow-600/70 transition-colors"
                      >
                          查看已排除颜色 ({excludedColorKeys.size})
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
                 进入手动编辑模式
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
                 进入专心拼豆模式（AplhaTest）
             </button>
            </div>
        )} {/* ++ End of RENDER Enter Manual Mode Button ++ */}

        {/* ++ HIDE Download Buttons in manual mode ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && (
            <div className="w-full md:max-w-2xl mt-4">
              {/* 使用一个大按钮，现在所有的下载设置都通过弹窗控制 */}
              <button
                onClick={() => setIsDownloadSettingsOpen(true)}
                disabled={!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm sm:text-base rounded-lg hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:translate-y-[-1px] disabled:hover:translate-y-0 disabled:hover:shadow-md"
               >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                下载拼豆图纸
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
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">项目</p>
            <h2 className="mt-1 truncate text-base font-semibold text-gray-800 dark:text-gray-100">{currentProjectName}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">画布</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{gridDimensions ? `${gridDimensions.N}x${gridDimensions.M}` : '--'}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">豆数</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{totalBeadCount || 0}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">色板</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{selectedColorSystem}</p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 dark:bg-white/5">
                <p className="text-gray-500 dark:text-gray-400">状态</p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{saveStatus === 'saved' ? '已保存' : saveStatus === 'saving' ? '保存中' : saveStatus === 'dirty' ? '未保存' : saveStatus === 'conflict' ? '有冲突' : '需检查'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/50 bg-white/45 p-4 dark:border-white/10 dark:bg-white/5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">快捷操作</h2>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={handleOpenProjects} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                打开我的项目
              </button>
              <button type="button" onClick={() => setIsImageEditorOpen(true)} disabled={!originalImageSrc} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                编辑原图
              </button>
              <button type="button" onClick={() => setIsCanvasToolsOpen(true)} disabled={!mappedPixelData || !gridDimensions} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                画布工具
              </button>
              <button type="button" onClick={handleOpenHistory} disabled={!currentProjectId} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                历史与备份
              </button>
              <button type="button" onClick={() => openShareModal('import')} disabled={!mappedPixelData || !gridDimensions} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors active:bg-white disabled:opacity-45 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                分享码导入/导出
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">私有同步</h2>
            <p className="mt-2 text-xs leading-6 text-emerald-800/80 dark:text-emerald-100/75">
              当前版本使用服务器 SQLite 保存项目，手机和电脑访问同一地址后，可以打开同一项目继续修改。公开画廊发布功能按要求不接入。
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
        />
      )}

      {/* 悬浮工具栏 */}
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

      {/* 悬浮调色盘 */}
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

      {/* 放大镜工具 */}
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
          
          {/* 放大镜选择覆盖层 */}
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
            拼豆底稿生成器 &copy; {new Date().getFullYear()}
          </p>
        </footer>
      )}

      {/* 使用导入的下载设置弹窗组件 */}
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

      {/* 专心拼豆模式进入前下载提醒弹窗 */}
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

      {/* 轻量提示 Toast */}
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
