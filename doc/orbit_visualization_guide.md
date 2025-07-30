# Satellite Orbit Visualization User Guide

## Overview

This system has been upgraded to support full satellite orbit visualization, enabling separate display of the orbit ellipse and motion trail. The design architecture references the best practices of the satvis project, providing high-performance orbit calculation and rendering capabilities.

## Features

### 1. Separation of Orbit Types

- **Full Orbit Ellipse**: Displays the complete orbit path of the satellite as a static ellipse.
- **Motion Trail**: Displays the trace of the satellite's movement, which changes dynamically over time.

### 2. Performance Optimization

- **Smart Rendering Strategy**: Automatically selects the optimal rendering method based on the number of satellites and scene mode.
- **LRU Cache System**: Avoids redundant calculation of orbit data for the same TLE.
- **Batch Geometry Rendering**: Uses `PolylineGeometry` to improve performance for a large number of satellites.

### 3. Precise Calculation

- **Based on TLE Data**: Uses satellite.js for precise orbit calculations.
- **Orbital Period Calculation**: Automatically extracts the mean motion from TLE data and calculates the orbital period.
- **Coordinate System Transformation**: Supports ECI and ECF coordinate system transformations.

## How to Use

### 1. Load Satellite Data

1. Select a constellation (e.g., Starlink, OneWeb, Iridium) from the left panel.
2. Select the specific satellites to display.
3. After the satellite data is loaded, it will be displayed as colored dots in the 3D scene.

### 2. Display Full Orbit

1. Find the "Full Orbit" switch in the "Display Settings" panel.
2. Click the switch to enable orbit display.
3. The system will calculate and display the complete orbit ellipse for each satellite.
4. The orbit is displayed as a semi-transparent line with a color corresponding to the constellation color.

### 3. Display Motion Trail

1. Find the "Motion Trail" switch in the "Display Settings" panel.
2. Click the switch to enable trail display.
3. The satellite will display its trajectory line during its movement.
4. The default trail length is 1 hour.

### 4. Combined Use

- You can enable both orbit and trail display simultaneously.
- The orbit displays the static full elliptical path.
- The trail displays the dynamic motion trace.
- Combining both can provide a more intuitive understanding of the satellite's movement patterns.

## Technical Implementation

### Core Components

1. **OrbitCalculator.js**
   - Core service for orbit calculation.
   - Implements orbital period calculation, full orbit calculation, and trail sampling.
   - Provides multi-level cache optimization.

2. **SatelliteOrbitCollection.jsx**
   - High-performance orbit rendering component.
   - Implements smart rendering strategy switching.
   - Manages the lifecycle of Cesium native primitives.

3. **SatelliteEntity.jsx**
   - Individual satellite entity component.
   - Responsible for displaying the satellite point and motion trail.
   - Decoupled from orbit display.

4. **OrbitTrailControl.jsx**
   - User interface control component.
   - Provides separate switches for orbit and trail.
   - Real-time status feedback.

### Performance Optimization Strategies

#### Rendering Strategy Switching

```javascript
// Small number of satellites (≤5) or not in 3D mode
if (satellites.length <= 5 || !is3DMode) {
    // Use Entity + PolylineGraphics
    // Better interactivity and dynamics
} else {
    // Use batch PolylineGeometry
    // Better rendering performance
}
```

#### Caching Mechanism

- **Orbit Cache**: Stores calculated full orbit paths.
- **Trail Cache**: Stores time-related position samples.
- **Parameter Cache**: Stores calculated results such as orbital period.

#### Data Sampling

- **Full Orbit**: 120 points sampled per revolution.
- **Motion Trail**: 1 point sampled per minute.
- Automatic interpolation ensures smooth display.

## Best Practices

### 1. Performance Suggestions

- For a large number of satellites (>20), it is recommended to load them in batches.
- The system will automatically switch to a more efficient rendering method in 2D mode.
- Orbit display consumes fewer resources than trail display.

### 2. Visual Suggestions

- Displaying both orbit and trail can provide a better understanding of satellite motion.
- Orbit colors correspond to constellation colors for easy differentiation.
- You can adjust the viewing angle by zooming.

### 3. Data Suggestions

- Ensure the timeliness of TLE data, as outdated data will affect accuracy.
- Select an appropriate simulation time range.
- The time step setting affects the fineness of the trail.

## Troubleshooting

### Common Issues

1. **Orbit Not Displayed**
   - Check if a satellite has been selected.
   - Confirm that the orbit switch is enabled.
   - Check the browser console for errors.

2. **Performance Issues**
   - Reduce the number of simultaneously displayed satellites.
   - Turn off unnecessary trail displays.
   - Use 3D mode for better performance.

3. **Orbit Calculation Errors**
   - Check if the TLE data format is correct.
   - Confirm that the time settings are reasonable.
   - Check the console for error messages.

### Debugging Information

The system will output the following debugging information in the browser console:
- Orbit calculation cache hits/misses
- Rendering strategy selection
- Error details

## Extension Development

### Adding New Orbit Visualization Options

1. Add new state in `constellationStore.js`.
2. Add UI controls in `OrbitTrailControl.jsx`.
3. Implement rendering logic in `SatelliteOrbitCollection.jsx`.
4. Add calculation methods in `OrbitCalculator.js`.

### Customizing Orbit Styles

```javascript
// Modify in SatelliteOrbitCollection.jsx
const appearance = new Cesium.PolylineColorAppearance({
    translucent: true,
    closed: false,
    // Add custom materials or shaders
});
```

## Summary

The new orbit visualization system provides:
- Precise orbit calculation based on real TLE data.
- High-performance rendering to support large-scale satellite display.
- Flexible control options to meet different needs.
- Good user experience and interactive feedback.

This design fully draws on the architectural concepts of the satvis project, achieving clear layering of orbit calculation, data caching, component management, and user interface, providing a solid foundation for future functional extensions.
