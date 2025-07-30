import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { LRUCache } from 'lru-cache';

/**
 * A service class for calculating satellite orbital data.
 * This is inspired by satvis's SatelliteProperties and Orbit classes.
 */
class OrbitCalculator {
  constructor() {
    // Initialize an LRU cache to store computed satellite positions.
    // This prevents re-calculating orbits for the same TLE, significantly improving performance.
    this.cache = new LRUCache({ max: 100 }); // Cache up to 100 satellite orbits
  }

  /**
   * Computes a Cesium SampledPositionProperty for a given satellite TLE and time range.
   *
   * @param {object} options - The options for the calculation.
   * @param {string} options.tle - The TLE string for the satellite.
   * @param {Date} options.startTime - The start of the simulation time.
   * @param {Date} options.endTime - The end of the simulation time.
   * @returns {Cesium.SampledPositionProperty} A property object that can be used by Cesium entities.
   */
  computeSampledPosition({ tle, startTime, endTime }) {
    const cacheKey = tle; // The TLE itself is a perfect unique key.
    if (this.cache.has(cacheKey)) {
      console.log(`Cache hit for TLE: ${tle.split('\n')[0]}`);
      return this.cache.get(cacheKey);
    }

    console.log(`Cache miss. Computing orbit for TLE: ${tle.split('\n')[0]}`);
    const tleLines = tle.trim().split('\n');
    const tle1 = tleLines[1];
    const tle2 = tleLines[2];
    const satrec = satellite.twoline2satrec(tle1, tle2);

    const positionProperty = new Cesium.SampledPositionProperty();

    const start = Cesium.JulianDate.fromDate(startTime);
    const stop = Cesium.JulianDate.fromDate(endTime);
    
    const totalSeconds = Cesium.JulianDate.secondsDifference(stop, start);
    const stepInSeconds = 60;
    const numberOfSamples = Math.floor(totalSeconds / stepInSeconds);

    for (let i = 0; i <= numberOfSamples; i++) {
      const time = Cesium.JulianDate.addSeconds(start, i * stepInSeconds, new Cesium.JulianDate());
      const positionAndVelocity = satellite.propagate(satrec, Cesium.JulianDate.toDate(time));
      
      if (positionAndVelocity.position) {
        const positionInEci = new Cesium.Cartesian3(
          positionAndVelocity.position.x * 1000,
          positionAndVelocity.position.y * 1000,
          positionAndVelocity.position.z * 1000
        );

        const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
        if (Cesium.defined(icrfToFixed)) {
          const positionInEcf = Cesium.Matrix3.multiplyByVector(icrfToFixed, positionInEci, new Cesium.Cartesian3());
          positionProperty.addSample(time, positionInEcf);
        }
      }
    }

    this.cache.set(cacheKey, positionProperty);
    return positionProperty;
  }
}

// Export a singleton instance of the calculator
export const orbitCalculator = new OrbitCalculator();
