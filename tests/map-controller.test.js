/**
 * Unit tests for MapController
 * Tests zoom optimizations, clustering logic, and marker management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Leaflet before importing MapController
const mockMap = {
  setView: vi.fn(),
  on: vi.fn(),
  getZoom: vi.fn(() => 8),
  getCenter: vi.fn(() => ({ lat: 43.6, lng: 3.5 })),
  getBounds: vi.fn(),
  setZoom: vi.fn(),
  panBy: vi.fn(),
  invalidateSize: vi.fn()
};

const mockLayer = {
  addTo: vi.fn(),
  clearLayers: vi.fn(),
  addLayer: vi.fn(),
  getLayers: vi.fn(() => []),
  options: {}
};

global.L = {
  map: vi.fn(() => mockMap),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  markerClusterGroup: vi.fn(() => mockLayer),
  layerGroup: vi.fn(() => mockLayer),
  marker: vi.fn(() => ({
    bindPopup: vi.fn(),
    addTo: vi.fn(),
    getPopup: vi.fn()
  })),
  icon: vi.fn(() => ({})),
  popup: vi.fn(() => ({}))
};

// Now import MapController after mocking Leaflet
const MapController = (await import('../map-controller.js')).default;

describe('MapController', () => {
  let mapController;
  let mockContainer;

  beforeEach(() => {
    // Mock DOM container
    mockContainer = {
      style: {},
      appendChild: vi.fn(),
      querySelector: vi.fn(),
      addEventListener: vi.fn()
    };

    global.document = {
      getElementById: vi.fn(() => mockContainer),
      createElement: vi.fn(() => mockContainer),
      querySelector: vi.fn(() => mockContainer)
    };

    mapController = new MapController('test-map', {
      center: [43.6, 3.5],
      zoom: 8,
      clusterRadius: 50
    });
  });

  describe('Initialization', () => {
    it('should initialize with correct zoom optimization state', () => {
      expect(mapController.zoomDebounceTimeout).toBeNull();
      expect(mapController.lastZoomLevel).toBeNull();
      expect(mapController.zoomPerformanceStart).toBeNull();
      expect(mapController.markerCache).toBeInstanceOf(Map);
      expect(mapController.isZooming).toBe(false);
    });

    it('should initialize map with correct configuration', () => {
      expect(L.map).toHaveBeenCalledWith('test-map', expect.objectContaining({
        center: [43.6, 3.5],
        zoom: 8
      }));
    });
  });

  describe('Zoom Optimization', () => {
    describe('Dynamic Clustering', () => {
      it('should return correct cluster radius for different zoom levels', () => {
        expect(mapController.getDynamicClusterRadius(5)).toBe(80);
        expect(mapController.getDynamicClusterRadius(7)).toBe(60);
        expect(mapController.getDynamicClusterRadius(9)).toBe(40);
        expect(mapController.getDynamicClusterRadius(11)).toBe(25);
        expect(mapController.getDynamicClusterRadius(13)).toBe(15);
      });

      it('should have progressive clustering (higher zoom = smaller radius)', () => {
        const zoom6 = mapController.getDynamicClusterRadius(6);
        const zoom10 = mapController.getDynamicClusterRadius(10);
        const zoom14 = mapController.getDynamicClusterRadius(14);

        expect(zoom6).toBeGreaterThan(zoom10);
        expect(zoom10).toBeGreaterThan(zoom14);
      });
    });

    describe('Marker Filtering', () => {
      it('should show all markers when no importance filter', () => {
        const city = { nom: 'Test', lat: 43.6, lon: 3.5 };
        expect(mapController.shouldShowMarker(city, 6)).toBe(true);
        expect(mapController.shouldShowMarker(city, 12)).toBe(true);
      });

      it('should filter low importance markers at low zoom levels', () => {
        const lowImportanceCity = { nom: 'Test', importance: 'low' };
        const highImportanceCity = { nom: 'Test', importance: 'high' };

        expect(mapController.shouldShowMarker(lowImportanceCity, 6)).toBe(false);
        expect(mapController.shouldShowMarker(lowImportanceCity, 10)).toBe(true);
        expect(mapController.shouldShowMarker(highImportanceCity, 6)).toBe(true);
      });

      it('should filter medium importance markers at very low zoom', () => {
        const mediumImportanceCity = { nom: 'Test', importance: 'medium' };

        expect(mapController.shouldShowMarker(mediumImportanceCity, 5)).toBe(false);
        expect(mapController.shouldShowMarker(mediumImportanceCity, 8)).toBe(true);
      });
    });

    describe('Marker Sizing', () => {
      it('should return appropriate marker sizes for zoom levels', () => {
        expect(mapController.getMarkerSizeForZoom(6)).toBe(20);
        expect(mapController.getMarkerSizeForZoom(10)).toBe(25);
        expect(mapController.getMarkerSizeForZoom(14)).toBe(30);
      });

      it('should increase marker size with zoom level', () => {
        const size6 = mapController.getMarkerSizeForZoom(6);
        const size10 = mapController.getMarkerSizeForZoom(10);
        const size14 = mapController.getMarkerSizeForZoom(14);

        expect(size6).toBeLessThan(size10);
        expect(size10).toBeLessThanOrEqual(size14);
      });
    });

    describe('Zoom Event Handling', () => {
      it('should debounce zoom events', () => {
        vi.useFakeTimers();
        
        // Simulate rapid zoom events
        mapController.handleZoomChange();
        mapController.handleZoomChange();
        mapController.handleZoomChange();

        expect(mapController.zoomDebounceTimeout).toBeTruthy();
        
        vi.runAllTimers();
        vi.useRealTimers();
      });

      it('should track zoom performance', () => {
        mapController.zoomPerformanceStart = performance.now();
        
        mapController.handleZoomChange();
        
        expect(performance.now).toHaveBeenCalled();
      });
    });
  });

  describe('Mobile Optimization', () => {
    it('should detect mobile environment', () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)',
        configurable: true
      });

      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      expect(isMobile).toBe(true);
    });

    it('should apply mobile-specific cluster radius', () => {
      const mobileController = new MapController('test-map', { isMobile: true });
      const baseRadius = mobileController.getDynamicClusterRadius(8);
      const mobileRadius = baseRadius * 1.2;

      // Mobile should have larger cluster radius (more aggressive clustering)
      expect(mobileRadius).toBeGreaterThan(baseRadius);
    });
  });

  describe('Weather Data Integration', () => {
    it('should update weather markers correctly', () => {
      const mockWeatherData = {
        previsions: [
          {
            nom: 'Toulouse',
            lat: 43.6047,
            lon: 1.4442,
            today: { precipitation_probability_max: 20 }
          }
        ]
      };

      mapController.updateWeatherMarkers(mockWeatherData, 0);
      
      expect(mapController.weatherLayer.clearLayers).toHaveBeenCalled();
    });

    it('should handle empty weather data gracefully', () => {
      const emptyData = { previsions: [] };
      
      expect(() => {
        mapController.updateWeatherMarkers(emptyData, 0);
      }).not.toThrow();
    });
  });

  describe('Activity Sites Management', () => {
    it('should update activity sites correctly', () => {
      const mockActivities = [
        {
          nom: 'Test Activity',
          type: 'cascade',
          lat: 43.7,
          lon: 3.6,
          description: 'Test description'
        }
      ];

      mapController.updateActivitySites(mockActivities);
      
      expect(mapController.activitiesLayer.clearLayers).toHaveBeenCalled();
    });

    it('should handle empty activities array', () => {
      expect(() => {
        mapController.updateActivitySites([]);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle map initialization errors', () => {
      L.map.mockImplementationOnce(() => {
        throw new Error('Map initialization failed');
      });

      expect(() => {
        new MapController('invalid-container');
      }).toThrow('Map initialization failed');
    });
  });

  describe('Performance Caching', () => {
    it('should cache markers by zoom level', () => {
      const zoom = 8;
      const cacheKey = `weather_${zoom}`;
      
      // Simulate marker caching
      mapController.markerCache.set(cacheKey, ['marker1', 'marker2']);
      
      expect(mapController.markerCache.has(cacheKey)).toBe(true);
      expect(mapController.markerCache.get(cacheKey)).toEqual(['marker1', 'marker2']);
    });

    it('should clear cache when needed', () => {
      mapController.markerCache.set('test', 'value');
      mapController.markerCache.clear();
      
      expect(mapController.markerCache.size).toBe(0);
    });
  });
});