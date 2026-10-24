/**
 * Zustand store for UI state management only.
 * Architectural separation: The 60fps canvas render loop DOES NOT update or read from Zustand,
 * avoiding React component re-renders during high-frequency animations.
 */
import { create } from 'zustand';
import type { CameraState } from '../canvas/camera.ts';
import { DEFAULT_CAMERA } from '../canvas/camera.ts';

export type ToolMode = 'inspect' | 'pan' | 'lens' | 'fps';

export interface QARecord {
  question: string;
  answer: string;
  timestamp: number;
}

interface DashboardState {
  // Navigation & Selection
  selectedSubfieldId: string | null;
  hoveredSubfieldId: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  hoverTooltip: { x: number; y: number; title: string; subtitle?: string } | null;

  // Timeline
  year: number; // [1995, 2026]

  // Tools & Viewport
  activeTool: ToolMode;
  showFps: boolean;
  fps: number;
  nodesDrawn: number;
  camera: CameraState;

  // Modes
  isForecasting: boolean;

  // AI Command History
  qaHistory: QARecord[];

  // Actions
  setSelectedSubfieldId: (id: string | null) => void;
  setHoveredSubfieldId: (id: string | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setHoverTooltip: (tooltip: { x: number; y: number; title: string; subtitle?: string } | null) => void;
  setYear: (year: number) => void;
  setActiveTool: (tool: ToolMode) => void;
  toggleFps: () => void;
  setFpsStats: (fps: number, nodesDrawn: number) => void;
  setCamera: (camera: CameraState | ((prev: CameraState) => CameraState)) => void;
  resetCamera: () => void;
  toggleForecast: () => void;
  addQARecord: (record: QARecord) => void;
}

export const useDashboard = create<DashboardState>((set) => ({
  selectedSubfieldId: null,
  hoveredSubfieldId: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  hoverTooltip: null,

  year: 2026,

  activeTool: 'inspect',
  showFps: false,
  fps: 60,
  nodesDrawn: 0,
  camera: { ...DEFAULT_CAMERA },

  isForecasting: false,

  qaHistory: [],

  setSelectedSubfieldId: (id) => set({ selectedSubfieldId: id }),
  setHoveredSubfieldId: (id) => set({ hoveredSubfieldId: id }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setHoverTooltip: (tooltip) => set({ hoverTooltip: tooltip }),
  setYear: (year) => set({ year }),
  setActiveTool: (tool) => set((state) => ({
    activeTool: tool,
    showFps: tool === 'fps' ? !state.showFps : state.showFps,
  })),
  toggleFps: () => set((state) => ({ showFps: !state.showFps })),
  setFpsStats: (fps, nodesDrawn) => set({ fps, nodesDrawn }),
  setCamera: (cameraOrUpdater) =>
    set((state) => ({
      camera: typeof cameraOrUpdater === 'function' ? cameraOrUpdater(state.camera) : cameraOrUpdater,
    })),
  resetCamera: () => set({ camera: { ...DEFAULT_CAMERA } }),
  toggleForecast: () => set((state) => ({ isForecasting: !state.isForecasting })),
  addQARecord: (record) => set((state) => ({ qaHistory: [record, ...state.qaHistory] })),
}));
