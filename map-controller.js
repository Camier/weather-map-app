/**
 * Map Controller Module - Extracted from monolithic code
 * Handles all Leaflet map interactions, markers, and layers
 * 
 * Following scanner.rs refactoring pattern:
 * - Single responsibility: map visualization and interaction
 * - Clean separation from UI state and weather data
 * - Mobile-optimized map controls and markers
 * - Clustered markers for performance
 */

import WeatherConditions from './weather-conditions.js';

class MapController {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.weatherConditions = new WeatherConditions();
        this.options = {
            center: options.center || [43.7, 3.5],
            zoom: options.zoom || 7,
            maxZoom: options.maxZoom || 18,
            clusterRadius: options.clusterRadius || 50,
            ...options
        };
        
        // Map and layer references
        this.map = null;
        this.baseLayers = {};
        this.overlayLayers = {};
        
        // Data layers
        this.weatherLayer = L.layerGroup();
        this.activitiesLayer = L.markerClusterGroup({
            chunkedLoading: true,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            maxClusterRadius: this.options.clusterRadius
        });
        this.routeLayer = L.layerGroup();
        
        // State
        this.currentWeatherData = null;
        this.currentDayIndex = 0;
        this.showOnlyDry = false;
        this.activeActivities = [];
        this.visibleActivities = new Set();
        
        // Event handlers storage
        this.eventHandlers = new Map();
        
        // Zoom optimization state
        this.zoomDebounceTimeout = null;
        this.lastZoomLevel = null;
        this.zoomPerformanceStart = null;
        this.markerCache = new Map(); // Cache markers by zoom level
        this.isZooming = false;
        
