/**
 * SearchModal - Global search modal for satellites
 * Replicates satellitemap.space search functionality
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/SearchModal.css';

const SearchModal = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  
  const setShowSearchModal = useUiStore(s => s.setShowSearchModal);
  const searchResults = useSatelliteStore(s => s.searchResults);
  const searchSatellites = useSatelliteStore(s => s.searchSatellites);
  const selectSatellite = useSatelliteStore(s => s.selectSatellite);
  const clearSearch = useSatelliteStore(s => s.clearSearch);
  const loading = useSatelliteStore(s => s.loading);
  
  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchSatellites(query);
      } else {
        clearSearch();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query, searchSatellites, clearSearch]);
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const handleClose = () => {
    setShowSearchModal(false);
    clearSearch();
  };
  
  const handleSelectResult = (result) => {
    selectSatellite(result.norad_id);
    handleClose();
  };
  
  return (
    <div className="search-modal-overlay" onClick={handleClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="search-input-wrapper">
          <span className="search-input-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            className="search-close-btn"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>
        
        {/* Results */}
        <div className="search-results">
          {loading && (
            <div className="search-loading">
              <span className="search-spinner">⟳</span>
              {t('search.searching')}
            </div>
          )}
          
          {!loading && query.length >= 2 && searchResults.length === 0 && (
            <div className="search-no-results">
              {t('search.noResults')} "{query}"
            </div>
          )}
          
          {!loading && searchResults.map((result) => (
            <div 
              key={result.norad_id}
              className="search-result-item"
              onClick={() => handleSelectResult(result)}
            >
              <div className="search-result-icon">🛰️</div>
              <div className="search-result-info">
                <div className="search-result-name">{result.name}</div>
                <div className="search-result-desc">
                  NORAD: {result.norad_id}
                  {result.constellation && ` • ${result.constellation}`}
                </div>
              </div>
            </div>
          ))}
          
          {query.length < 2 && (
            <div className="search-hint">
              {t('search.placeholder')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
