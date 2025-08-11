# Orbit Visualization Guide (v3.1)

This guide explains how the frontend renders satellite orbits and how to work with the updated UI. The implementation follows satvis-style time-evolving paths using CesiumJS PathGraphics and SampledPositionProperty (reference: [Flowm/satvis](https://github.com/Flowm/satvis)).

## Features
- Time-evolving orbit tracks (PathGraphics) that stay aligned with satellite positions
- Merged constellation/satellite selection panel (compact UI)
- Day/Night lighting (atmosphere + sun/moon + globe lighting)
- View mode toggle (2D/3D)
- Status bar showing loaded count, orbit, day/night, and view mode
- Request-on-demand rendering and scene tuning for smooth animation

## How It Works
- For each selected satellite, we build a SampledPositionProperty from TLE and time (following satvis logic) and attach a PathGraphics component with lead/trail times.
- Cesium interpolates between samples to provide a smooth, time-evolving path.
- The globe uses atmosphere and sun/moon lighting; when lighting is enabled, the day/night terminator is visible.

## UI
- Satellites panel: choose constellations, then pick satellites in tabs (pagination supports up to 1000 per page).
- Display panel:
  - Orbit: show/hide PathGraphics tracks
  - Day/Night: enable/disable globe lighting
  - View: 2D or 3D
- Top-right status bar: shows Loaded (#), Orbit (On/Off), Day/Night (On/Off), View (2D/3D)

## Scene & Lighting
We enable the following for realistic visuals:
- `scene.skyAtmosphere.show = true`
- `scene.sun = new Cesium.Sun(); scene.sun.show = true`
- `scene.moon = new Cesium.Moon(); scene.moon.show = true`
- `scene.light = new Cesium.SunLight()`
- `scene.globe.enableLighting = true` when Day/Night is On
- `scene.requestRenderMode = true`, `maximumRenderTimeChange = 1/30`

Notes:
- Day/Night visuals are a 3D feature; in 2D mode the effect is limited.
- If lighting appears subtle, increase `clock.multiplier` to watch the terminator move faster.

## Performance Considerations
- PathGraphics + SampledPositionProperty is the recommended time-dynamic approach (as in satvis)
- We cap per-frame updates at ~30 FPS and render on demand
- Avoid large numbers of visible orbits in far camera heights; consider hiding orbit tracks when zoomed far out
- Use pagination when selecting large sets of satellites

## Troubleshooting
- No orbit visible: ensure the Orbit toggle is On and satellites are selected
- Day/Night not visible: switch to 3D mode and ensure the Day/Night toggle is On
- View mode errors: we use `scene.morphTo2D/3D(0.5)` for smooth transitions

## References
- satvis orbit/path architecture: [Flowm/satvis](https://github.com/Flowm/satvis)
- CesiumJS PathGraphics & SampledPositionProperty (time-dynamic paths)

## Companion satellites
- Monitoring → Co-orbiting creates a simulated companion by generating a one-shot TLE derived from the target TLE with an along-track offset.
- The companion participates in orbit visibility like normal satellites and can be toggled individually via the InfoBox orbit switch (per-satellite override precedes global state).
- The companion has an internal info page at `/companion/:id`.
