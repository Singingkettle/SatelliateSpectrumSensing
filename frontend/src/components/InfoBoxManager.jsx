import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useCesium } from 'resium';
import { useConstellationStore } from '../store/constellationStore';
import SatelliteInfoBox from './SatelliteInfoBox';
import infoBoxCss from '../styles/SatelliteInfoBox.css?raw';

const InfoBoxManager = () => {
    const { viewer } = useCesium();
    const rootRef = useRef(null);

    const visibleOrbits = useConstellationStore((state) => state.visibleOrbits);
    const toggleOrbitVisibility = useConstellationStore((state) => state.toggleOrbitVisibility);
    const tleData = useConstellationStore((state) => state.tleData);

    useEffect(() => {
        if (!viewer) return;

        const handleSelectedEntityChanged = (selectedEntity) => {
            const frame = viewer.infoBox.frame;

            // Clear previous content and unmount React component if it exists
            if (rootRef.current) {
                rootRef.current.unmount();
                rootRef.current = null;
            }
            frame.src = 'about:blank'; // Reset the iframe

            if (selectedEntity) {
                const handleLoad = () => {
                    frame.removeEventListener('load', handleLoad); // Prevent multiple loads

                    const doc = frame.contentDocument;
                    if (!doc) return;

                    // 1. Inject styles
                    const style = doc.createElement('style');
                    style.textContent = infoBoxCss;
                    doc.head.appendChild(style);

                    // 2. Create a root div for React
                    const reactRootEl = doc.createElement('div');
                    reactRootEl.id = 'react-infobox-root';
                    doc.body.appendChild(reactRootEl);

                    // 3. Find satellite data
                    let satelliteData = null;
                    for (const constellation in tleData) {
                        const sat = tleData[constellation].find(s => s.name === selectedEntity.name);
                        if (sat) {
                            satelliteData = { ...sat, tle: `${sat.name}\n${sat.line1}\n${sat.line2}` };
                            break;
                        }
                    }

                    // 4. Render React component into the iframe
                    if (satelliteData) {
                        const root = createRoot(reactRootEl);
                        rootRef.current = root;
                        root.render(
                            <SatelliteInfoBox
                                satellite={satelliteData}
                                isOrbitVisible={visibleOrbits.has(satelliteData.name)}
                                onToggleOrbit={toggleOrbitVisibility}
                            />
                        );
                    }
                };
                frame.addEventListener('load', handleLoad);
            }
        };

        viewer.selectedEntityChanged.addEventListener(handleSelectedEntityChanged);

        return () => {
            viewer.selectedEntityChanged.removeEventListener(handleSelectedEntityChanged);
        };
    }, [viewer, tleData, visibleOrbits, toggleOrbitVisibility]);

    return null; // This component does not render anything itself
};

export default InfoBoxManager;