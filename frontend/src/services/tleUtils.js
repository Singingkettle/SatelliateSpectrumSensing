// frontend/src/services/tleUtils.js

// Earth gravitational parameter in km^3/s^2
const MU_EARTH_KM3_S2 = 398600.4418

function toNumber(str) {
    const n = parseFloat(String(str).trim())
    return Number.isFinite(n) ? n : 0
}

function computeSemiMajorAxisKmFromMeanMotion(meanMotionRevsPerDay) {
    const n_rad_s = (meanMotionRevsPerDay * 2 * Math.PI) / 86400
    const a_cuberoot = MU_EARTH_KM3_S2 ** (1 / 3)
    const a = a_cuberoot / (n_rad_s ** (2 / 3))
    return a
}

function normAngleDeg(x) {
    let a = x % 360
    if (a < 0) a += 360
    return a
}

function padLeft(str, len) {
    const s = String(str)
    if (s.length >= len) return s.slice(0, len)
    return ' '.repeat(len - s.length) + s
}

function setField(line, start1, end1, valueStr) {
    const start = start1 - 1
    const end = end1 // exclusive in slice
    const left = line.slice(0, start)
    const field = padLeft(valueStr, end1 - start1 + 1)
    const right = line.slice(end)
    return left + field + right
}

function computeChecksum(line) {
    // sum of digits + count of '-' across columns 1-68 (index 0..67)
    const body = line.slice(0, 68)
    let sum = 0
    for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48
        if (ch === '-') sum += 1
    }
    return String(sum % 10)
}

function withChecksum(line) {
    let s = line
    if (s.length < 69) s = s.padEnd(69, ' ')
    const checksum = computeChecksum(s)
    return s.slice(0, 68) + checksum
}

export function createCompanionTle({ name, targetTleLines, distanceKm }) {
    if (!targetTleLines || targetTleLines.length < 3) return null
    const [_, l1, l2] = targetTleLines

    // Parse mean motion (cols 53-63) and mean anomaly (cols 44-51)
    const meanMotionStr = l2.slice(52, 63)
    const meanAnomalyStr = l2.slice(43, 51)
    const meanMotion = toNumber(meanMotionStr)
    const meanAnomaly = toNumber(meanAnomalyStr)

    const a_km = computeSemiMajorAxisKmFromMeanMotion(meanMotion) || 6800
    const deltaDeg = (Number(distanceKm) > 0 ? (Number(distanceKm) / a_km) * (180 / Math.PI) : 0.0)
    const newM = normAngleDeg(meanAnomaly + deltaDeg)

    // Build new name line and line2 with updated M, recompute checksum
    const newName = name || 'Companion'
    let newL1 = l1
    let newL2 = setField(l2, 44, 51, newM.toFixed(4))
    newL2 = withChecksum(newL2)

    return `${newName}\n${newL1}\n${newL2}`
}
