/**
 * GrowthChart - Constellation growth visualization
 * Shows active, total, and decayed satellites over time
 */
import React, { useState, useEffect } from 'react';
import '../../styles/GrowthChart.css';

// Mock data for demonstration - in production, fetch from API
const generateMockGrowthData = (constellation) => {
  const data = {
    starlink: {
      today: { appeared: 0, decayed: 0, netChange: 0 },
      week: { appeared: 29, decayed: 2, netChange: 27 },
      month: { appeared: 58, decayed: 5, netChange: 53 },
      year: { appeared: 58, decayed: 5, netChange: 53 },
      chartData: generateChartPoints(2019, 11000, 9500),
    },
    gps: {
      today: { appeared: 0, decayed: 0, netChange: 0 },
      week: { appeared: 0, decayed: 0, netChange: 0 },
      month: { appeared: 0, decayed: 0, netChange: 0 },
      year: { appeared: 1, decayed: 0, netChange: 1 },
      chartData: generateChartPoints(1978, 35, 31, true),
    },
    oneweb: {
      today: { appeared: 0, decayed: 0, netChange: 0 },
      week: { appeared: 0, decayed: 0, netChange: 0 },
      month: { appeared: 34, decayed: 0, netChange: 34 },
      year: { appeared: 180, decayed: 2, netChange: 178 },
      chartData: generateChartPoints(2020, 650, 630),
    },
  };
  
  return data[constellation] || data.starlink;
};

// Generate mock chart points
const generateChartPoints = (startYear, total, active, slow = false) => {
  const points = [];
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear + 1;
  
  for (let i = 0; i < years; i++) {
    const year = startYear + i;
    const progress = i / (years - 1);
    const growth = slow 
      ? Math.floor(active * (0.3 + 0.7 * progress))
      : Math.floor(active * Math.pow(progress, 2));
    
    points.push({
      year,
      active: growth,
      total: Math.floor(growth * 1.05),
      decayed: Math.floor(growth * 0.05),
    });
  }
  
  return points;
};

const GrowthChart = ({ constellation }) => {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Simulate API fetch
    const fetchData = async () => {
      // In production: const response = await api.getConstellationStats(constellation);
      const mockData = generateMockGrowthData(constellation);
      setData(mockData);
    };
    
    fetchData();
  }, [constellation]);
  
  if (!data) {
    return <div className="growth-loading">Loading data...</div>;
  }
  
  const formatLink = (count) => (
    <a href="#" className="growth-history-link" onClick={(e) => e.preventDefault()}>
      {count} <span className="link-text">history</span>
    </a>
  );
  
  return (
    <div className="growth-container">
      {/* Summary Table */}
      <div className="growth-summary">
        <h3 className="growth-summary-title">Recent Activity Summary</h3>
        <table className="growth-table">
          <thead>
            <tr>
              <th>Period</th>
              <th className="green">Appeared</th>
              <th className="red">Decayed</th>
              <th className="blue">Net Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Today {new Date().toISOString().split('T')[0]}</td>
              <td className="green">{data.today.appeared}</td>
              <td className="red">{data.today.decayed}</td>
              <td className="blue">{data.today.netChange}</td>
            </tr>
            <tr>
              <td>Week {new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}</td>
              <td className="green">{data.week.appeared}</td>
              <td className="red">{formatLink(data.week.decayed)}</td>
              <td className="blue">{data.week.netChange > 0 ? `-${Math.abs(data.week.netChange)}` : data.week.netChange}</td>
            </tr>
            <tr>
              <td>Month {new Date().toISOString().slice(0, 7)}-01</td>
              <td className="green">{formatLink(data.month.appeared)}</td>
              <td className="red">{formatLink(data.month.decayed)}</td>
              <td className="blue">{data.month.netChange}</td>
            </tr>
            <tr>
              <td>Year {new Date().getFullYear()}-01-01</td>
              <td className="green">{formatLink(data.year.appeared)}</td>
              <td className="red">{formatLink(data.year.decayed)}</td>
              <td className="blue">{data.year.netChange}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* Chart */}
      <div className="growth-chart-container">
        <h3 className="growth-chart-title">Constellation progress</h3>
        <div className="growth-chart">
          <SimpleSVGChart data={data.chartData} />
        </div>
      </div>
    </div>
  );
};

// Simple SVG line chart
const SimpleSVGChart = ({ data }) => {
  if (!data || data.length === 0) return null;
  
  const width = 900;
  const height = 400;
  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxValue = Math.max(...data.map(d => Math.max(d.active, d.total)));
  const minYear = data[0].year;
  const maxYear = data[data.length - 1].year;
  
  const xScale = (year) => padding.left + ((year - minYear) / (maxYear - minYear)) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  
  // Generate path strings
  const generatePath = (key) => {
    return data.map((d, i) => {
      const x = xScale(d.year);
      const y = yScale(d[key]);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };
  
  // Generate Y-axis labels
  const yTicks = [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue].map(v => Math.round(v));
  
  // Generate X-axis labels (every 2 years)
  const xTicks = data.filter((_, i) => i % Math.ceil(data.length / 8) === 0);
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="growth-svg">
      {/* Grid lines */}
      {yTicks.map(tick => (
        <line
          key={tick}
          x1={padding.left}
          y1={yScale(tick)}
          x2={width - padding.right}
          y2={yScale(tick)}
          stroke="rgba(255,255,255,0.1)"
          strokeDasharray="4"
        />
      ))}
      
      {/* Y-axis labels */}
      {yTicks.map(tick => (
        <text
          key={tick}
          x={padding.left - 10}
          y={yScale(tick)}
          textAnchor="end"
          alignmentBaseline="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="12"
        >
          {tick.toLocaleString()}
        </text>
      ))}
      
      {/* X-axis labels */}
      {xTicks.map(d => (
        <text
          key={d.year}
          x={xScale(d.year)}
          y={height - 10}
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="12"
        >
          {d.year}
        </text>
      ))}
      
      {/* Lines */}
      <path
        d={generatePath('total')}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
      />
      <path
        d={generatePath('active')}
        fill="none"
        stroke="#f97316"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      <path
        d={generatePath('decayed')}
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
      />
      
      {/* Legend */}
      <g transform={`translate(${padding.left + 10}, ${padding.top + 10})`}>
        <line x1="0" y1="0" x2="20" y2="0" stroke="#22c55e" strokeWidth="2" />
        <text x="25" y="4" fill="#22c55e" fontSize="11">Total</text>
        
        <line x1="60" y1="0" x2="80" y2="0" stroke="#f97316" strokeWidth="2" strokeDasharray="6 3" />
        <text x="85" y="4" fill="#f97316" fontSize="11">Active</text>
        
        <line x1="130" y1="0" x2="150" y2="0" stroke="#ef4444" strokeWidth="2" />
        <text x="155" y="4" fill="#ef4444" fontSize="11">Decayed</text>
      </g>
    </svg>
  );
};

export default GrowthChart;
