/**
 * Weather Service Module - Extracted from monolithic code
 * Handles all weather data fetching, validation, and caching
 * 
 * Following scanner.rs refactoring pattern:
 * - Single responsibility: weather data management
 * - Clean interface with error handling
 * - Offline-first architecture
 * - Data validation and reliability tracking
 */

// Constants for better maintainability
const WEATHER_SERVICE_CONSTANTS = {
    DEFAULT_TIMEOUT: 15000,
    MOBILE_TIMEOUT: 8000,
    DEFAULT_MAX_RETRIES: 2,
    CACHE_DURATION: 3600000, // 1 hour
    MAX_CACHE_AGE: 24 * 60 * 60 * 1000, // 24 hours
    API_BASE_URL: 'https://api.open-meteo.com/v1/forecast',
    CACHE_VERSION: 'v1'
};

class WeatherService {
    constructor(options = {}) {
        this.timeout = options.timeout || WEATHER_SERVICE_CONSTANTS.DEFAULT_TIMEOUT;
        this.maxRetries = options.maxRetries || WEATHER_SERVICE_CONSTANTS.DEFAULT_MAX_RETRIES;
        this.cacheDuration = options.cacheDuration || WEATHER_SERVICE_CONSTANTS.CACHE_DURATION;
        this.reliability = {
            successCount: 0,
            totalRequests: 0,
            lastUpdate: null,
            dataSource: 'unknown'
        };
        
        // Initialize storage for offline caching
        this.storageKey = `weather-cache-${WEATHER_SERVICE_CONSTANTS.CACHE_VERSION}`;
        this.initializeStorage();
    }

    /**
     * Initialize local storage for offline caching
     * @private
     */
    initializeStorage() {
        try {
            const cached = localStorage.getItem(this.storageKey);
            if (cached) {
                const data = JSON.parse(cached);
                if (this.isDataFresh(data.timestamp)) {
                    console.log('WeatherService: Found fresh cached data');
                }
            }
        } catch (error) {
            console.warn('WeatherService: Storage initialization failed:', error);
        }
    }

    /**
     * Main interface for fetching weather data
     * @param {Array} cities - Array of city objects with lat/lon
     * @returns {Promise<Object>} Weather data with reliability metadata
     */
    async fetchWeatherData(cities) {
        const startTime = Date.now();
        this.reliability.totalRequests++;
        
        try {
            // Try to get cached data first if offline
            if (!navigator.onLine) {
                const cachedData = this.getCachedData();
                if (cachedData) {
                    console.log('WeatherService: Using cached data (offline)');
                    return this.formatResponse(cachedData, 'cache-offline');
                }
                throw new Error('Pas de données météo disponibles hors ligne');
            }

            // Fetch fresh data from API
            const weatherData = await this.fetchFromAPI(cities);
            
            // Cache successful response
            this.cacheData(weatherData);
            
            // Update reliability metrics
            this.reliability.successCount++;
            this.reliability.lastUpdate = Date.now();
            this.reliability.dataSource = 'api';
            
            const processingTime = Date.now() - startTime;
            console.log(`WeatherService: Fresh data loaded in ${processingTime}ms`);
            
            return this.formatResponse(weatherData, 'api');
            
        } catch (error) {
            console.error('WeatherService: API failed, trying cache:', error.message);
            
            // Fallback to cached data
            const cachedData = this.getCachedData();
            if (cachedData && this.isDataReasonable(cachedData)) {
                console.log('WeatherService: Using cached data as fallback');
                return this.formatResponse(cachedData, 'cache-fallback');
            }
            
            // No fallback available
            this.reliability.dataSource = 'error';
            throw new Error('Aucune donnée météo disponible. Vérifiez votre connexion internet.');
        }
    }

