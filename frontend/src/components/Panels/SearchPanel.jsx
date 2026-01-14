/**
 * SearchPanel - Search for satellites by name or NORAD ID
 */
import React, { useState, useCallback } from 'react';
import { Input, List, Typography, Spin, Empty, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import debounce from 'lodash.debounce';
import { useSatelliteStore, CONSTELLATION_COLORS } from '../../store/satelliteStore';
import '../../styles/SearchPanel.css';

const { Text } = Typography;
const { Search } = Input;

const SearchPanel = () => {
  const [localQuery, setLocalQuery] = useState('');
  
  const searchResults = useSatelliteStore(s => s.searchResults);
  const searchQuery = useSatelliteStore(s => s.searchQuery);
  const loading = useSatelliteStore(s => s.loading);
  const searchSatellites = useSatelliteStore(s => s.searchSatellites);
  const selectSatellite = useSatelliteStore(s => s.selectSatellite);
  const clearSearch = useSatelliteStore(s => s.clearSearch);
  
  // Debounced search function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query) => {
      searchSatellites(query);
    }, 300),
    [searchSatellites]
  );
  
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalQuery(value);
    
    if (value.length >= 2) {
      debouncedSearch(value);
    } else {
      clearSearch();
    }
  };
  
  const handleSelect = (satellite) => {
    selectSatellite(satellite.norad_id);
  };
  
  const renderResult = (item) => {
    const color = CONSTELLATION_COLORS[item.constellation_id] || CONSTELLATION_COLORS.default;
    
    return (
      <List.Item
        className="search-result-item"
        onClick={() => handleSelect(item)}
      >
        <div className="result-content">
          <div className="result-header">
            <Text strong>{item.name}</Text>
            {item.constellation && (
              <Tag color={color.hex} size="small">
                {item.constellation?.name || item.constellation_id}
              </Tag>
            )}
          </div>
          
          <div className="result-meta">
            <Text type="secondary">NORAD: {item.norad_id}</Text>
            {item.inclination && (
              <Text type="secondary">Inc: {item.inclination.toFixed(1)}°</Text>
            )}
            {item.period_minutes && (
              <Text type="secondary">Period: {item.period_minutes.toFixed(1)} min</Text>
            )}
          </div>
        </div>
      </List.Item>
    );
  };
  
  return (
    <div className="search-panel">
      <div className="panel-header">
        <Text strong>Search Satellites</Text>
      </div>
      
      <Search
        placeholder="Search by name or NORAD ID..."
        value={localQuery}
        onChange={handleSearchChange}
        prefix={<SearchOutlined />}
        allowClear
        onClear={clearSearch}
        className="search-input"
      />
      
      {loading && (
        <div className="search-loading">
          <Spin size="small" />
          <Text type="secondary">Searching...</Text>
        </div>
      )}
      
      {!loading && searchQuery && searchResults.length === 0 && (
        <Empty
          description={`No satellites found for "${searchQuery}"`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
      
      {searchResults.length > 0 && (
        <List
          className="search-results"
          dataSource={searchResults}
          renderItem={renderResult}
          size="small"
        />
      )}
      
      {!searchQuery && (
        <div className="search-hint">
          <Text type="secondary">
            Enter at least 2 characters to search.
            <br />
            Search by satellite name or NORAD ID.
          </Text>
        </div>
      )}
    </div>
  );
};

export default React.memo(SearchPanel);
