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

  // === 从 store 取数据 ===
  const tleData = useConstellationStore(s => s.tleData)
  const selectedSatellites = useConstellationStore(s => s.selectedSatellites)
  const getColor = useConstellationStore(s => s.getConstellationColor)
  const showOrbits = useConstellationStore(s => s.showOrbits)
  const startTime = useConstellationStore(s => s.startTime)
  const endTime = useConstellationStore(s => s.endTime)

  // === 初始化 SatelliteManager ===
  useEffect(() => {
    if (!viewer) return
    satelliteManagerRef.current = new SatelliteManager(viewer)
    return () => satelliteManagerRef.current?.clearAll()
  }, [viewer])

  /**
   * 处理「卫星选择」变化
   * 只负责卫星的加载和移除，不处理显示状态
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current
    const currently = new Set()

    Object.entries(selectedSatellites).forEach(([constellation, satNames]) => {
      const tleList = tleData[constellation] || []
      satNames.forEach(name => {
        currently.add(name)

        // 新卫星 ➜ addFromTle (只加载，不显示)
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

    // 把已加载但不再选中的卫星移除
    loadedSatellitesRef.current.forEach(name => {
      if (!currently.has(name)) {
        manager.hideSatellite(name)
        loadedSatellitesRef.current.delete(name)
      }
    })
  }, [selectedSatellites, tleData, getColor])

  /**
   * 统一处理所有已加载卫星的显示状态
   * 当轨道显示开关变化或卫星选择变化时，统一应用显示状态
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current

    // 对所有已加载的卫星应用显示状态
    loadedSatellitesRef.current.forEach(name => {
      // 检查该卫星是否仍然被选中
      const isSelected = Object.values(selectedSatellites).some(satNames => satNames.includes(name))

      if (isSelected) {
        // 根据轨道显示开关决定显示哪些组件
        if (showOrbits) {
          manager.showSatellite(name, ['Point', 'Orbit'])
        } else {
          manager.showSatellite(name, ['Point'])
        }
      }
    })
  }, [showOrbits, selectedSatellites, startTime, endTime])

  /**
   * 关键修复：
   * 当 startTime / endTime 变化 (用户修改时间范围) 时，
   * 需要让每颗已加载卫星重新刷新轨道数据
   * 只负责重建数据，不处理显示状态（由统一显示管理处理）
   */
  useEffect(() => {
    if (!satelliteManagerRef.current) return

    const manager = satelliteManagerRef.current

    // 对于已加载卫星，彻底移除并依据新的时间区间重新创建
    const toRecreate = Array.from(loadedSatellitesRef.current)
    toRecreate.forEach(name => {
      // 找到所属星座以便获取颜色和 TLE
      const constellationEntry = Object.entries(tleData).find(([, list]) => list.some(s => s.name === name))
      if (!constellationEntry) return
      const [constellationName, tleList] = constellationEntry
      const tleObj = tleList.find(t => t.name === name)
      if (!tleObj) return

      // 先彻底删除旧卫星实体
      manager.hideSatellite(name)
      loadedSatellitesRef.current.delete(name)

      // 重新 addFromTle（会根据当前 Cesium clock 的 startTime/stopTime 重新采样）
      const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
      manager.addFromTle(tle, [], getColor(constellationName))
      loadedSatellitesRef.current.add(name)
    })
  }, [startTime, endTime])

  return null          // 组件不渲染任何 JSX
}

export default SatelliteEntityManager