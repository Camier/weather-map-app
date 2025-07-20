/**
 * Unit tests for WeatherService
 * Tests API integration, caching, error handling, and timeout logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import WeatherService from '../weather-service.js';

describe('WeatherService', () => {
  let weatherService;
  const mockCities = [
    { nom: 'Toulouse', lat: 43.6047, lon: 1.4442 },
    { nom: 'Marseille', lat: 43.2965, lon: 5.3698 }
  ];

  beforeEach(() => {
    weatherService = new WeatherService({
      timeout: 5000,
      maxRetries: 2,
      cacheDuration: 3600000
    });
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(weatherService.timeout).toBe(5000);
      expect(weatherService.maxRetries).toBe(2);
      expect(weatherService.cacheDuration).toBe(3600000);
    });

    it('should initialize reliability tracking', () => {
      expect(weatherService.reliability).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        lastSuccessTime: null,
        averageResponseTime: 0
      });
    });
  });

  describe('Cache Management', () => {
    it('should cache successful API responses', () => {
      const mockData = {
        previsions: mockCities,
        dates: ['2025-07-20', '2025-07-21'],
        derniere_mise_a_jour: new Date().toISOString()
      };

      weatherService.cacheData(mockData);
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('weather_cache_'),
        expect.stringContaining(JSON.stringify(mockData))
      );
    });

    it('should retrieve cached data when available', () => {
      const mockCachedData = {
        data: { previsions: mockCities },
        timestamp: Date.now(),
        version: 'v1'
      };

      localStorage.getItem.mockReturnValue(JSON.stringify(mockCachedData));
      
      const cachedData = weatherService.getCachedData();
      expect(cachedData).toEqual(mockCachedData.data);
    });

    it('should return null for expired cache', () => {
      const expiredData = {
        data: { previsions: mockCities },
        timestamp: Date.now() - 7200000, // 2 hours ago
        version: 'v1'
      };

      localStorage.getItem.mockReturnValue(JSON.stringify(expiredData));
      
      const cachedData = weatherService.getCachedData();
      expect(cachedData).toBeNull();
    });
  });

  describe('API Integration', () => {
    it('should fetch weather data successfully', async () => {
      const mockApiResponse = {
        time: ['2025-07-20T00:00', '2025-07-21T00:00'],
        temperature_2m_max: [25, 27],
        temperature_2m_min: [15, 17],
        weather_code: [0, 1],
        precipitation_probability_max: [10, 20]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      const result = await weatherService.fetchCityWeather(mockCities[0], new AbortController().signal);
      
      expect(result.success).toBe(true);
      expect(result.city).toEqual(mockCities[0]);
      expect(result.data).toEqual(mockApiResponse);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await weatherService.fetchCityWeather(mockCities[0], new AbortController().signal);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle API timeout', async () => {
      global.fetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);

      const result = await weatherService.fetchCityWeather(mockCities[0], controller.signal);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });
  });

  describe('Data Validation', () => {
    it('should validate correct weather data structure', () => {
      const validData = {
        previsions: mockCities,
        dates: ['2025-07-20', '2025-07-21'],
        derniere_mise_a_jour: new Date().toISOString()
      };

      const isValid = weatherService.validateWeatherData(validData);
      expect(isValid).toBe(true);
    });

    it('should reject invalid weather data', () => {
      const invalidData = {
        previsions: [], // Empty array
        dates: null,
        derniere_mise_a_jour: null
      };

      const isValid = weatherService.validateWeatherData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should validate individual city weather data', () => {
      const validCityData = {
        time: ['2025-07-20T00:00'],
        temperature_2m_max: [25],
        temperature_2m_min: [15],
        weather_code: [0],
        precipitation_probability_max: [10]
      };

      const isValid = weatherService.validateCityWeatherData(validCityData);
      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should fallback to cache on API failure', async () => {
      const mockCachedData = {
        data: { previsions: mockCities },
        timestamp: Date.now(),
        version: 'v1'
      };

      localStorage.getItem.mockReturnValue(JSON.stringify(mockCachedData));
      global.fetch.mockRejectedValue(new Error('API Error'));

      const result = await weatherService.fetchWeatherData(mockCities);
      
      expect(result).toEqual(mockCachedData.data);
      expect(weatherService.reliability.failedRequests).toBe(1);
    });

    it('should throw error when both API and cache fail', async () => {
      localStorage.getItem.mockReturnValue(null);
      global.fetch.mockRejectedValue(new Error('API Error'));

      await expect(weatherService.fetchWeatherData(mockCities))
        .rejects.toThrow('Impossible de récupérer les données météo');
    });
  });

  describe('Performance Tracking', () => {
    it('should track request reliability metrics', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          time: ['2025-07-20T00:00'],
          temperature_2m_max: [25],
          temperature_2m_min: [15],
          weather_code: [0],
          precipitation_probability_max: [10]
        })
      });

      await weatherService.fetchWeatherData([mockCities[0]]);

      expect(weatherService.reliability.totalRequests).toBe(1);
      expect(weatherService.reliability.successfulRequests).toBe(1);
      expect(weatherService.reliability.lastSuccessTime).toBeTruthy();
    });
  });
});