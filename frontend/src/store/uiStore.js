import { create } from 'zustand'

// Constants
export const SIDER_WIDTH = 380 // keep in sync with App.js
export const EDGE_HOVER_WIDTH = 20 // pixels width of invisible hover area when panel is collapsed

// Simple UI store to manage left panel state
export const useUiStore = create((set) => ({
    panelCollapsed: true,
    panelPinned: false,
    setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
    togglePanelPinned: () =>
        set((state) => ({ panelPinned: !state.panelPinned, panelCollapsed: false })),
}))
