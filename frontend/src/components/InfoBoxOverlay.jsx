import React, { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { useCesium } from 'resium'
import { Switch, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { useConstellationStore } from '../store/constellationStore'

function formatTimeLabel(sec) {
    const d = new Date(sec * 1000)
    const hh = `${d.getHours()}`.padStart(2, '0')
    const mm = `${d.getMinutes()}`.padStart(2, '0')
    const ss = `${d.getSeconds()}`.padStart(2, '0')
    return `${hh}:${mm}:${ss}`
}

function normalizeEntityName(name) {
    if (!name) return name
    return name.replace(/_(orbit|label)$/i, '')
}

function AltitudeTimeChart({ series, title }) {
    if (!series || series.length < 2) return null
    const width = 300
    const height = 100
    const paddingLeft = 40
    const paddingBottom = 20
    const paddingRight = 8
    const paddingTop = 10

    const minT = series[0].t
    const maxT = series[series.length - 1].t
    const minAlt = Math.min(...series.map((s) => s.altKm))
    const maxAlt = Math.max(...series.map((s) => s.altKm))
    const xSpan = Math.max(1, maxT - minT)
    const ySpan = Math.max(1e-3, maxAlt - minAlt)

    const plotW = width - paddingLeft - paddingRight
    const plotH = height - paddingTop - paddingBottom

    const toX = (t) => paddingLeft + ((t - minT) / xSpan) * plotW
    const toY = (altKm) => paddingTop + (1 - (altKm - minAlt) / ySpan) * plotH

    const path = series.map((s, i) => {
        const x = toX(s.t)
        const y = toY(s.altKm)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

    const latest = series[series.length - 1]
    const hx = toX(latest.t)
    const hy = toY(latest.altKm)

    const x0 = paddingLeft
    const y0 = paddingTop + plotH
    const x1 = paddingLeft + plotW
    const y1 = paddingTop

    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            <title>{title}</title>
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#607d8b" strokeWidth="1" />
            <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#607d8b" strokeWidth="1" />
            <path d={path} fill="none" stroke="#4fc3f7" strokeWidth="2" />

            {/* highlight marker for current point */}
            <line x1={hx} y1={y1} x2={hx} y2={y0} stroke="#90a4ae" strokeDasharray="3,3" strokeWidth="1" />
            <line x1={x0} y1={hy} x2={x1} y2={hy} stroke="#90a4ae" strokeDasharray="3,3" strokeWidth="1" />
            <circle cx={hx} cy={hy} r={3} fill="#ffca28" stroke="#ffb300" />

            {/* axis labels */}
            <text x={x0} y={height - 4} fill="#90a4ae" fontSize="10">{formatTimeLabel(minT)}</text>
            <text x={x1 - 56} y={height - 4} fill="#90a4ae" fontSize="10" textAnchor="start">{formatTimeLabel(maxT)}</text>
            <text x={4} y={y0} fill="#90a4ae" fontSize="10" alignmentBaseline="middle">{minAlt.toFixed(1)} km</text>
            <text x={4} y={y1} fill="#90a4ae" fontSize="10" alignmentBaseline="hanging">{maxAlt.toFixed(1)} km</text>

            {/* marker label */}
            <text x={Math.min(x1 - 2, hx + 6)} y={Math.max(y1 + 10, hy - 6)} fill="#ffe082" fontSize="10">
                {formatTimeLabel(latest.t)} · {latest.altKm.toFixed(1)} km
            </text>
        </svg>
    )
}

function InfoBoxOverlay() {
    const { t } = useTranslation()
    const { viewer } = useCesium()
    const [visible, setVisible] = useState(false)
    const [info, setInfo] = useState(null)
    const [altSeries, setAltSeries] = useState([]) // {t, altKm}[]
    const [velocity, setVelocity] = useState(0)
    const [topOffset, setTopOffset] = useState(68)
    const tleData = useConstellationStore((s) => s.tleData)
    const orbitOverrides = useConstellationStore((s) => s.orbitOverrides)
    const setOrbitOverride = useConstellationStore((s) => s.setOrbitOverride)
    const showOrbits = useConstellationStore((s) => s.showOrbits)

    const getConstellationOf = (satName) => {
        for (const [constellation, list] of Object.entries(tleData)) {
            if (list?.some((s) => s.name === satName)) return constellation
        }
        return 'Unknown'
    }

    const getTleByName = (satName) => {
        for (const list of Object.values(tleData)) {
            const found = list?.find((s) => s.name === satName)
            if (found) return found
        }
        return null
    }

    const getNoradByName = (satName) => {
        const tle = getTleByName(satName)
        if (!tle) return null
        if (tle.line2) {
            const toks2 = tle.line2.trim().split(/\s+/)
            const cand2 = toks2[1]
            if (cand2 && /^\d+$/.test(cand2)) return parseInt(cand2, 10)
        }
        if (tle.line1) {
            const toks1 = tle.line1.trim().split(/\s+/)
            const cand1 = toks1[1]?.replace(/\D+/g, '')
            if (cand1) return parseInt(cand1, 10)
        }
        return null
    }

    const lastPosRef = useRef(null)
    const lastTimeRef = useRef(null)

    useEffect(() => {
        const computeOffset = () => {
            const el = document.querySelector('.status-display-container')
            if (!el) { setTopOffset(68); return }
            const rect = el.getBoundingClientRect()
            setTopOffset(Math.max(20, rect.bottom + 12))
        }
        computeOffset()
        window.addEventListener('resize', computeOffset)
        const id = window.setInterval(computeOffset, 1000)
        return () => { window.removeEventListener('resize', computeOffset); window.clearInterval(id) }
    }, [])

    useEffect(() => {
        if (!viewer) return
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

        handler.setInputAction((movement) => {
            const picked = viewer.scene.pick(movement.position)
            if (!picked || !picked.id) { setVisible(false); return }

            const entity = picked.id
            const rawName = entity?.name || 'Unknown'
            const baseName = normalizeEntityName(rawName)
            const constellation = getConstellationOf(baseName)

            const time = viewer.clock.currentTime
            let cartesian
            try { cartesian = entity.position?.getValue(time) } catch (_) { }
            if (!cartesian) { setVisible(false); return }

            const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian)
            const lat = Cesium.Math.toDegrees(cartographic.latitude)
            const lon = Cesium.Math.toDegrees(cartographic.longitude)
            const altKm = cartographic.height / 1000

            const nowSec = Cesium.JulianDate.toDate(time).getTime() / 1000

            setInfo({ name: baseName, constellation, lat, lon, altKm })
            setAltSeries((prev) => {
                const next = [...prev, { t: nowSec, altKm }]
                return next.length > 240 ? next.slice(next.length - 240) : next
            })

            if (lastPosRef.current && lastTimeRef.current != null) {
                const deltaT = Math.max(0.001, nowSec - lastTimeRef.current)
                const d = Cesium.Cartesian3.distance(lastPosRef.current, cartesian)
                setVelocity(d / deltaT)
            }
            lastPosRef.current = cartesian
            lastTimeRef.current = nowSec

            setVisible(true)
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

        handler.setInputAction(() => setVisible(false), Cesium.ScreenSpaceEventType.RIGHT_CLICK)
        const onKey = (e) => { if (e.key === 'Escape') setVisible(false) }
        window.addEventListener('keydown', onKey)

        return () => {
            handler.destroy()
            window.removeEventListener('keydown', onKey)
        }
    }, [viewer, tleData])

    useEffect(() => {
        if (!viewer || !visible || !info) return
        const tick = () => {
            const entities = viewer.entities.values
            const entity = entities.find((en) => en.name === info.name)
            if (!entity || !entity.position) return
            const time = viewer.clock.currentTime
            let cartesian
            try { cartesian = entity.position.getValue(time) } catch (_) { }
            if (!cartesian) return
            const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian)
            const altKm = cartographic.height / 1000
            const lat = Cesium.Math.toDegrees(cartographic.latitude)
            const lon = Cesium.Math.toDegrees(cartographic.longitude)
            const nowSec = Cesium.JulianDate.toDate(time).getTime() / 1000

            setInfo((prev) => (prev ? { ...prev, lat, lon, altKm } : prev))
            setAltSeries((prev) => {
                const next = [...prev, { t: nowSec, altKm }]
                return next.length > 240 ? next.slice(next.length - 240) : next
            })
            if (lastPosRef.current && lastTimeRef.current != null) {
                const deltaT = Math.max(0.001, nowSec - lastTimeRef.current)
                const d = Cesium.Cartesian3.distance(lastPosRef.current, cartesian)
                setVelocity(d / deltaT)
            }
            lastPosRef.current = cartesian
            lastTimeRef.current = nowSec
        }
        const cb = viewer.clock.onTick.addEventListener(tick)
        return () => viewer.clock.onTick.removeEventListener(tick)
    }, [viewer, visible, info])

    if (!visible || !info) return null

    const { name, constellation, lat, lon, altKm } = info
    const overrideValue = orbitOverrides[name]
    const effectiveOrbit = overrideValue !== undefined ? !!overrideValue : !!showOrbits

    const openExternal = () => {
        if (name && name.startsWith('Companion-')) {
            const id = name.split('-')[1] || 'unknown'
            window.open(`/companion/${id}`, '_blank')
            return
        }
        const norad = getNoradByName(name)
        if (norad) {
            window.open(`https://www.n2yo.com/satellite/?s=${norad}`, '_blank')
            return
        }
        const q = encodeURIComponent(name)
        window.open(`https://celestrak.org/satcat/search.php?NAME=${q}`, '_blank')
    }

    return (
        <div
            style={{
                position: 'absolute', right: 20, top: topOffset, width: 360,
                background: 'rgba(22,22,26,0.92)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#e6e6e6', fontSize: 12,
                padding: '12px 14px', zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: 'right' }}>{name}</div>
                <Tooltip title={t('openExternalInfo')}>
                    <button onClick={openExternal} style={{ marginLeft: 8, background: 'transparent', color: '#90caf9', border: '1px solid #90caf9', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>Info ↗</button>
                </Tooltip>
                <div style={{ cursor: 'pointer', color: '#999', marginLeft: 8 }} onClick={() => setVisible(false)}>✕</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>{t('constellation')}: <span style={{ color: '#a5d6a7' }}>{constellation}</span></div>
                <div>{t('orbitDisplay')}: <span style={{ color: effectiveOrbit ? '#81c784' : '#ef9a9a' }}>{effectiveOrbit ? t('statusOn') : t('statusOff')}</span></div>
                <div>{t('latitude')}: {lat.toFixed(3)}°</div>
                <div>{t('longitude')}: {lon.toFixed(3)}°</div>
                <div>{t('altitude')}: {altKm.toFixed(1)} km</div>
                <div>{t('speed')}: {(velocity).toFixed(1)} m/s</div>
            </div>

            <div style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 4, color: '#b0bec5', textAlign: 'right' }}>{t('altitudeHistory')}</div>
                <AltitudeTimeChart series={altSeries} title={t('altitudeHistory')} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <div style={{ color: '#b0bec5' }}>{t('orbitDisplay')}</div>
                <Switch
                    size="small"
                    checked={!!overrideValue ? true : !!overrideValue === false ? false : effectiveOrbit}
                    onChange={(checked) => setOrbitOverride(name, checked)}
                />
            </div>
        </div>
    )
}

export default InfoBoxOverlay
