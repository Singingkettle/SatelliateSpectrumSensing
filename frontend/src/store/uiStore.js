/**
 * UI Store - Manages UI state for the satellite tracker
 * Extended for satellitemap.space replication
 */
import { create } from 'zustand';

// Layout constants
export const SIDER_WIDTH = 400;
export const EDGE_HOVER_HEIGHT = 30;

export const useUiStore = create((set, get) => ({
  // ============ PANEL STATE ============
  
  // Main control panel
  panelCollapsed: true,
  panelPinned: false,
  activePanel: 'constellations', // 'constellations' | 'search' | 'info' | 'settings'
  
  // Modal states
  showSearchModal: false,
  showSettingsModal: false,
  showCalculatorModal: false,
  showWelcomePanel: true,
  showConstellationData: false,
  showSpaceTrackStatus: false,
  
  // ============ DISPLAY STATE ============
  
  // Scene settings
  sceneMode: '3D',          // '2D' | '3D'
  lightingEnabled: false,   // Day/night lighting (off for space theme)
  showAtmosphere: true,     // Atmospheric effects
  showStars: true,          // Star background
  showGrid: false,          // Globe grid lines
  showBorders: true,        // Country borders (like satellitemap.space)
  showClouds: false,        // Cloud layer overlay
  earthRotation: true,      // Earth auto-rotation (like satellitemap.space)
  
  // UI visibility
  showTimeline: false,
  showAnimation: false,
  showStatusBar: true,
  showLegendPanel: true,
  showBottomToolbar: true,
  showTimeControls: true,
  
  // Theme
  theme: 'dark',            // 'dark' | 'light'
  
  // ============ ACTIONS ============
  
  // Panel actions
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  togglePanelCollapsed: () => set(state => ({ panelCollapsed: !state.panelCollapsed })),
  
  setPanelPinned: (pinned) => set({ panelPinned: pinned }),
  togglePanelPinned: () => set(state => {
    const nextPinned = !state.panelPinned;
    return nextPinned 
      ? { panelPinned: true, panelCollapsed: false }
      : { panelPinned: false };
  }),
  
  setActivePanel: (panel) => set({ activePanel: panel }),
  
  // Modal actions
  setShowSearchModal: (show) => set({ showSearchModal: show }),
  toggleSearchModal: () => set(state => ({ showSearchModal: !state.showSearchModal })),
  
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),
  toggleSettingsModal: () => set(state => ({ showSettingsModal: !state.showSettingsModal })),
  
  setShowCalculatorModal: (show) => set({ showCalculatorModal: show }),
  toggleCalculatorModal: () => set(state => ({ showCalculatorModal: !state.showCalculatorModal })),
  
  setShowWelcomePanel: (show) => set({ showWelcomePanel: show }),
  
  setShowConstellationData: (show) => set({ showConstellationData: show }),
  
  setShowSpaceTrackStatus: (show) => set({ showSpaceTrackStatus: show }),
  toggleSpaceTrackStatus: () => set(state => ({ showSpaceTrackStatus: !state.showSpaceTrackStatus })),
  
  // Display actions
  setSceneMode: (mode) => set({ sceneMode: mode }),
  toggleSceneMode: () => set(state => ({
    sceneMode: state.sceneMode === '3D' ? '2D' : '3D'
  })),
  
  setLightingEnabled: (enabled) => set({ lightingEnabled: enabled }),
  toggleLighting: () => set(state => ({ lightingEnabled: !state.lightingEnabled })),
  
  setShowAtmosphere: (show) => set({ showAtmosphere: show }),
  toggleAtmosphere: () => set(state => ({ showAtmosphere: !state.showAtmosphere })),
  
  setShowStars: (show) => set({ showStars: show }),
  toggleStars: () => set(state => ({ showStars: !state.showStars })),
  
  setShowGrid: (show) => set({ showGrid: show }),
  toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),
  
  setShowBorders: (show) => set({ showBorders: show }),
  toggleBorders: () => set(state => ({ showBorders: !state.showBorders })),
  
  setShowClouds: (show) => set({ showClouds: show }),
  toggleClouds: () => set(state => ({ showClouds: !state.showClouds })),
  
  setEarthRotation: (enabled) => set({ earthRotation: enabled }),
  toggleEarthRotation: () => set(state => ({ earthRotation: !state.earthRotation })),
  
  setShowTimeline: (show) => set({ showTimeline: show }),
  setShowAnimation: (show) => set({ showAnimation: show }),
  setShowStatusBar: (show) => set({ showStatusBar: show }),
  
  setShowLegendPanel: (show) => set({ showLegendPanel: show }),
  toggleLegendPanel: () => set(state => ({ showLegendPanel: !state.showLegendPanel })),
  
  setShowBottomToolbar: (show) => set({ showBottomToolbar: show }),
  setShowTimeControls: (show) => set({ showTimeControls: show }),
  
  // Theme
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set(state => ({
    theme: state.theme === 'dark' ? 'light' : 'dark'
  })),
}));
