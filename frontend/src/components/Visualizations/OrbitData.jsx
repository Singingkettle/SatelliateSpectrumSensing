import React, { useState, useEffect } from 'react';
import { 
  getConstellationAltitudeDistribution, 
  getConstellationInclinationDistribution 
} from '../../api/satelliteApi';
import '../../styles/OrbitData.css';

const OrbitData = ({ constellation }) => {
  const [altitudeData, setAltitudeData] = useState([]);
  const [inclinationData, setInclinationData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [altRes, incRes] = await Promise.all([
          getConstellationAltitudeDistribution(constellation),
          getConstellationInclinationDistribution(constellation)
        ]);
        setAltitudeData(altRes.data);
        setInclinationData(incRes.data);
      } catch (error) {
        console.error("Failed to fetch orbit data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [constellation]);

  if (loading) {
    return <div className="orbit-loading">Loading orbital data...</div>;
  }

  return (
    <div className="orbit-data-container">
      <div className="orbit-section">
        <h3>Altitude Distribution</h3>
        <div className="chart-wrapper">
          <HistogramChart 
            data={altitudeData} 
            xKey="bin_start_km" 
            yKey="count" 
            xLabel="Altitude (km)" 
            color="#4ade80" 
          />
        </div>
      </div>

      <div className="orbit-section">
        <h3>Inclination Distribution</h3>
        <div className="chart-wrapper">
          <HistogramChart 
            data={inclinationData} 
            xKey="inclination" 
            yKey="count" 
            xLabel="Inclination (deg)" 
            color="#60a5fa" 
          />
        </div>
      </div>
    </div>
  );
};

const HistogramChart = ({ data, xKey, yKey, xLabel, color }) => {
  if (!data || data.length === 0) return <div className="no-data">No data available</div>;

  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map(d => d[yKey]));
  
  // Calculate X scale manually based on index since it's a categorical/bin chart
  const barWidth = chartWidth / data.length;
  const gap = Math.max(1, barWidth * 0.1);
  const effectiveBarWidth = barWidth - gap;

  const yScale = (val) => chartHeight - (val / maxValue) * chartHeight;

  // Y Axis Ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(k => Math.round(maxValue * k));
  const uniqueYTicks = [...new Set(yTicks)].sort((a,b) => a-b);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="histogram-svg">
      {/* Grid Lines */}
      {uniqueYTicks.map(tick => (
        <line 
          key={tick}
          x1={padding.left} 
          y1={padding.top + yScale(tick)} 
          x2={width - padding.right} 
          y2={padding.top + yScale(tick)} 
          stroke="rgba(255,255,255,0.1)" 
          strokeDasharray="4"
        />
      ))}

      {/* Bars */}
      {data.map((d, i) => (
        <g key={i} className="bar-group">
          <rect
            x={padding.left + i * barWidth + gap/2}
            y={padding.top + yScale(d[yKey])}
            width={effectiveBarWidth}
            height={(d[yKey] / maxValue) * chartHeight}
            fill={color}
            opacity="0.8"
          />
          {/* Tooltip-like value on hover could be added here, currently just static */}
        </g>
      ))}

      {/* Y Axis Labels */}
      {uniqueYTicks.map(tick => (
        <text 
          key={tick}
          x={padding.left - 10} 
          y={padding.top + yScale(tick)} 
          textAnchor="end" 
          alignmentBaseline="middle" 
          fill="rgba(255,255,255,0.6)" 
          fontSize="12"
        >
          {tick}
        </text>
      ))}

      {/* X Axis Labels (sparse) */}
      {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 10)) === 0).map((d, i, arr) => {
         const originalIndex = data.indexOf(d);
         return (
          <text 
            key={i}
            x={padding.left + originalIndex * barWidth + barWidth/2} 
            y={height - 20} 
            textAnchor="middle" 
            fill="rgba(255,255,255,0.6)" 
            fontSize="12"
          >
            {d[xKey]}
          </text>
        );
      })}

      {/* Axis Title */}
      <text 
        x={width / 2} 
        y={height - 5} 
        textAnchor="middle" 
        fill="rgba(255,255,255,0.4)" 
        fontSize="12"
      >
        {xLabel}
      </text>
    </svg>
  );
};

export default OrbitData;
