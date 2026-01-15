/**
 * AltitudeHistoryChart - Satellite orbital decay history
 */
import React, { useState, useEffect } from 'react';
import { getSatelliteDecayHistory } from '../../api/satelliteApi';

const AltitudeHistoryChart = ({ noradId }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!noradId) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await getSatelliteDecayHistory(noradId);
        
        // Ensure data is sorted by date
        const sortedData = response.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setData(sortedData);
      } catch (error) {
        console.error("Failed to fetch altitude history", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [noradId]);
  
  if (loading) {
    return <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading history...</div>;
  }
  
  if (data.length === 0) {
    return <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No history data available.</div>;
  }
  
  // Simple SVG chart (avoid recharts ResponsiveContainer issues)
  const width = 360;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data
    .filter(d => d?.date)
    .map(d => ({ date: d.date, altitude: Number(d.altitude_km ?? 0) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const minDate = new Date(points[0].date).getTime();
  const maxDate = new Date(points[points.length - 1].date).getTime();
  const dateSpan = Math.max(1, maxDate - minDate);

  const minAlt = Math.min(...points.map(p => p.altitude));
  const maxAlt = Math.max(...points.map(p => p.altitude));
  const altSpan = Math.max(1, maxAlt - minAlt);

  const xScale = (dateStr) =>
    padding.left + ((new Date(dateStr).getTime() - minDate) / dateSpan) * chartWidth;
  const yScale = (alt) =>
    padding.top + chartHeight - ((alt - minAlt) / altSpan) * chartHeight;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.date)} ${yScale(p.altitude)}`)
    .join(' ');

  const xTickCount = 4;
  const xTicks = points.filter((_, i) =>
    i % Math.max(1, Math.floor(points.length / xTickCount)) === 0
  );

  const yTicks = [0, 0.5, 1].map(k => minAlt + altSpan * k).map(v => Math.round(v));

  return (
    <div style={{ width: '100%', marginTop: 10, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
        {/* Grid */}
        {yTicks.map(tick => (
          <line
            key={tick}
            x1={padding.left}
            y1={yScale(tick)}
            x2={width - padding.right}
            y2={yScale(tick)}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="4"
          />
        ))}

        {/* Y labels */}
        {yTicks.map(tick => (
          <text
            key={tick}
            x={padding.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            alignmentBaseline="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize="10"
          >
            {tick}
          </text>
        ))}

        {/* X labels */}
        {xTicks.map(p => (
          <text
            key={p.date}
            x={xScale(p.date)}
            y={height - 16}
            textAnchor="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize="10"
          >
            {p.date.substring(0, 10)}
          </text>
        ))}

        {/* Line */}
        <path d={linePath} fill="none" stroke="#1DA1F2" strokeWidth="2" />
      </svg>
    </div>
  );
};

export default AltitudeHistoryChart;