    /**
     * Fetch weather data from Open-Meteo API with enhanced timeout handling
     * @private
     * @param {Array} cities - Array of city objects
     * @returns {Promise<Object>} Raw weather data
     */
    async fetchFromAPI(cities) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn('WeatherService: API timeout after', this.timeout, 'ms');
            controller.abort();
        }, this.timeout);
        
        try {
            // Add overall timeout promise to ensure we don't hang
            const fetchPromise = this.fetchCitiesWithTimeout(cities, controller.signal);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout global: API trop lente')), this.timeout + 1000);
            });
            
            const results = await Promise.race([fetchPromise, timeoutPromise]);
            
            clearTimeout(timeoutId);
            
            // Validate results
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            
            if (successful.length === 0) {
                throw new Error('Aucune ville n\'a retourné de données valides');
            }
            
            if (failed.length > 0) {
                console.warn(`WeatherService: ${failed.length} cities failed:`, 
                    failed.map(f => f.city.nom));
            }
            
            // Transform to usable format
            return this.transformAPIResponse(successful, failed, cities);
            
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Timeout: Serveurs météo trop lents');
            }
            throw error;
        }
    }

    /**
     * Fetch cities with timeout wrapper
     * @private
     */
    async fetchCitiesWithTimeout(cities, signal) {
        // Create parallel requests for all cities
        const promises = cities.map(city => this.fetchCityWeather(city, signal));
        return await Promise.all(promises);
    }

    /**
     * Fetch weather for a single city
     * @private
     * @param {Object} city - City object with lat/lon
     * @param {AbortSignal} signal - Abort signal for timeout
     * @returns {Promise<Object>} City weather result
     */
    async fetchCityWeather(city, signal) {
        try {
            const params = new URLSearchParams({
                latitude: city.lat,
                longitude: city.lon,
                daily: [
                    'weather_code',
                    'precipitation_sum',
                    'precipitation_hours',
                    'precipitation_probability_max',
                    'temperature_2m_max',
                    'temperature_2m_min',
                    'sunrise',
                    'sunset',
                    'uv_index_max',
                    'wind_speed_10m_max',
                    'wind_gusts_10m_max',
                    'wind_direction_10m_dominant'
                ].join(','),
                timezone: 'Europe/Paris',
                forecast_days: '7'
            });
            
            const url = `${WEATHER_SERVICE_CONSTANTS.API_BASE_URL}?${params}`;
            const response = await fetch(url, { signal });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Validate response structure and data integrity
            if (!data.daily || !data.daily.time || !Array.isArray(data.daily.time)) {
                throw new Error('Format de données invalide');
            }
            
            // Validate essential data fields exist
            const requiredFields = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'];
            for (const field of requiredFields) {
                if (!data.daily[field] || !Array.isArray(data.daily[field])) {
                    throw new Error(`Données météo incomplètes: ${field} manquant`);
                }
            }
            
            // Validate data array lengths match
            const timeLength = data.daily.time.length;
            if (data.daily.weather_code.length !== timeLength || 
                data.daily.temperature_2m_max.length !== timeLength) {
                throw new Error('Données météo corrompues: longueurs d\'array incohérentes');
            }
            
            return {
                city,
                data: data.daily,
                success: true,
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                city,
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Transform API response to internal format
     * @private
     * @param {Array} successful - Successful city results
     * @param {Array} failed - Failed city results
     * @param {Array} allCities - All cities requested
     * @returns {Object} Transformed weather data
     */
    transformAPIResponse(successful, failed, allCities) {
        const dates = successful[0].data.time;
        const weatherByDay = [];
        
        for (let dayIndex = 0; dayIndex < Math.min(dates.length, 7); dayIndex++) {
            const forecasts = allCities.map(city => {
                const result = successful.find(r => r.city.nom === city.nom);
                
                if (result && result.data) {
                    const d = result.data;
                    return {
                        nom: city.nom,
                        lat: city.lat,
                        lon: city.lon,
                        precipitation: d.precipitation_sum[dayIndex] || 0,
                        precipitation_hours: d.precipitation_hours[dayIndex] || 0,
                        precipitation_probability: d.precipitation_probability_max[dayIndex] || 0,
                        temp_max: d.temperature_2m_max[dayIndex],
                        temp_min: d.temperature_2m_min[dayIndex],
                        wind_speed: d.wind_speed_10m_max[dayIndex] || 0,
                        wind_gusts: d.wind_gusts_10m_max[dayIndex] || 0,
                        wind_direction: d.wind_direction_10m_dominant[dayIndex] || 0,
                        uv_index: d.uv_index_max[dayIndex] || 0,
                        weather_code: d.weather_code[dayIndex] || 0,
                        lever_soleil: d.sunrise[dayIndex],
                        coucher_soleil: d.sunset[dayIndex],
                        donnees_disponibles: true,
                        fiabilite: 'haute'
                    };
                } else {
                    const failedResult = failed.find(f => f.city.nom === city.nom);
                    return {
                        nom: city.nom,
                        lat: city.lat,
                        lon: city.lon,
                        donnees_disponibles: false,
                        erreur: failedResult ? failedResult.error : 'Données non disponibles',
                        fiabilite: 'nulle'
                    };
                }
            });
            
            weatherByDay.push({
                date: dates[dayIndex],
                previsions: forecasts
            });
        }
        
        return {
            data: weatherByDay,
            metadata: {
                source: 'api',
                timestamp: Date.now(),
                successRate: (successful.length / allCities.length) * 100,
                citiesWithData: successful.length,
                totalCities: allCities.length,
                failedCities: failed.map(f => f.city.nom)
            }
        };
    }

    /**
     * Cache weather data to localStorage
     * @private
     * @param {Object} weatherData - Weather data to cache
     */
    cacheData(weatherData) {
        try {
            const cacheObject = {
                data: weatherData,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(cacheObject));
            console.log('WeatherService: Data cached successfully');
            
        } catch (error) {
            console.warn('WeatherService: Failed to cache data:', error);
        }
    }

    /**
     * Get cached weather data
     * @private
     * @returns {Object|null} Cached data or null
     */
    getCachedData() {
        try {
            const cached = localStorage.getItem(this.storageKey);
            if (!cached) return null;
            
            const cacheObject = JSON.parse(cached);
            
            // Check if data is reasonably fresh (within 24 hours)
            const age = Date.now() - cacheObject.timestamp;
            if (age > WEATHER_SERVICE_CONSTANTS.MAX_CACHE_AGE) {
                console.log('WeatherService: Cached data too old, discarding');
                localStorage.removeItem(this.storageKey);
                return null;
            }
            
            return cacheObject.data;
            
        } catch (error) {
            console.warn('WeatherService: Failed to read cache:', error);
            return null;
        }
    }

    /**
     * Check if cached data is fresh enough for primary use
     * @private
     * @param {number} timestamp - Data timestamp
     * @returns {boolean} True if data is fresh
     */
    isDataFresh(timestamp) {
        const age = Date.now() - timestamp;
        return age < this.cacheDuration;
    }

    /**
     * Validate that cached data contains reasonable values
     * @private
     * @param {Object} data - Weather data to validate
     * @returns {boolean} True if data seems reasonable
     */
    isDataReasonable(data) {
        if (!data || !data.data || !Array.isArray(data.data)) {
            return false;
        }
        
        try {
            // Check first day's data for sanity
            const firstDay = data.data[0];
            if (!firstDay || !firstDay.previsions) {
                return false;
            }
            
            // Validate temperature ranges are reasonable for Southern France
            const validForecasts = firstDay.previsions.filter(p => 
                p.donnees_disponibles &&
                p.temp_max >= -10 && p.temp_max <= 50 &&
                p.temp_min >= -20 && p.temp_min <= 40 &&
                p.temp_min <= p.temp_max
            );
            
            return validForecasts.length > 0;
            
        } catch (error) {
            console.warn('WeatherService: Data validation failed:', error);
            return false;
        }
    }

    /**
     * Format response with metadata
     * @private
     * @param {Object} weatherData - Weather data
     * @param {string} source - Data source identifier
     * @returns {Object} Formatted response
     */
    formatResponse(weatherData, source) {
        const metadata = weatherData.metadata || {};
        const age = metadata.timestamp ? Date.now() - metadata.timestamp : 0;
        
        return {
            data: weatherData.data,
            metadata: {
                ...metadata,
                source,
                age,
                reliability: this.getReliabilityScore(),
                lastUpdate: this.reliability.lastUpdate,
                isStale: age > this.cacheDuration,
                userWarning: this.getUserWarning(source, age)
            }
        };
    }

    /**
     * Calculate reliability score
     * @private
     * @returns {number} Reliability score 0-100
     */
    getReliabilityScore() {
        if (this.reliability.totalRequests === 0) return 0;
        return Math.round((this.reliability.successCount / this.reliability.totalRequests) * 100);
    }

    /**
     * Get user warning based on data source and age
     * @private
     * @param {string} source - Data source
     * @param {number} age - Data age in milliseconds
     * @returns {Object|null} Warning object or null
     */
    getUserWarning(source, age) {
        if (source === 'cache-offline') {
            const hours = Math.floor(age / (60 * 60 * 1000));
            return {
                level: 'warning',
                message: `Mode hors ligne - Données de il y a ${hours}h`,
                icon: '📵'
            };
        }
        
        if (source === 'cache-fallback') {
            const hours = Math.floor(age / (60 * 60 * 1000));
            return {
                level: 'warning',
                message: `Serveurs météo indisponibles - Données de il y a ${hours}h`,
                icon: '⚠️'
            };
        }
        
        if (source === 'api' && age > this.cacheDuration) {
            return {
                level: 'info',
                message: 'Données fraîches des serveurs officiels',
                icon: '✅'
            };
        }
        
        return null;
    }

    /**
     * Clear all cached data
     * @public
     */
    clearCache() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('WeatherService: Cache cleared');
            return true;
        } catch (error) {
            console.error('WeatherService: Failed to clear cache:', error);
            return false;
        }
    }

    /**
     * Get service statistics
     * @public
     * @returns {Object} Service statistics
     */
    getStats() {
        return {
            reliability: this.reliability,
            cacheStatus: this.getCacheStatus(),
            connectionStatus: navigator.onLine ? 'online' : 'offline'
        };
    }

    /**
     * Get cache status information
     * @private
     * @returns {Object} Cache status
     */
    getCacheStatus() {
        try {
            const cached = localStorage.getItem(this.storageKey);
            if (!cached) {
                return { hasCache: false };
            }
            
            const cacheObject = JSON.parse(cached);
            const age = Date.now() - cacheObject.timestamp;
            
            return {
                hasCache: true,
                age,
                isFresh: this.isDataFresh(cacheObject.timestamp),
                size: cached.length
            };
        } catch (error) {
            return { hasCache: false, error: error.message };
        }
    }
}

// Export for use in main application
export default WeatherService;