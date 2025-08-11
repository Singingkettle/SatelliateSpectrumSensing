// frontend/src/components/SatelliteEntityManager.jsx (satvis integration)
import React, { useEffect, useRef } from 'react'
import { useCesium } from 'resium'
import { useConstellationStore } from '../store/constellationStore'
import { SatelliteManager } from '../services/OrbitCalculator'

function SatelliteEntityManager() {
  const { viewer } = useCesium()
  const managerRef = useRef(null)
  const loadedSetRef = useRef(new Set())

  const tleData = useConstellationStore((s) => s.tleData)
  const selectedSatellites = useConstellationStore((s) => s.selectedSatellites)
  const getColor = useConstellationStore((s) => s.getConstellationColor)
  const showOrbits = useConstellationStore((s) => s.showOrbits)
  const startTime = useConstellationStore((s) => s.startTime)
  const endTime = useConstellationStore((s) => s.endTime)

  // init manager
  useEffect(() => {
    if (!viewer) return
    managerRef.current = new SatelliteManager(viewer)
    return () => managerRef.current?.clearAll()
  }, [viewer])

  // apply selection changes
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
          // show based on switch
          sat.show(showOrbits ? ['Point', 'Orbit'] : ['Point'])
          loadedSetRef.current.add(name)
        }
      })
    })

    // remove unselected
    loadedSetRef.current.forEach((name) => {
      if (!currently.has(name)) {
        manager.hideSatellite(name)
        loadedSetRef.current.delete(name)
      }
    })
  }, [selectedSatellites, tleData, getColor, showOrbits])

  // toggle orbits for all loaded satellites
  useEffect(() => {
    if (!managerRef.current) return
    const manager = managerRef.current
    loadedSetRef.current.forEach((name) => {
      const sat = manager.getSatellite(name)
      if (!sat) return
      sat.show(showOrbits ? ['Point', 'Orbit'] : ['Point'])
    })
  }, [showOrbits])

  // time window changed -> re-init sampled positions so PathGraphics stays correct
  useEffect(() => {
    if (!managerRef.current) return
    const manager = managerRef.current
    // simple strategy: destroy and re-add to resample against new clock window
    const names = Array.from(loadedSetRef.current)
    names.forEach((name) => {
      // find its tle
      const entry = Object.entries(tleData).find(([, list]) => list.some((s) => s.name === name))
      if (!entry) return
      const [constellation, list] = entry
      const tleObj = list.find((t) => t.name === name)
      if (!tleObj) return
      manager.hideSatellite(name)
      loadedSetRef.current.delete(name)
      const tle = `${tleObj.name}\n${tleObj.line1}\n${tleObj.line2}`
      const sat = manager.addFromTle(tle, [], getColor(constellation))
      sat.show(showOrbits ? ['Point', 'Orbit'] : ['Point'])
      loadedSetRef.current.add(name)
    })
  }, [startTime, endTime, tleData, getColor, showOrbits])

  return null
}

export default SatelliteEntityManager
