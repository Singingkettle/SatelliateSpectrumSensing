import { create } from 'zustand'

// Constants
export const SIDER_WIDTH = 380
export const EDGE_HOVER_WIDTH = 20 // (unused for vertical animation now)
export const EDGE_HOVER_HEIGHT = 20 // height of invisible top hover area when panel is collapsed

export const useUiStore = create((set) => ({
    panelCollapsed: true,
    panelPinned: false,
    setPanelCollapsed: (panelCollapsed) =>
        set((state) => (state.panelCollapsed === panelCollapsed ? state : { panelCollapsed })),
    togglePanelPinned: () =>
        set((state) => {
            const nextPinned = !state.panelPinned
            return nextPinned ? { panelPinned: nextPinned, panelCollapsed: false } : { panelPinned: nextPinned }
        }),
}))
