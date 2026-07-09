import { MappedPixel } from './pixelation';
import { transparentColorData } from './pixelEditingUtils';

export type PixelLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  data: MappedPixel[][];
};

export function clonePixelGrid(data: MappedPixel[][]): MappedPixel[][] {
  return data.map(row => row.map(cell => ({ ...cell })));
}

export function createBlankPixelGrid(dimensions: { N: number; M: number }): MappedPixel[][] {
  return Array.from({ length: dimensions.M }, () =>
    Array.from({ length: dimensions.N }, () => ({ ...transparentColorData }))
  );
}

export function createPixelLayer(
  name: string,
  data: MappedPixel[][],
  overrides: Partial<Omit<PixelLayer, 'data'>> = {}
): PixelLayer {
  return {
    id: overrides.id || `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    data: clonePixelGrid(data),
  };
}

export function normalizePixelLayers(
  layers: PixelLayer[] | undefined,
  fallbackData: MappedPixel[][] | null,
  dimensions: { N: number; M: number } | null
): PixelLayer[] {
  if (layers && layers.length > 0) {
    return layers.map((layer, index) => ({
      id: layer.id || `layer-${index + 1}`,
      name: layer.name || `图层 ${index + 1}`,
      visible: layer.visible ?? true,
      locked: layer.locked ?? false,
      data: clonePixelGrid(layer.data),
    }));
  }

  if (fallbackData) {
    return [createPixelLayer('主体', fallbackData, { id: 'layer-main' })];
  }

  if (dimensions) {
    return [createPixelLayer('主体', createBlankPixelGrid(dimensions), { id: 'layer-main' })];
  }

  return [];
}

export function compositePixelLayers(
  layers: PixelLayer[],
  dimensions: { N: number; M: number } | null
): MappedPixel[][] | null {
  if (!dimensions || layers.length === 0) return null;

  const composite = createBlankPixelGrid(dimensions);

  layers.forEach((layer) => {
    if (!layer.visible) return;

    for (let row = 0; row < dimensions.M; row++) {
      for (let col = 0; col < dimensions.N; col++) {
        const cell = layer.data[row]?.[col];
        if (cell && !cell.isExternal) {
          composite[row][col] = { ...cell, isExternal: false };
        }
      }
    }
  });

  return composite;
}

export function updatePixelLayerData(
  layers: PixelLayer[],
  layerId: string | null,
  data: MappedPixel[][]
): PixelLayer[] {
  if (!layerId) return layers;
  return layers.map(layer =>
    layer.id === layerId
      ? { ...layer, data: clonePixelGrid(data) }
      : layer
  );
}

export function resizePixelLayers(
  layers: PixelLayer[],
  resizeLayer: (data: MappedPixel[][]) => MappedPixel[][]
): PixelLayer[] {
  return layers.map(layer => ({
    ...layer,
    data: resizeLayer(layer.data),
  }));
}
