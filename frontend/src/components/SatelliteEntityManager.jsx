// frontend/src/components/SatelliteEntityManager.jsx (satvis integration)
import React, { useEffect, useRef } from 'react'
import { useCesium } from 'resium'
import * as Cesium from 'cesium'
import { useConstellationStore } from '../store/constellationStore'
import { SatelliteManager } from '../services/OrbitCalculator'
import { createCompanionTle } from '../services/tleUtils'

function SatelliteEntityManager() {
  const { viewer } = useCesium()
  const managerRef = useRef(null)
  const loadedSetRef = useRef(new Set())

  const tleData = useConstellationStore((s) => s.tleData)
  const selectedSatellites = useConstellationStore((s) => s.selectedSatellites)
  const getColor = useConstellationStore((s) => s.getConstellationColor)
  const showOrbits = useConstellationStore((s) => s.showOrbits)
  const orbitOverrides = useConstellationStore((s) => s.orbitOverrides)
  const startTime = useConstellationStore((s) => s.startTime)
  const endTime = useConstellationStore((s) => s.endTime)

  const monitoringStrategy = useConstellationStore((s) => s.monitoringStrategy)
  const monitoringTarget = useConstellationStore((s) => s.monitoringTarget)
  const monitoringDistanceKm = useConstellationStore((s) => s.monitoringDistanceKm)
  const setCompanionName = useConstellationStore((s) => s.setCompanionName)

  const companionNameRef = useRef(null)
  const companionEntityRef = useRef(null)

  const shouldShowOrbit = (name) => {
    if (name in orbitOverrides) return !!orbitOverrides[name]
    return !!showOrbits
  }

  useEffect(() => {
    if (!viewer) return
    managerRef.current = new SatelliteManager(viewer)
    return () => managerRef.current?.clearAll()
  }, [viewer])

  useEffect(() => {
    if (!managerRef.current) return
    const manager = managerRef.current

    const currently = new Set()
    Object.entries(selectedSatellites).forEach(([constellation, names]) => {
      const list = tleData[constellation] || []
      names.forEach((name) => {
        currently.add(name)
        if (!loadedSetRef.current.has(name)) {
          const tleObj = list.find((t) => t.name === name)
          if (!tleObj) return
          const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
          const sat = manager.addFromTle(tle, [], getColor(constellation))
          sat.show(shouldShowOrbit(name) ? ['Point', 'Orbit'] : ['Point'])
          loadedSetRef.current.add(name)
        }
      })
    })

    if (companionNameRef.current) currently.add(companionNameRef.current)

    loadedSetRef.current.forEach((name) => {
      if (!currently.has(name)) {
        manager.hideSatellite(name)
        loadedSetRef.current.delete(name)
      }
    })
  }, [selectedSatellites, tleData, getColor])

  useEffect(() => {
    if (!managerRef.current) return
    const manager = managerRef.current
    loadedSetRef.current.forEach((name) => {
      const sat = manager.getSatellite(name)
      if (!sat) return
      sat.show(shouldShowOrbit(name) ? ['Point', 'Orbit'] : ['Point'])
    })
  }, [showOrbits, orbitOverrides])

  useEffect(() => {
    if (!managerRef.current) return
    const manager = managerRef.current
    const names = Array.from(loadedSetRef.current)
    names.forEach((name) => {
      const entry = Object.entries(tleData).find(([, list]) => list.some((s) => s.name === name))
      if (!entry) return
      const [constellation, list] = entry
      const tleObj = list.find((t) => t.name === name)
      if (!tleObj) return
      manager.hideSatellite(name)
      loadedSetRef.current.delete(name)
      const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
      const sat = manager.addFromTle(tle, [], getColor(constellation))
      sat.show(shouldShowOrbit(name) ? ['Point', 'Orbit'] : ['Point'])
      loadedSetRef.current.add(name)
    })
  }, [startTime, endTime, tleData, getColor])

  // Companion satellite via single-shot TLE generation
  useEffect(() => {
    if (!viewer || !managerRef.current) return
    const manager = managerRef.current

    const removeCompanion = () => {
      if (companionNameRef.current) {
        manager.hideSatellite(companionNameRef.current)
        loadedSetRef.current.delete(companionNameRef.current)
        companionNameRef.current = null
        companionEntityRef.current = null
        setCompanionName(null)
      }
    }

    removeCompanion()

    if (monitoringStrategy !== 'accompany' || !monitoringTarget) return

    let targetTleObj = null
    Object.values(tleData).some((list) => {
      const f = (list || []).find((t) => t.name === monitoringTarget)
      if (f) { targetTleObj = f; return true }
      return false
    })
    if (!targetTleObj) return

    const id = Math.random().toString(36).slice(2, 8)
    const compName = `Companion-${id}`
    const companionTle = createCompanionTle({
      name: compName,
      targetTleLines: [monitoringTarget, targetTleObj.line1, targetTleObj.line2],
      distanceKm: monitoringDistanceKm || 5,
    })
    if (!companionTle) return

    const sat = manager.addFromTle(companionTle, ['companion'], Cesium.Color.YELLOW)
    sat.show(shouldShowOrbit(compName) ? ['Point', 'Orbit'] : ['Point'])

    // Keep references
    companionNameRef.current = compName
    loadedSetRef.current.add(compName)
    setCompanionName(compName)

    // Capture the path entity for visibility toggles
    const pathEntity = manager.viewer.entities.values.find((en) => en.name === `${compName}_orbit`)
    companionEntityRef.current = pathEntity || null

    return () => removeCompanion()
  }, [viewer, monitoringStrategy, monitoringTarget, monitoringDistanceKm, tleData, setCompanionName])

  // Respect per-satellite override for companion path visibility
  useEffect(() => {
    const name = companionNameRef.current
    const pathEntity = companionEntityRef.current
    if (!name || !pathEntity || !pathEntity.path) return

    const should = shouldShowOrbit(name)
    pathEntity.path.show = should

    const sat = managerRef.current?.getSatellite(name)
    if (sat) sat.show(should ? ['Point', 'Orbit'] : ['Point'])
  }, [showOrbits, orbitOverrides])

  return null
}

export default SatelliteEntityManager
