// frontend/src/components/SatelliteEntityManager.jsx
import React, { useEffect, useRef } from 'react'
import { useCesium } from 'resium'
import { useConstellationStore } from '../store/constellationStore'
import { SatelliteManager } from '../services/OrbitCalculator'

/**
 * 负责把 store 中选中的卫星加载到 Cesium, 并在
 * - 选中卫星列表变化
 * - 轨道显示开关变化
 * - 仿真时间范围变化
 * 时，自动增删 / 刷新卫星组件
 */
function SatelliteEntityManager() {
  const { viewer } = useCesium()
  const satelliteManagerRef = useRef(null)
  const loadedSatellitesRef = useRef(new Set())

  // === Get data from store ===
  const tleData = useConstellationStore(s => s.tleData)
  const selectedSatellites = useConstellationStore(s => s.selectedSatellites)
  const getColor = useConstellationStore(s => s.getConstellationColor)
  const showOrbits = useConstellationStore(s => s.showOrbits)
  const startTime = useConstellationStore(s => s.startTime)
  const endTime = useConstellationStore(s => s.endTime)

  // === Initialize SatelliteManager ===
  useEffect(() => {
    if (!viewer) return
    satelliteManagerRef.current = new SatelliteManager(viewer)
    return () => satelliteManagerRef.current?.clearAll()
  }, [viewer])

  /**
   * Handle changes in satellite selection.
   * This only handles loading and unloading of satellites, not their display state.
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current
    const currently = new Set()

    Object.entries(selectedSatellites).forEach(([constellation, satNames]) => {
      const tleList = tleData[constellation] || []
      satNames.forEach(name => {
        currently.add(name)

        // New satellite -> addFromTle (load only, don't show)
        if (!loadedSatellitesRef.current.has(name)) {
          const tleObj = tleList.find(s => s.name === name)
          if (tleObj) {
            const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
            manager.addFromTle(tle, [], getColor(constellation))
            loadedSatellitesRef.current.add(name)
          }
        }
      })
    })

    // Remove satellites that are loaded but no longer selected
    loadedSatellitesRef.current.forEach(name => {
      if (!currently.has(name)) {
        manager.hideSatellite(name)
        loadedSatellitesRef.current.delete(name)
      }
    })
  }, [selectedSatellites, tleData, getColor])

  /**
   * Uniformly handle the display state of all loaded satellites.
   * When the orbit display switch or satellite selection changes, apply the display state uniformly.
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current

    // Apply display state to all loaded satellites
    loadedSatellitesRef.current.forEach(name => {
      // Check if this satellite is still selected
      const isSelected = Object.values(selectedSatellites).some(satNames => satNames.includes(name))

      if (isSelected) {
        // Decide which components to show based on the orbit display switch
        if (showOrbits) {
          manager.showSatellite(name, ['Point', 'Orbit'])
        } else {
          manager.showSatellite(name, ['Point'])
        }
      }
    })
  }, [showOrbits, selectedSatellites, startTime, endTime])

  /**
   * Key fix:
   * When startTime / endTime changes (user modifies the time range),
   * each loaded satellite needs to refresh its orbit data.
   * This only handles data reconstruction, not the display state (which is handled by the unified display management).
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current

    // For loaded satellites, completely remove and recreate them based on the new time interval
    const toRecreate = Array.from(loadedSatellitesRef.current)
    toRecreate.forEach(name => {
      // Find the constellation to get color and TLE
      const constellationEntry = Object.entries(tleData).find(([, list]) => list.some(s => s.name === name))
      if (!constellationEntry) return
      const [constellationName, tleList] = constellationEntry
      const tleObj = tleList.find(t => t.name === name)
      if (!tleObj) return

      // First, completely delete the old satellite entity
      manager.hideSatellite(name)
      loadedSatellitesRef.current.delete(name)

      // Re-addFromTle (will resample based on the current Cesium clock's startTime/stopTime)
      const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
      manager.addFromTle(tle, [], getColor(constellationName))
      loadedSatellitesRef.current.add(name)
    })
  }, [startTime, endTime])

  return null          // Component does not render any JSX
}

export default SatelliteEntityManager