        this.initializeMap();
        this.setupEventListeners();
    }
    
    /**
     * Initialize the Leaflet map
     * @private
     */
    initializeMap() {
        try {
            // Create map with mobile-optimized settings
            this.map = L.map(this.containerId, {
                center: this.options.center,
                zoom: this.options.zoom,
                zoomControl: false,
                tap: true,
                touchZoom: true,
                doubleClickZoom: true,
                scrollWheelZoom: true,
                boxZoom: false // Disabled for mobile
            });
            
            // Add zoom control in bottom-right
            L.control.zoom({ position: 'bottomright' }).addTo(this.map);
            
            // Setup base layers
            this.setupBaseLayers();
            
            // Add data layers to map
            this.map.addLayer(this.weatherLayer);
            this.map.addLayer(this.activitiesLayer);
            this.map.addLayer(this.routeLayer);
            
            console.log('MapController: Map initialized successfully');
            
        } catch (error) {
            console.error('MapController: Failed to initialize map:', error);
            throw new Error('Impossible d\'initialiser la carte');
        }
    }
    
    /**
     * Setup base map layers
     * @private
     */
    setupBaseLayers() {
        // CartoDB Voyager - clean and mobile-friendly
        this.baseLayers.carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© CARTO © OpenStreetMap contributors',
            subdomains: 'abcd',
            maxZoom: this.options.maxZoom
        });
        
        // OpenStreetMap fallback
        this.baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: this.options.maxZoom
        });
        
        // Satellite imagery for outdoor activities
        this.baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: this.options.maxZoom
        });
        
        // Add default layer
        this.baseLayers.carto.addTo(this.map);
        
        // Add layer control if multiple base layers
        if (Object.keys(this.baseLayers).length > 1) {
            L.control.layers(this.baseLayers, this.overlayLayers, {
                position: 'topright',
                collapsed: true
            }).addTo(this.map);
        }
    }
    
    /**
     * Setup event listeners
     * @private
     */
    setupEventListeners() {
        // Map click events
        this.map.on('click', (e) => {
            this.emit('mapClicked', { 
                latlng: e.latlng,
                containerPoint: e.containerPoint 
            });
        });
        
        // Map zoom events with debouncing and optimization
        this.map.on('zoomstart', () => {
            this.isZooming = true;
            this.zoomPerformanceStart = performance.now();
        });
        
        this.map.on('zoomend', () => {
            clearTimeout(this.zoomDebounceTimeout);
            this.zoomDebounceTimeout = setTimeout(() => {
                this.handleZoomChange();
            }, 100); // 100ms debounce for smooth performance
        });
        
        // Map move events (throttled)
        let moveTimeout;
        this.map.on('moveend', () => {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                this.emit('mapMoved', {
                    center: this.map.getCenter(),
                    bounds: this.map.getBounds(),
                    zoom: this.map.getZoom()
                });
            }, 150);
        });
        
        // Handle map resize for mobile orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        });
        
        window.addEventListener('resize', () => {
            this.map.invalidateSize();
        });
        
        // Enhanced mobile touch optimization
        this.setupMobileTouchOptimization();
    }
    
    /**
     * Setup mobile-specific touch optimizations for better zoom handling
     * @private
     */
    setupMobileTouchOptimization() {
        // Detect mobile device
        const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
        
        if (!isMobile) return; // Skip optimization for desktop
        
        let touchStartZoom = null;
        let touchZoomTimeout = null;
        
        // Enhanced touch zoom handling for mobile
        this.map.on('touchstart', () => {
            touchStartZoom = this.map.getZoom();
            clearTimeout(touchZoomTimeout);
        });
        
        this.map.on('touchend', () => {
            // Stabilize viewport after touch gestures
            touchZoomTimeout = setTimeout(() => {
                const currentZoom = this.map.getZoom();
                
                // If zoom changed significantly during touch, trigger optimization
                if (touchStartZoom && Math.abs(touchStartZoom - currentZoom) > 0.5) {
                    this.optimizeForMobileZoom(currentZoom);
                }
                
                touchStartZoom = null;
            }, 200); // Wait for touch momentum to settle
        });
        
        // Optimize pan performance on mobile
        let panTimeout;
        this.map.on('dragend', () => {
            clearTimeout(panTimeout);
            panTimeout = setTimeout(() => {
                // Refresh markers if we've moved significantly
                this.refreshMarkersForZoom(this.map.getZoom());
            }, 300);
        });
        
        // Prevent zoom on double-tap for better control
        this.map.doubleClickZoom.disable();
        
        // Add custom double-tap zoom with better control
        let lastTap = 0;
        this.map.on('click', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                // Double tap detected - zoom in centered on tap
                const currentZoom = this.map.getZoom();
                this.map.setZoomAround(e.latlng, Math.min(currentZoom + 1, this.options.maxZoom));
            }
            lastTap = now;
        });
    }
    
    /**
     * Optimize display for mobile zoom level
     * @private
     * @param {number} zoom - Current zoom level
     */
    optimizeForMobileZoom(zoom) {
        // Reduce marker density on mobile for better performance
        if (zoom <= 7) {
            // Very aggressive filtering on mobile when zoomed out
            this.weatherLayer.eachLayer(layer => {
                const marker = layer;
                if (marker.city && marker.city.importance !== 'high') {
                    marker.setOpacity(0.6); // Make less important markers more transparent
                }
            });
        } else {
            // Restore full opacity when zoomed in
            this.weatherLayer.eachLayer(layer => {
                layer.setOpacity(1.0);
            });
        }
        
        // Adjust clustering aggressiveness on mobile
        const mobileClusterRadius = this.getDynamicClusterRadius(zoom) * 1.2; // More aggressive clustering on mobile
        if (this.activitiesLayer.options.maxClusterRadius !== mobileClusterRadius) {
            this.activitiesLayer.options.maxClusterRadius = mobileClusterRadius;
        }
    }
    
    /**
     * Handle zoom changes with optimizations and debouncing
     * @private
     */
    handleZoomChange() {
        const currentZoom = this.map.getZoom();
        
        // Skip if zoom level hasn't actually changed
        if (this.lastZoomLevel === currentZoom) {
            this.isZooming = false;
            return;
        }
        
        // Performance tracking
        if (this.zoomPerformanceStart) {
            const zoomTime = performance.now() - this.zoomPerformanceStart;
            console.log(`Zoom to level ${currentZoom}: ${zoomTime.toFixed(1)}ms`);
        }
        
        // Update clustering radius dynamically
        this.updateClusteringRadius(currentZoom);
        
        // Refresh markers with zoom-appropriate filtering
        this.refreshMarkersForZoom(currentZoom);
        
        // Emit zoom event
        this.emit('mapZoomed', { 
            zoom: currentZoom,
            bounds: this.map.getBounds(),
            zoomChanged: this.lastZoomLevel !== currentZoom,
            previousZoom: this.lastZoomLevel
        });
        
        this.lastZoomLevel = currentZoom;
        this.isZooming = false;
    }
    
    /**
     * Get dynamic clustering radius based on zoom level
     * @private
     * @param {number} zoom - Current zoom level
     * @returns {number} Appropriate cluster radius
     */
    getDynamicClusterRadius(zoom) {
        if (zoom <= 6) return 80;      // More clustering when zoomed out
        if (zoom <= 8) return 60;
        if (zoom <= 10) return 40;
        if (zoom <= 12) return 25;
        return 15;                     // Less clustering when zoomed in
    }
    
    /**
     * Update clustering radius based on zoom level
     * @private
     * @param {number} zoom - Current zoom level
     */
    updateClusteringRadius(zoom) {
        const newRadius = this.getDynamicClusterRadius(zoom);
        
        // Update activity cluster radius if it's changed significantly
        if (Math.abs(this.activitiesLayer.options.maxClusterRadius - newRadius) > 5) {
            this.activitiesLayer.options.maxClusterRadius = newRadius;
            
            // Force cluster refresh by temporarily clearing and re-adding
            const activities = this.activitiesLayer.getLayers();
            this.activitiesLayer.clearLayers();
            activities.forEach(layer => this.activitiesLayer.addLayer(layer));
        }
    }
    
    /**
     * Determine if marker should be shown at current zoom level
     * @private
     * @param {Object} city - City data
     * @param {number} zoom - Current zoom level
     * @returns {boolean} Whether to show marker
     */
    shouldShowMarker(city, zoom) {
        // Always show markers if we don't have importance data
        if (!city.importance) {
            // Classify based on available data
            city.importance = this.classifyMarkerImportance(city);
        }
        
        // Zoom-based filtering for better performance and clarity
        if (zoom <= 6) return city.importance === 'high';           // Only major cities when very zoomed out
        if (zoom <= 8) return city.importance !== 'low';           // Skip minor locations
        if (zoom <= 10) return true;                               // Show most markers
        return true;                                               // Show all markers when zoomed in
    }
    
    /**
     * Classify marker importance based on city data
     * @private
     * @param {Object} city - City data
     * @returns {string} Importance level: 'high', 'medium', 'low'
     */
    classifyMarkerImportance(city) {
        // Use multiple factors to determine importance
        const population = city.population || 0;
        const isCapital = city.type === 'capital' || city.capital;
        const isCoastal = city.coastal || (city.distance_to_coast && city.distance_to_coast < 10);
        
        // High importance: capitals, large cities, important coastal cities
        if (isCapital || population > 100000 || (isCoastal && population > 50000)) {
            return 'high';
        }
        
        // Medium importance: mid-size cities, coastal towns
        if (population > 20000 || isCoastal) {
            return 'medium';
        }
        
        // Low importance: small towns
        return 'low';
    }
    
    /**
     * Get marker size based on zoom level
     * @private
     * @param {number} zoom - Current zoom level
     * @returns {number} Marker size in pixels
     */
    getMarkerSizeForZoom(zoom) {
        const baseSize = 36;
        
        if (zoom <= 6) return Math.max(24, baseSize * 0.75);      // Smaller when zoomed out
        if (zoom <= 8) return Math.max(28, baseSize * 0.85);
        if (zoom >= 12) return Math.min(48, baseSize * 1.2);      // Larger when zoomed in
        return baseSize;                                          // Normal size for mid-range zoom
    }
    
    /**
     * Refresh markers with zoom-appropriate filtering and sizing
     * @private
     * @param {number} zoom - Current zoom level
     */
    refreshMarkersForZoom(zoom) {
        // Only refresh if we have weather data and zoom level changed significantly
        if (!this.currentWeatherData || Math.abs((this.lastZoomLevel || 0) - zoom) < 1) {
            return;
        }
        
        // Check cache first for performance
        const cacheKey = `${zoom}_${this.currentDayIndex}_${this.showOnlyDry}`;
        if (this.markerCache.has(cacheKey)) {
            console.log(`Using cached markers for zoom ${zoom}`);
            return;
        }
        
        // Update weather markers with zoom filtering
        this.updateWeatherMarkers(this.currentWeatherData, this.currentDayIndex, this.showOnlyDry);
        
        // Cache the result
        this.markerCache.set(cacheKey, true);
        
        // Limit cache size
        if (this.markerCache.size > 10) {
            const firstKey = this.markerCache.keys().next().value;
            this.markerCache.delete(firstKey);
        }
    }

    /**
     * Update weather markers on map
     * @param {Object} weatherData - Weather data for current day
     * @param {number} dayIndex - Current day index
     * @param {boolean} showOnlyDry - Show only cities without rain
     */
    updateWeatherMarkers(weatherData, dayIndex, showOnlyDry = false) {
        this.currentWeatherData = weatherData;
        this.currentDayIndex = dayIndex;
        this.showOnlyDry = showOnlyDry;
        
        // Clear existing weather markers
        this.weatherLayer.clearLayers();
        
        if (!weatherData?.previsions) {
            console.warn('MapController: No weather data provided');
            return;
        }
        
        const currentZoom = this.map ? this.map.getZoom() : 7;
        
        weatherData.previsions.forEach((city) => {
            if (!city.donnees_disponibles) return;
            
            const hasRain = (city.precipitation || 0) > 0;
            
            // Filter based on dry-only setting
            if (showOnlyDry && hasRain) return;
            
            // Filter based on zoom level for better performance and clarity
            if (!this.shouldShowMarker(city, currentZoom)) return;
            
            const marker = this.createWeatherMarker(city, hasRain, currentZoom);
            this.weatherLayer.addLayer(marker);
        });
        
        this.emit('weatherMarkersUpdated', {
            dayIndex,
            citiesCount: weatherData.previsions.length,
            visibleCount: this.weatherLayer.getLayers().length
        });
    }
    
    /**
     * Create a weather marker for a city
     * @private
     * @param {Object} city - City weather data
     * @param {boolean} hasRain - Whether city has rain
     * @param {number} zoom - Current zoom level for sizing
     * @returns {L.Marker} Leaflet marker
     */
    createWeatherMarker(city, hasRain, zoom = 7) {
        // Get enhanced weather assessment
        const assessment = this.weatherConditions.getWeatherAssessment(city);
        const borderColor = this.getMarkerBorderColor(assessment.comfortIndex, hasRain);
        const statusIndicator = this.getStatusIndicator(assessment.comfortIndex);
        
        // Create custom marker HTML with enhanced design
        const markerHtml = `
            <div class="relative">
                <div class="bg-white rounded-full p-1 shadow-lg border-2 ${borderColor}">
                    <div class="w-8 h-8 flex items-center justify-center text-lg">
                        ${assessment.icon}
                    </div>
                </div>
                ${statusIndicator}
            </div>
        `;
        
        const markerSize = this.getMarkerSizeForZoom(zoom);
        const icon = L.divIcon({
            html: markerHtml,
            className: 'weather-marker',
            iconSize: [markerSize, markerSize],
            iconAnchor: [markerSize / 2, markerSize / 2],
            popupAnchor: [0, -markerSize / 2]
        });
        
        const marker = L.marker([city.lat, city.lon], { icon });
        
        // Create popup content
        const popupContent = this.createWeatherPopup(city);
        marker.bindPopup(popupContent, {
            maxWidth: 280,
            className: 'weather-popup'
        });
        
        // Add click handler
        marker.on('click', () => {
            this.emit('weatherMarkerClicked', { city, dayIndex: this.currentDayIndex });
        });
        
        return marker;
    }
    
    /**
     * Get weather icon for city
     * @private
     * @param {Object} city - City data
     * @param {boolean} hasRain - Has rain
     * @returns {string} Emoji icon
     */
    getWeatherIcon(city, hasRain) {
        if (hasRain) {
            if ((city.precipitation || 0) > 10) return '🌧️';
            if ((city.precipitation || 0) > 5) return '🌦️';
            return '☔';
        }
        
        // Clear weather - check temperature and conditions
        const temp = city.temp_max || 20;
        const windSpeed = city.wind_speed || 0;
        
        if (temp > 25 && windSpeed < 15) return '☀️';
        if (temp > 20) return '⛅';
        if (temp > 15) return '☁️';
        return '🌤️';
    }
    
    /**
     * Create weather popup content
     * @private
     * @param {Object} city - City weather data
     * @returns {string} HTML content
     */
    createWeatherPopup(city) {
        const assessment = this.weatherConditions.getWeatherAssessment(city);
        const rain = city.precipitation || 0;
        const tempMin = city.temp_min ? Math.round(city.temp_min) : '?';
        const tempMax = city.temp_max ? Math.round(city.temp_max) : '?';
        const windSpeed = city.wind_speed ? Math.round(city.wind_speed) : 0;
        const uvIndex = city.uv_index || 0;
        
        return `
            <div class="space-y-2 p-1">
                <h3 class="font-bold text-lg text-center border-b pb-1">${city.nom}</h3>
                
                <!-- Enhanced Weather Assessment -->
                <div class="bg-gray-50 p-2 rounded text-center">
                    <div class="text-2xl mb-1">${assessment.icon}</div>
                    <div class="text-sm font-medium">${assessment.description}</div>
                    <div class="text-xs text-gray-600">${assessment.summary}</div>
                    <div class="text-xs mt-1">
                        <span class="font-medium">Confort:</span>
                        <span class="${this.getComfortColorClass(assessment.comfortIndex)}">${assessment.comfortIndex}%</span>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="flex items-center">
                        <span class="mr-1">🌡️</span>
                        <span>${tempMin}° - ${tempMax}°C</span>
                    </div>
                    
                    <div class="flex items-center">
                        <span class="mr-1">💧</span>
                        <span>${rain.toFixed(1)} mm</span>
                    </div>
                    
                    ${windSpeed > 20 ? `
                        <div class="flex items-center">
                            <span class="mr-1">💨</span>
                            <span>${windSpeed} km/h</span>
                        </div>
                    ` : ''}
                    
                    ${uvIndex > 5 ? `
                        <div class="flex items-center">
                            <span class="mr-1">☀️</span>
                            <span>UV ${uvIndex}</span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Weather Alerts -->
                ${assessment.alerts.length > 0 ? `
                    <div class="space-y-1">
                        ${assessment.alerts.map(alert => `
                            <div class="bg-${alert.level === 'danger' ? 'red' : 'yellow'}-100 text-${alert.level === 'danger' ? 'red' : 'yellow'}-800 px-2 py-1 rounded text-xs">
                                ${alert.icon} ${alert.message}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <!-- Activity Recommendations -->
                <div class="bg-blue-50 p-2 rounded">
                    <div class="text-xs font-medium text-blue-900 mb-1">🎯 Activités recommandées:</div>
                    <div class="grid grid-cols-2 gap-1 text-xs">
                        <div class="flex items-center">
                            <span class="mr-1">🥾</span>
                            <span class="${this.getActivityColorClass(assessment.activities.hiking)}">Randonnée (${assessment.activities.hiking}/5)</span>
                        </div>
                        <div class="flex items-center">
                            <span class="mr-1">🏖️</span>
                            <span class="${this.getActivityColorClass(assessment.activities.beach)}">Plage (${assessment.activities.beach}/5)</span>
                        </div>
                        <div class="flex items-center">
                            <span class="mr-1">🚴</span>
                            <span class="${this.getActivityColorClass(assessment.activities.cycling)}">Vélo (${assessment.activities.cycling}/5)</span>
                        </div>
                        <div class="flex items-center">
                            <span class="mr-1">♨️</span>
                            <span class="${this.getActivityColorClass(assessment.activities.thermes)}">Thermes (${assessment.activities.thermes}/5)</span>
                        </div>
                    </div>
                </div>
                
                ${city.lever_soleil && city.coucher_soleil ? `
                    <div class="text-xs text-gray-600 text-center border-t pt-1">
                        🌅 ${new Date(city.lever_soleil).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} - 
                        🌇 ${new Date(city.coucher_soleil).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Get marker border color based on comfort index
     * @private
     * @param {number} comfortIndex - Weather comfort index (0-100)
     * @param {boolean} hasRain - Whether there's rain
     * @returns {string} CSS border color class
     */
    getMarkerBorderColor(comfortIndex, hasRain) {
        if (hasRain) return 'border-blue-400';
        
        if (comfortIndex >= 80) return 'border-emerald-500';
        if (comfortIndex >= 60) return 'border-green-500';
        if (comfortIndex >= 40) return 'border-yellow-500';
        if (comfortIndex >= 20) return 'border-orange-500';
        return 'border-red-500';
    }
    
    /**
     * Get status indicator for marker
     * @private
     * @param {number} comfortIndex - Weather comfort index (0-100)
     * @returns {string} HTML for status indicator
     */
    getStatusIndicator(comfortIndex) {
        if (comfortIndex >= 80) {
            return '<div class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full"></div>';
        } else if (comfortIndex >= 60) {
            return '<div class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>';
        } else if (comfortIndex >= 40) {
            return '<div class="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full"></div>';
        } else if (comfortIndex < 30) {
            return '<div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>';
        }
        return '';
    }
    
    /**
     * Get CSS color class for comfort index
     * @private
     * @param {number} comfortIndex - Comfort index (0-100)
     * @returns {string} CSS color class
     */
    getComfortColorClass(comfortIndex) {
        if (comfortIndex >= 80) return 'text-emerald-600 font-medium';
        if (comfortIndex >= 60) return 'text-green-600 font-medium';
        if (comfortIndex >= 40) return 'text-yellow-600 font-medium';
        if (comfortIndex >= 20) return 'text-orange-600 font-medium';
        return 'text-red-600 font-medium';
    }
    
    /**
     * Get CSS color class for activity suitability
     * @private
     * @param {number} rating - Activity rating (1-5)
     * @returns {string} CSS color class
     */
    getActivityColorClass(rating) {
        if (rating >= 5) return 'text-emerald-700 font-medium';
        if (rating >= 4) return 'text-green-600';
        if (rating >= 3) return 'text-yellow-600';
        if (rating >= 2) return 'text-orange-600';
        return 'text-red-600';
    }
    
    /**
     * Update activity markers on map
     * @param {Array} activities - List of activities to display
     * @param {Set} activeFilters - Active activity type filters
     */
    updateActivityMarkers(activities, activeFilters = new Set()) {
        this.activeActivities = activities;
        this.visibleActivities.clear();
        
        // Clear existing activity markers
        this.activitiesLayer.clearLayers();
        
        activities.forEach((activity) => {
            // Apply filters
            if (!activeFilters.has(activity.type)) return;
            
            const marker = this.createActivityMarker(activity);
            this.activitiesLayer.addLayer(marker);
            this.visibleActivities.add(activity.nom);
        });
        
        this.emit('activityMarkersUpdated', {
            totalActivities: activities.length,
            visibleActivities: this.visibleActivities.size
        });
    }
    
    /**
     * Create an activity marker
     * @private
     * @param {Object} activity - Activity data
     * @returns {L.Marker} Leaflet marker
     */
    createActivityMarker(activity) {
        const currentZoom = this.map ? this.map.getZoom() : 7;
        const markerSize = Math.max(24, this.getMarkerSizeForZoom(currentZoom) * 0.9); // Slightly smaller than weather markers
        const icon = this.getActivityIcon(activity.type);
        const color = this.getActivityColor(activity.type);
        
        const markerHtml = `
            <div class="lieu-marker" style="background: ${color}; border: 2px solid white;">
                <span class="text-white">${icon}</span>
            </div>
        `;
        
        const leafletIcon = L.divIcon({
            html: markerHtml,
            className: 'activity-marker',
            iconSize: [markerSize, markerSize],
            iconAnchor: [markerSize / 2, markerSize / 2],
            popupAnchor: [0, -markerSize / 2]
        });
        
        const marker = L.marker([activity.lat, activity.lon], { icon: leafletIcon });
        
        // Create popup
        const popupContent = this.createActivityPopup(activity);
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'activity-popup'
        });
        
        // Add click handler
        marker.on('click', () => {
            this.emit('activityMarkerClicked', { activity });
        });
        
        return marker;
    }
    
    /**
     * Get activity icon
     * @private
     * @param {string} type - Activity type
     * @returns {string} Emoji icon
     */
    getActivityIcon(type) {
        const icons = {
            cascade: '💧',
            thermes: '♨️',
            lac: '🏊',
            plage: '🏖️',
            gorges: '🏔️',
            grotte: '🕳️',
            piscine: '💎',
            vue: '👁️',
            canyon: '🪂'
        };
        return icons[type] || '📍';
    }
    
    /**
     * Get activity color
     * @private
     * @param {string} type - Activity type
     * @returns {string} CSS color
     */
    getActivityColor(type) {
        const colors = {
            cascade: '#3b82f6',
            thermes: '#ef4444',
            lac: '#06b6d4',
            plage: '#f59e0b',
            gorges: '#8b5cf6',
            grotte: '#6b7280',
            piscine: '#14b8a6',
            vue: '#ec4899',
            canyon: '#f97316'
        };
        return colors[type] || '#6b7280';
    }
    
    /**
     * Create activity popup content
     * @private
     * @param {Object} activity - Activity data
     * @returns {string} HTML content
     */
    createActivityPopup(activity) {
        return `
            <div class="space-y-2 p-1">
                <h3 class="font-bold text-center">${this.getActivityIcon(activity.type)} ${activity.nom}</h3>
                <p class="text-sm text-gray-600">${activity.description}</p>
                
                <div class="flex justify-center gap-2 pt-2 border-t">
                    <button class="text-xs bg-blue-500 text-white px-2 py-1 rounded" 
                            onclick="window.mapController.navigateToActivity('${activity.nom}')">
                        🧭 Itinéraire
                    </button>
                    <button class="text-xs bg-green-500 text-white px-2 py-1 rounded" 
                            onclick="window.mapController.addToRoute('${activity.nom}')">
                        ➕ Ajouter
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Fit map to show all visible markers
     */
    fitToMarkers() {
        const allLayers = [
            ...this.weatherLayer.getLayers(),
            ...this.activitiesLayer.getLayers(),
            ...this.routeLayer.getLayers()
        ];
        
        if (allLayers.length === 0) return;
        
        const group = new L.featureGroup(allLayers);
        this.map.fitBounds(group.getBounds(), {
            padding: [20, 20],
            maxZoom: 12
        });
        
        this.emit('mapFittedToMarkers', { 
            markerCount: allLayers.length,
            bounds: group.getBounds()
        });
    }
    
    /**
     * Center map on location
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} zoom - Zoom level
     */
    centerOn(lat, lon, zoom = null) {
        this.map.setView([lat, lon], zoom || this.map.getZoom());
        
        this.emit('mapCentered', { lat, lon, zoom });
    }
    
    /**
     * Add route line to map
     * @param {Array} coordinates - Array of [lat, lon] coordinates
     * @param {Object} options - Route styling options
     */
    addRoute(coordinates, options = {}) {
        const routeOptions = {
            color: options.color || '#3b82f6',
            weight: options.weight || 4,
            opacity: options.opacity || 0.8,
            dashArray: options.dashArray || null,
            ...options
        };
        
        const polyline = L.polyline(coordinates, routeOptions);
        this.routeLayer.addLayer(polyline);
        
        // Fit to route if requested
        if (options.fitBounds !== false) {
            this.map.fitBounds(polyline.getBounds(), {
                padding: [10, 10]
            });
        }
        
        this.emit('routeAdded', { 
            coordinates,
            bounds: polyline.getBounds()
        });
        
        return polyline;
    }
    
    /**
     * Clear all routes from map
     */
    clearRoutes() {
        this.routeLayer.clearLayers();
        this.emit('routesCleared');
    }
    
    /**
     * Get current map bounds
     * @returns {Object} Bounds object
     */
    getBounds() {
        return this.map.getBounds();
    }
    
    /**
     * Get current map center
     * @returns {Object} LatLng object
     */
    getCenter() {
        return this.map.getCenter();
    }
    
    /**
     * Get current map zoom
     * @returns {number} Zoom level
     */
    getZoom() {
        return this.map.getZoom();
    }
    
    /**
     * Navigate to activity (placeholder for external routing)
     * @param {string} activityName - Name of activity
     */
    navigateToActivity(activityName) {
        const activity = this.activeActivities.find(a => a.nom === activityName);
        if (!activity) return;
        
        this.emit('navigationRequested', { activity });
        
        // Placeholder - would integrate with routing service
        console.log('Navigation requested to:', activityName);
    }
    
    /**
     * Add activity to route planning
     * @param {string} activityName - Name of activity
     */
    addToRoute(activityName) {
        const activity = this.activeActivities.find(a => a.nom === activityName);
        if (!activity) return;
        
        this.emit('activityAddedToRoute', { activity });
    }
    
    /**
     * Toggle map layer visibility
     * @param {string} layerName - Name of layer to toggle
     */
    toggleLayer(layerName) {
        const layers = {
            weather: this.weatherLayer,
            activities: this.activitiesLayer,
            routes: this.routeLayer
        };
        
        const layer = layers[layerName];
        if (!layer) return;
        
        if (this.map.hasLayer(layer)) {
            this.map.removeLayer(layer);
        } else {
            this.map.addLayer(layer);
        }
        
        this.emit('layerToggled', { 
            layerName,
            visible: this.map.hasLayer(layer)
        });
    }
    
    /**
     * Simple event emitter
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data = {}) {
        const customEvent = new CustomEvent(`map:${event}`, {
            detail: { ...data, timestamp: Date.now() }
        });
        document.dispatchEvent(customEvent);
    }
    
    /**
     * Listen to map events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        document.addEventListener(`map:${event}`, handler);
    }
    
    /**
     * Invalidate map size (useful after container resize)
     */
    invalidateSize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }
    
    /**
     * Enable spot creation mode
     * @emits spotLocationSelected - When user clicks on map
     */
    enableSpotCreation() {
        // Change cursor to crosshair
        this.map.getContainer().style.cursor = 'crosshair';
        
        // Add temporary click handler
        this.spotCreationHandler = (e) => {
            this.emit('spotLocationSelected', {
                lat: e.latlng.lat,
                lon: e.latlng.lng
            });
            this.disableSpotCreation();
        };
        
        this.map.once('click', this.spotCreationHandler);
        
        // Add visual feedback
        const container = this.map.getContainer();
        container.classList.add('spot-creation-mode');
    }
    
    /**
     * Disable spot creation mode
     */
    disableSpotCreation() {
        this.map.getContainer().style.cursor = '';
        this.map.getContainer().classList.remove('spot-creation-mode');
        
        if (this.spotCreationHandler) {
            this.map.off('click', this.spotCreationHandler);
            this.spotCreationHandler = null;
        }
    }
    
    /**
     * Initialize custom spots layer
     * @private
     */
    initializeCustomSpotsLayer() {
        if (!this.customSpotsLayer) {
            this.customSpotsLayer = L.layerGroup();
            this.customSpotsLayer.addTo(this.map);
            this.customSpotMarkers = new Map(); // Store marker references
        }
    }
    
    /**
     * Add custom spot marker
     * @param {Object} spot - Spot data
     * @returns {L.Marker} Created marker
     */
    addCustomSpotMarker(spot) {
        this.initializeCustomSpotsLayer();
        
        // Import spot types from spot-manager
        const spotTypes = {
            'warehouse': { icon: '🏭', color: '#6B7280' },
            'urbex': { icon: '🏚️', color: '#92400E' },
            'rooftop': { icon: '🏢', color: '#1E40AF' },
            'swimming': { icon: '🏊', color: '#0891B2' },
            'cliff-jump': { icon: '🪂', color: '#0369A1' },
            'river': { icon: '💧', color: '#0E7490' },
            'viewpoint': { icon: '👁️', color: '#7C3AED' },
            'camping': { icon: '⛺', color: '#059669' },
            'cave': { icon: '🕳️', color: '#451A03' },
            'party': { icon: '🎉', color: '#E11D48' },
            'bbq': { icon: '🔥', color: '#EA580C' },
            'picnic': { icon: '🧺', color: '#CA8A04' },
            'custom': { icon: '📍', color: '#DC2626' }
        };
        
        const spotType = spotTypes[spot.type] || spotTypes.custom;
        const markerSize = 36;
        
        // Create custom divIcon with pin shape
        const markerHtml = `
            <div class="custom-spot-marker" 
              style="background: ${spotType.color}; 
              width: ${markerSize}px; 
              height: ${markerSize}px; 
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;">
              <span style="transform: rotate(45deg); font-size: 18px; color: white;">
                ${spotType.icon}
              </span>
            </div>
        `;
        
        const icon = L.divIcon({
            html: markerHtml,
            className: 'custom-div-icon',
            iconSize: [markerSize, markerSize],
            iconAnchor: [markerSize / 2, markerSize],
            popupAnchor: [0, -markerSize]
        });
        
        const marker = L.marker([spot.coordinates.lat, spot.coordinates.lon], { 
            icon,
            zIndexOffset: 1000 // Ensure custom spots appear above other markers
        });
        
        // Create popup content
        const popupContent = this.createCustomSpotPopup(spot);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-spot-popup'
        });
        
        // Add click handler
        marker.on('click', () => {
            this.emit('customSpotClicked', { spot });
        });
        
        // Add to layer and store reference
        marker.addTo(this.customSpotsLayer);
        this.customSpotMarkers.set(spot.id, marker);
        
        return marker;
    }
    
    /**
     * Create custom spot popup HTML
     * @private
     * @param {Object} spot - Spot data
     * @returns {string} HTML content
     */
    createCustomSpotPopup(spot) {
        const spotTypes = {
            'warehouse': { label: 'Entrepôt' },
            'urbex': { label: 'Urbex' },
            'rooftop': { label: 'Toit' },
            'swimming': { label: 'Baignade' },
            'cliff-jump': { label: 'Saut' },
            'river': { label: 'Rivière' },
            'viewpoint': { label: 'Point de vue' },
            'camping': { label: 'Camping' },
            'cave': { label: 'Grotte' },
            'party': { label: 'Fête' },
            'bbq': { label: 'BBQ' },
            'picnic': { label: 'Pique-nique' },
            'custom': { label: 'Autre' }
        };
        
        const spotType = spotTypes[spot.type] || spotTypes.custom;
        const weatherWarning = spot.access?.weatherSensitive 
            ? '<div class="text-orange-500 text-sm mt-2">⚠️ Éviter par temps de pluie</div>' 
            : '';
        
        const visitInfo = spot.metadata?.lastVisited 
            ? `<div class="text-xs text-gray-500 mt-1">
                Dernière visite: ${new Date(spot.metadata.lastVisited).toLocaleDateString('fr-FR')}
               </div>`
            : '';
        
        return `
            <div class="p-3">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg flex-1">${spot.name}</h3>
                    <span class="text-xs bg-gray-200 px-2 py-1 rounded">${spotType.label}</span>
                </div>
                
                ${spot.description ? `<p class="text-sm text-gray-600 mb-2">${spot.description}</p>` : ''}
                
                ${spot.access?.notes ? `
                    <div class="bg-gray-100 p-2 rounded text-xs mb-2">
                        <strong>Accès:</strong> ${spot.access.notes}
                    </div>
                ` : ''}
                
                ${weatherWarning}
                
                ${spot.access?.bestTime && spot.access.bestTime !== 'anytime' ? `
                    <div class="text-sm mt-1">
                        <strong>Meilleur moment:</strong> ${this.getBestTimeLabel(spot.access.bestTime)}
                    </div>
                ` : ''}
                
                ${spot.metadata?.tags?.length ? `
                    <div class="flex flex-wrap gap-1 mt-2">
                        ${spot.metadata.tags.map(tag => 
                            `<span class="bg-gray-200 px-2 py-0.5 rounded text-xs">#${tag}</span>`
                        ).join('')}
                    </div>
                ` : ''}
                
                <div class="flex justify-between items-center mt-3 pt-2 border-t">
                    <div>
                        <span class="text-xs text-gray-500">
                            Ajouté ${this.getRelativeDate(spot.metadata.addedDate)}
                        </span>
                        ${visitInfo}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.app?.markSpotVisited('${spot.id}')" 
                            class="text-green-500 hover:text-green-700 text-sm" title="Marquer comme visité">
                            ✓
                        </button>
                        <button onclick="window.app?.editSpot('${spot.id}')" 
                            class="text-blue-500 hover:text-blue-700 text-sm" title="Modifier">
                            ✏️
                        </button>
                        <button onclick="window.app?.deleteSpot('${spot.id}')" 
                            class="text-red-500 hover:text-red-700 text-sm" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Get best time label in French
     * @private
     */
    getBestTimeLabel(time) {
        const labels = {
            'sunrise': 'Lever du soleil',
            'morning': 'Matin',
            'afternoon': 'Après-midi',
            'sunset': 'Coucher du soleil',
            'night': 'Nuit',
            'anytime': 'N\'importe quand'
        };
        return labels[time] || time;
    }
    
    /**
     * Get relative date in French
     * @private
     */
    getRelativeDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'aujourd\'hui';
        if (diffDays === 1) return 'hier';
        if (diffDays < 7) return `il y a ${diffDays} jours`;
        if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} semaines`;
        if (diffDays < 365) return `il y a ${Math.floor(diffDays / 30)} mois`;
        return `il y a ${Math.floor(diffDays / 365)} ans`;
    }
    
    /**
     * Remove custom spot marker
     * @param {string} spotId - Spot ID
     */
    removeCustomSpotMarker(spotId) {
        const marker = this.customSpotMarkers.get(spotId);
        if (marker) {
            this.customSpotsLayer.removeLayer(marker);
            this.customSpotMarkers.delete(spotId);
        }
    }
    
    /**
     * Update custom spot marker
     * @param {Object} spot - Updated spot data
     */
    updateCustomSpotMarker(spot) {
        this.removeCustomSpotMarker(spot.id);
        this.addCustomSpotMarker(spot);
    }
    
    /**
     * Show/hide custom spots layer
     * @param {boolean} show - Show or hide
     */
    toggleCustomSpots(show) {
        if (this.customSpotsLayer) {
            if (show) {
                this.customSpotsLayer.addTo(this.map);
            } else {
                this.map.removeLayer(this.customSpotsLayer);
            }
        }
    }
    
    /**
     * Center map on spot
     * @param {Object} spot - Spot to center on
     * @param {number} zoom - Optional zoom level
     */
    centerOnSpot(spot, zoom = 15) {
        this.map.setView([spot.coordinates.lat, spot.coordinates.lon], zoom);
        
        // Open popup if marker exists
        const marker = this.customSpotMarkers.get(spot.id);
        if (marker) {
            setTimeout(() => marker.openPopup(), 300);
        }
    }
    
    /**
     * Get bounds of all custom spots
     * @returns {L.LatLngBounds|null} Bounds or null if no spots
     */
    getCustomSpotsBounds() {
        if (!this.customSpotMarkers.size) return null;
        
        const bounds = L.latLngBounds();
        this.customSpotMarkers.forEach(marker => {
            bounds.extend(marker.getLatLng());
        });
        
        return bounds;
    }
    
    /**
     * Fit map to show all custom spots
     * @param {Object} options - Leaflet fitBounds options
     */
    fitToCustomSpots(options = {}) {
        const bounds = this.getCustomSpotsBounds();
        if (bounds) {
            this.map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 12,
                ...options
            });
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        
        this.weatherLayer = null;
        this.activitiesLayer = null;
        this.routeLayer = null;
        this.eventHandlers.clear();
        
        console.log('MapController: Cleaned up');
    }
}

// Export for use in main application
export default MapController;