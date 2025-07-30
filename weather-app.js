/**
 * Weather App Main Coordinator - Modular Architecture
 * Orchestrates WeatherService, UIStateManager, and MapController
 * 
 * Following scanner.rs refactoring pattern:
 * - Clean module coordination
 * - Event-driven communication between modules  
 * - Single point of configuration
 * - Production-ready error handling and recovery
 */

import WeatherService from './weather-service.js';
import UIStateManager from './ui-state-manager.js';
import MapController from './map-controller.js';
import ErrorMonitor, { WEATHER_ERROR_MESSAGES } from './error-monitor.js';
import SpotManager from './spot-manager.js';

class WeatherApp {
    constructor(config = {}) {
        this.config = {
            // Cities to monitor (Southern France focus)
            cities: config.cities || [
                { nom: 'Toulouse', lat: 43.6047, lon: 1.4442, region: 'Occitanie' },
                { nom: 'Bordeaux', lat: 44.8378, lon: -0.5792, region: 'Nouvelle-Aquitaine' },
                { nom: 'Montpellier', lat: 43.6108, lon: 3.8767, region: 'Occitanie' },
                { nom: 'Marseille', lat: 43.2965, lon: 5.3698, region: 'PACA' },
                { nom: 'Nice', lat: 43.7102, lon: 7.2620, region: 'PACA' },
                { nom: 'Perpignan', lat: 42.6887, lon: 2.8948, region: 'Occitanie' },
                { nom: 'Avignon', lat: 43.9493, lon: 4.8055, region: 'PACA' },
                { nom: 'Biarritz', lat: 43.4832, lon: -1.5586, region: 'Nouvelle-Aquitaine' },
                { nom: 'Cannes', lat: 43.5528, lon: 7.0174, region: 'PACA' },
                { nom: 'Nîmes', lat: 43.8367, lon: 4.3601, region: 'Occitanie' },
                { nom: 'Aix-en-Provence', lat: 43.5297, lon: 5.4474, region: 'PACA' },
                { nom: 'Carcassonne', lat: 43.2130, lon: 2.3491, region: 'Occitanie' },
                { nom: 'Bayonne', lat: 43.4945, lon: -1.4745, region: 'Nouvelle-Aquitaine' },
                { nom: 'Toulon', lat: 43.1242, lon: 5.9280, region: 'PACA' },
                { nom: 'Pau', lat: 43.2951, lon: -0.3708, region: 'Nouvelle-Aquitaine' }
            ],
            
            // Points of interest for outdoor activities
            activities: config.activities || [
                { nom: "Saut du Loup", type: "cascade", lat: 43.7361, lon: 6.9944, description: "Cascade avec vasques naturelles" },
                { nom: "Bains de Llo", type: "thermes", lat: 42.4622, lon: 2.0533, description: "Bassins naturels avec vue montagne" },
                { nom: "Lac de Montbel", type: "lac", lat: 42.9569, lon: 1.9161, description: "Grand lac des Pyrénées" },
                { nom: "Gorges de la Fou", type: "gorges", lat: 42.4783, lon: 2.3958, description: "Les plus étroites de France (1m)" },
                { nom: "Plage de la Vieille", type: "plage", lat: 42.5150, lon: 3.1378, description: "Crique de Collioure" },
                { nom: "Grotte de la Cocalière", type: "grotte", lat: 44.2664, lon: 4.3436, description: "Perle des cavernes" },
                { nom: "Vasques du Chassezac", type: "piscine", lat: 44.4056, lon: 4.0344, description: "Toboggans naturels" },
                { nom: "Mont Aigoual", type: "vue", lat: 44.1214, lon: 3.5817, description: "Panorama 360°" },
                { nom: "Canyon du Diable", type: "canyon", lat: 44.1872, lon: 3.5486, description: "Toboggans et sauts" },
                { nom: "Cascade de la Vis", type: "cascade", lat: 43.9500, lon: 3.6167, description: "Cascade accessible en famille" },
                { nom: "Thermes de Vernet", type: "thermes", lat: 42.5500, lon: 2.3833, description: "Station thermale des Pyrénées" },
                { nom: "Lac de Salagou", type: "lac", lat: 43.6500, lon: 3.3333, description: "Lac rouge de l'Hérault" },
                { nom: "Gorges du Tarn", type: "gorges", lat: 44.3000, lon: 3.2000, description: "Canyon spectaculaire" },
                { nom: "Plage des Aresquiers", type: "plage", lat: 43.5167, lon: 4.0167, description: "Plage sauvage de Frontignan" },
                { nom: "Aven Armand", type: "grotte", lat: 44.2167, lon: 3.2333, description: "Forêt de stalagmites géantes" }
            ],
            
            // Service options
            weatherOptions: {
                timeout: config.isMobile ? 10000 : 15000,
                maxRetries: 2,
                cacheDuration: 3600000, // 1 hour
                ...config.weatherOptions
            },
            
            mapOptions: {
                center: config.mapCenter || [43.7, 3.5],
                zoom: config.mapZoom || 7,
                clusterRadius: config.isMobile ? 40 : 50,
                ...config.mapOptions
            },
            
            uiOptions: {
                maxDays: 7,
                updateInterval: 60000,
                ...config.uiOptions
            },
            
            // Feature flags
            features: {
                offlineMode: true,
                weeklyStats: true,
                routePlanning: true,
                backgroundSync: 'serviceWorker' in navigator,
                ...config.features
            }
        };
        
        // Module instances
        this.weatherService = null;
        this.uiState = null;
        this.mapController = null;
        
        // Application state
        this.isInitialized = false;
        this.currentRoute = [];
        this.searchResults = [];
        
        // Performance tracking
        this.performance = {
            initStart: Date.now(),
            weatherLoadTime: null,
            firstPaintTime: null
        };
        
        // Initialize error monitoring (production-ready)
        this.errorMonitor = new ErrorMonitor({
            appVersion: '2.0.0',
            environment: config.environment || 'production',
            enableConsoleLog: config.debug || false
        });
        
        // Initialize modules
        this.initialize();
    }
    
    /**
     * Initialize all application modules
     * @private
     */
    async initialize() {
        try {
            console.log('WeatherApp: Starting initialization...');
            
            // Initialize weather service
            this.weatherService = new WeatherService(this.config.weatherOptions);
            
            // Initialize UI state manager
            this.uiState = new UIStateManager(this.weatherService, this.config.uiOptions);
            
            // Initialize map controller
            this.mapController = new MapController('map', this.config.mapOptions);
            
            // Initialize spot manager
            this.spotManager = new SpotManager();
            
            // Set up inter-module communication
            this.setupEventHandlers();
            
            // Set up custom spots UI and load saved spots
            this.setupSpotManagement();
            
            // Set up activities (doesn't require weather data)
            this.setupActivities();
            
            // Configure periodic updates
            this.setupPeriodicUpdates();
            
            // Mark as initialized - app is ready even without weather data
            this.isInitialized = true;
            this.performance.firstPaintTime = Date.now();
            
            console.log('WeatherApp: Core initialization complete in', 
                this.performance.firstPaintTime - this.performance.initStart, 'ms');
            
            // Global reference for popup callbacks
            window.weatherApp = this;
            window.mapController = this.mapController;
            
            // Load weather data asynchronously (non-blocking)
            this.loadWeatherDataAsync();
            
        } catch (error) {
            console.error('WeatherApp: Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    /**
     * Setup event handlers between modules
     * @private
     */
    setupEventHandlers() {
        // UI State → Map Controller events
        this.uiState.on('dayChanged', (e) => {
            const { dayIndex, weatherData } = e.detail;
            this.mapController.updateWeatherMarkers(
                weatherData, 
                dayIndex, 
                this.uiState.showOnlyDry
            );
        });
        
        this.uiState.on('filterChanged', (e) => {
            const { showOnlyDry } = e.detail;
            const currentData = this.uiState.getCurrentDayData();
            if (currentData) {
                this.mapController.updateWeatherMarkers(
                    currentData, 
                    this.uiState.currentDayIndex, 
                    showOnlyDry
                );
            }
        });
        
        this.uiState.on('activityFiltersChanged', (e) => {
            const { activeFilters } = e.detail;
            this.mapController.updateActivityMarkers(
                this.config.activities, 
                new Set(activeFilters)
            );
        });
        
        this.uiState.on('searchActivities', (e) => {
            const { searchTerm } = e.detail;
            this.searchActivities(searchTerm);
        });
        
        this.uiState.on('weeklyStatsRequested', (e) => {
            this.showWeeklyStatsPanel(e.detail.stats);
        });
        
        // Map Controller → UI State events
        this.mapController.on('weatherMarkerClicked', (e) => {
            const { city, dayIndex } = e.detail;
            this.handleCitySelection(city, dayIndex);
        });
        
        this.mapController.on('activityMarkerClicked', (e) => {
            const { activity } = e.detail;
            this.handleActivitySelection(activity);
        });
        
        this.mapController.on('navigationRequested', (e) => {
            const { activity } = e.detail;
            this.initiateNavigation(activity);
        });
        
        this.mapController.on('activityAddedToRoute', (e) => {
            const { activity } = e.detail;
            this.addToRoute(activity);
        });
        
        // Connection status monitoring
        this.uiState.on('connectionChanged', (e) => {
            const { isOnline } = e.detail;
            this.handleConnectionChange(isOnline);
        });
    }
    
    /**
     * Load weather data asynchronously (non-blocking for app initialization)
     * @private
     */
    async loadWeatherDataAsync() {
        try {
            await this.loadWeatherData();
        } catch (error) {
            console.error('WeatherApp: Weather data loading failed:', error);
            // App continues to work without weather data
            this.uiState.showEmptyState('Impossible de charger les données météo. Carte disponible en mode minimal.');
        }
    }

    /**
     * Load weather data for all cities
     * @private
     */
    async loadWeatherData() {
        const loadStart = Date.now();
        
        try {
            this.uiState.setLoadingState('weather', true, 'Chargement des données météo...');
            
            const weatherData = await this.weatherService.fetchWeatherData(this.config.cities);
            this.performance.weatherLoadTime = Date.now() - loadStart;
            
            // Update UI with weather data
            this.uiState.updateWeatherData(weatherData);
            
            // Update map with initial day
            const initialDayData = weatherData.data[0];
            this.mapController.updateWeatherMarkers(initialDayData, 0, false);
            
            this.uiState.setLoadingState('weather', false);
            
            console.log('WeatherApp: Weather data loaded in', this.performance.weatherLoadTime, 'ms');
            
        } catch (error) {
            this.uiState.setLoadingState('weather', false);
            console.error('WeatherApp: Failed to load weather data:', error);
            
            // Try to load from cache
            const cachedData = this.weatherService.getCachedData();
            if (cachedData) {
                console.log('WeatherApp: Using cached weather data');
                this.uiState.updateWeatherData({
                    data: cachedData.data,
                    metadata: {
                        source: 'cache-error',
                        age: Date.now() - (cachedData.timestamp || 0),
                        userWarning: {
                            level: 'warning',
                            message: 'Données en cache - connexion indisponible',
                            icon: '⚠️'
                        }
                    }
                });
            } else {
                // No cached data available - app works in minimal mode
                throw error;
            }
        }
    }
    
    /**
     * Setup activity markers on map
     * @private
     */
    setupActivities() {
        this.mapController.updateActivityMarkers(
            this.config.activities,
            this.uiState.activeFilters
        );
        
        // Populate activities list in UI
        this.populateActivitiesList();
    }
    
    /**
     * Populate activities list in side panel
     * @private
     */
    populateActivitiesList() {
        const listElement = document.getElementById('liste-activites');
        if (!listElement) return;
        
        listElement.innerHTML = '';
        
        this.config.activities.forEach((activity) => {
            const activityCard = document.createElement('div');
            activityCard.className = 'carte-meteo bg-white border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow';
            
            activityCard.innerHTML = `
                <div class="p-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-medium text-sm">${this.mapController.getActivityIcon(activity.type)} ${activity.nom}</h4>
                        <span class="text-xs px-2 py-1 rounded-full bg-gray-100">${activity.type}</span>
                    </div>
                    <p class="text-xs text-gray-600 mb-2">${activity.description}</p>
                    <div class="flex gap-1">
                        <button class="text-xs bg-blue-500 text-white px-2 py-1 rounded flex-1" 
                                onclick="weatherApp.centerOnActivity('${activity.nom}')">
                            📍 Centrer
                        </button>
                        <button class="text-xs bg-green-500 text-white px-2 py-1 rounded flex-1" 
                                onclick="weatherApp.addToRoute(${JSON.stringify(activity).replace(/"/g, '&quot;')})">
                            ➕ Route
                        </button>
                    </div>
                </div>
            `;
            
            listElement.appendChild(activityCard);
        });
    }
    
    /**
     * Setup periodic data updates
     * @private
     */
    setupPeriodicUpdates() {
        if (!this.config.features.backgroundSync) return;
        
        // Update weather data every hour when online
        setInterval(async () => {
            if (!navigator.onLine) return;
            
            try {
                console.log('WeatherApp: Updating weather data...');
                const weatherData = await this.weatherService.fetchWeatherData(this.config.cities);
                this.uiState.updateWeatherData(weatherData);
                
                // Update current view
                const currentData = this.uiState.getCurrentDayData();
                if (currentData) {
                    this.mapController.updateWeatherMarkers(
                        currentData,
                        this.uiState.currentDayIndex,
                        this.uiState.showOnlyDry
                    );
                }
                
            } catch (error) {
                console.warn('WeatherApp: Periodic update failed:', error);
            }
        }, this.config.uiOptions.updateInterval);
    }
    
    /**
     * Handle city selection
     * @param {Object} city - Selected city
     * @param {number} dayIndex - Day index
     */
    handleCitySelection(city, dayIndex) {
        console.log('WeatherApp: City selected:', city.nom, 'day:', dayIndex);
        
        // Center map on city
        this.mapController.centerOn(city.lat, city.lon, 10);
        
        // Could show detailed weather panel here
        this.emit('citySelected', { city, dayIndex });
    }
    
    /**
     * Handle activity selection
     * @param {Object} activity - Selected activity
     */
    handleActivitySelection(activity) {
        console.log('WeatherApp: Activity selected:', activity.nom);
        
        // Center map on activity
        this.mapController.centerOn(activity.lat, activity.lon, 12);
        
        this.emit('activitySelected', { activity });
    }
    
    /**
     * Center map on specific activity
     * @param {string} activityName - Name of activity
     */
    centerOnActivity(activityName) {
        const activity = this.config.activities.find(a => a.nom === activityName);
        if (activity) {
            this.mapController.centerOn(activity.lat, activity.lon, 12);
        }
    }
    
    /**
     * Add activity to route planning
     * @param {Object} activity - Activity to add
     */
    addToRoute(activity) {
        this.currentRoute.push(activity);
        
        // Update route visualization
        this.updateRouteVisualization();
        
        console.log('WeatherApp: Activity added to route:', activity.nom);
        this.emit('routeUpdated', { route: this.currentRoute });
        
        // Show success feedback
        this.showTemporaryMessage(`${activity.nom} ajouté à l'itinéraire`, 'success');
    }
    
    /**
     * Update route visualization on map
     * @private
     */
    updateRouteVisualization() {
        if (this.currentRoute.length < 2) return;
        
        const coordinates = this.currentRoute.map(activity => [activity.lat, activity.lon]);
        
        this.mapController.clearRoutes();
        this.mapController.addRoute(coordinates, {
            color: '#8b5cf6',
            weight: 3,
            opacity: 0.7,
            fitBounds: false
        });
    }
    
    /**
     * Search activities by term
     * @param {string} searchTerm - Search term
     */
    searchActivities(searchTerm) {
        if (!searchTerm.trim()) {
            this.searchResults = [];
            this.populateActivitiesList();
            return;
        }
        
        this.searchResults = this.config.activities.filter(activity =>
            activity.nom.toLowerCase().includes(searchTerm) ||
            activity.description.toLowerCase().includes(searchTerm) ||
            activity.type.toLowerCase().includes(searchTerm)
        );
        
        // Update activities list with search results
        const listElement = document.getElementById('liste-activites');
        if (!listElement) return;
        
        listElement.innerHTML = '';
        
        if (this.searchResults.length === 0) {
            listElement.innerHTML = '<div class="p-3 text-center text-gray-500">Aucun résultat trouvé</div>';
            return;
        }
        
        this.searchResults.forEach(activity => {
            // Use same template as populateActivitiesList
            const activityCard = document.createElement('div');
            activityCard.className = 'carte-meteo bg-white border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow';
            activityCard.innerHTML = `
                <div class="p-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-medium text-sm">${this.mapController.getActivityIcon(activity.type)} ${activity.nom}</h4>
                        <span class="text-xs px-2 py-1 rounded-full bg-yellow-100">${activity.type}</span>
                    </div>
                    <p class="text-xs text-gray-600 mb-2">${activity.description}</p>
                    <div class="flex gap-1">
                        <button class="text-xs bg-blue-500 text-white px-2 py-1 rounded flex-1" 
                                onclick="weatherApp.centerOnActivity('${activity.nom}')">📍 Centrer</button>
                        <button class="text-xs bg-green-500 text-white px-2 py-1 rounded flex-1" 
                                onclick="weatherApp.addToRoute(${JSON.stringify(activity).replace(/"/g, '&quot;')})">➕ Route</button>
                    </div>
                </div>
            `;
            listElement.appendChild(activityCard);
        });
    }
    
    /**
     * Show weekly statistics panel
     * @param {Object} stats - Weekly statistics
     */
    showWeeklyStatsPanel(stats) {
        console.log('WeatherApp: Showing weekly stats:', stats);
        
        // Would implement weekly stats panel
        this.showTemporaryMessage('Statistiques hebdomadaires disponibles dans la console', 'info');
    }
    
    /**
     * Initiate navigation to activity
     * @param {Object} activity - Target activity
     */
    initiateNavigation(activity) {
        // Would integrate with external routing service
        const url = `https://www.google.com/maps/dir/?api=1&destination=${activity.lat},${activity.lon}`;
        window.open(url, '_blank');
        
        this.emit('navigationStarted', { activity });
    }
    
    /**
     * Handle connection status changes
     * @param {boolean} isOnline - Whether device is online
     */
    handleConnectionChange(isOnline) {
        if (isOnline) {
            console.log('WeatherApp: Connection restored, refreshing data...');
            this.loadWeatherData().catch(console.error);
        } else {
            console.log('WeatherApp: Offline mode - using cached data');
        }
        
        this.emit('connectionChanged', { isOnline });
    }
    
    /**
     * Handle initialization errors with enhanced monitoring
     * @private
     * @param {Error} error - Initialization error
     */
    handleInitializationError(error) {
        // Capture error with monitoring
        this.errorMonitor.captureError({
            type: 'initialization',
            message: error.message,
            stack: error.stack
        }, {
            phase: 'app_initialization',
            config: JSON.stringify(this.config, null, 2)
        });
        
        // Determine user-friendly message
        const userMessage = this.getUserFriendlyErrorMessage(error.message);
        
        // Show error in UI
        const dataStatus = document.getElementById('data-status');
        if (dataStatus) {
            dataStatus.textContent = userMessage;
            dataStatus.classList.remove('hidden', 'data-warning', 'data-success');
            dataStatus.classList.add('data-error');
        }
        
        // Hide loading overlay
        const loadingOverlay = document.getElementById('overlay-chargement');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        this.emit('initializationFailed', { error, message: errorMessage });
    }
    
    /**
     * Get user-friendly error message
     * @private
     * @param {string} errorMessage - Raw error message
     * @returns {string} User-friendly message
     */
    getUserFriendlyErrorMessage(errorMessage) {
        const message = errorMessage.toLowerCase();
        
        if (message.includes('network') || message.includes('fetch')) {
            return WEATHER_ERROR_MESSAGES.network;
        }
        if (message.includes('timeout')) {
            return WEATHER_ERROR_MESSAGES.api_timeout;
        }
        if (message.includes('location') || message.includes('localisation')) {
            return WEATHER_ERROR_MESSAGES.location;
        }
        if (message.includes('data') || message.includes('données')) {
            return WEATHER_ERROR_MESSAGES.data_invalid;
        }
        if (message.includes('map') || message.includes('carte')) {
            return WEATHER_ERROR_MESSAGES.map_error;
        }
        if (message.includes('storage') || message.includes('stockage')) {
            return WEATHER_ERROR_MESSAGES.storage_full;
        }
        
        return WEATHER_ERROR_MESSAGES.unknown;
    }
    
    /**
     * Enhanced error handler with monitoring and user experience
     * @param {Error} error - Error object
     * @param {string} context - Error context
     */
    handleError(error, context = 'general') {
        // Capture error with monitoring
        this.errorMonitor.captureError({
            type: 'application',
            message: error.message,
            stack: error.stack
        }, {
            context,
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
        
        // Get user-friendly message
        const userMessage = this.getUserFriendlyErrorMessage(error.message);
        
        // Show user-friendly error using existing method
        this.showTemporaryMessage(userMessage, 'error');
        
        // Log for developers
        console.error(`WeatherApp: Error in ${context}:`, error);
        
        // Track performance impact
        this.errorMonitor.trackPerformance(`error_${context}`, Date.now() - this.performance.initStart);
    }
    
    /**
     * Show temporary message to user
     * @param {string} message - Message text
     * @param {string} type - Message type (success, warning, error, info)
     */
    showTemporaryMessage(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = `fixed top-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg z-50 text-white text-sm max-w-sm text-center`;
        
        switch (type) {
            case 'success':
                toast.className += ' bg-green-500';
                break;
            case 'warning':
                toast.className += ' bg-yellow-500';
                break;
            case 'error':
                toast.className += ' bg-red-500';
                break;
            default:
                toast.className += ' bg-blue-500';
        }
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }
    
    /**
     * Get application performance metrics
     * @returns {Object} Performance data
     */
    getPerformanceMetrics() {
        return {
            ...this.performance,
            totalInitTime: this.performance.firstPaintTime - this.performance.initStart,
            weatherServiceStats: this.weatherService.getStats(),
            uiState: this.uiState.getState(),
            mapBounds: this.mapController.getBounds(),
            routeLength: this.currentRoute.length
        };
    }
    
    /**
     * Simple event emitter
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data = {}) {
        const customEvent = new CustomEvent(`weatherapp:${event}`, {
            detail: { ...data, timestamp: Date.now() }
        });
        document.dispatchEvent(customEvent);
    }
    
    /**
     * Listen to app events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        document.addEventListener(`weatherapp:${event}`, handler);
    }
    
    /**
     * Setup spot management UI and functionality
     * @private
     */
    setupSpotManagement() {
        // Add spot button
        const addBtn = document.getElementById('add-spot-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.startSpotCreation());
        }
        
        // Modal controls
        const modal = document.getElementById('spot-modal');
        const form = document.getElementById('spot-form');
        const cancelBtn = document.getElementById('cancel-spot');
        
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveNewSpot();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelSpotCreation());
        }
        
        // Populate spot types
        this.populateSpotTypes();
        
        // Map click handler for spot creation
        this.mapController.on('spotLocationSelected', (e) => {
            this.showSpotModal(e.detail);
        });
        
        // Custom spot click handler
        this.mapController.on('customSpotClicked', (e) => {
            this.handleCustomSpotClick(e.detail.spot);
        });
        
        // Import/Export buttons
        const mesSpotBtn = document.getElementById('btn-mes-spots');
        const importExportBtn = document.getElementById('btn-import-export');
        const exportBtn = document.getElementById('export-spots-btn');
        const importBtn = document.getElementById('import-spots-btn');
        const importFile = document.getElementById('import-file');
        const closeImportExport = document.getElementById('close-import-export');
        
        if (mesSpotBtn) {
            mesSpotBtn.addEventListener('click', () => this.showMySpots());
        }
        
        if (importExportBtn) {
            importExportBtn.addEventListener('click', () => {
                document.getElementById('import-export-modal').classList.remove('hidden');
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportSpots());
        }
        
        if (importBtn && importFile) {
            importBtn.addEventListener('click', async () => {
                if (importFile.files.length > 0) {
                    await this.importSpots(importFile.files[0]);
                }
            });
        }
        
        if (closeImportExport) {
            closeImportExport.addEventListener('click', () => {
                document.getElementById('import-export-modal').classList.add('hidden');
            });
        }
        
        // Make functions available globally for popup buttons
        window.app = this;
        
        // Load existing spots
        this.loadCustomSpots();
    }
    
    /**
     * Populate spot type selector
     * @private
     */
    populateSpotTypes() {
        const grid = document.getElementById('spot-type-grid');
        if (!grid) return;
        
        const spotTypes = [
            { value: 'urbex', icon: '🏚️', label: 'Urbex' },
            { value: 'warehouse', icon: '🏭', label: 'Entrepôt' },
            { value: 'rooftop', icon: '🏢', label: 'Toit' },
            { value: 'swimming', icon: '🏊', label: 'Baignade' },
            { value: 'river', icon: '💧', label: 'Rivière' },
            { value: 'viewpoint', icon: '👁️', label: 'Vue' },
            { value: 'camping', icon: '⛺', label: 'Camping' },
            { value: 'party', icon: '🎉', label: 'Fête' },
            { value: 'cave', icon: '🕳️', label: 'Grotte' },
            { value: 'forest', icon: '🌲', label: 'Forêt' },
            { value: 'picnic', icon: '🧺', label: 'Pique-nique' },
            { value: 'custom', icon: '📍', label: 'Autre' }
        ];
        
        grid.innerHTML = spotTypes.map(type => `
            <div class="spot-type-option">
                <input type="radio" id="type-${type.value}" name="spot-type" 
                    value="${type.value}" required>
                <label for="type-${type.value}" class="cursor-pointer block">
                    <div class="text-2xl mb-1">${type.icon}</div>
                    <div class="text-xs">${type.label}</div>
                </label>
            </div>
        `).join('');
    }
    
    /**
     * Start spot creation process
     */
    startSpotCreation() {
        this.mapController.enableSpotCreation();
        
        // Show notification
        this.uiState.showNotification(
            'Clique sur la carte pour placer ton spot',
            'info'
        );
    }
    
    /**
     * Show spot creation modal
     * @param {Object} location - {lat, lon}
     */
    showSpotModal(location) {
        this.currentSpotLocation = location;
        document.getElementById('spot-modal').classList.remove('hidden');
        
        // Reset form
        document.getElementById('spot-form').reset();
        
        // Focus on name input
        setTimeout(() => {
            document.getElementById('spot-name').focus();
        }, 100);
    }
    
    /**
     * Cancel spot creation
     */
    cancelSpotCreation() {
        this.mapController.disableSpotCreation();
        document.getElementById('spot-modal').classList.add('hidden');
        this.currentSpotLocation = null;
    }
    
    /**
     * Save new spot
     * @private
     */
    async saveNewSpot() {
        const formData = {
            name: document.getElementById('spot-name').value.trim(),
            type: document.querySelector('input[name="spot-type"]:checked')?.value,
            description: document.getElementById('spot-description').value.trim(),
            coordinates: this.currentSpotLocation,
            access: {
                notes: document.getElementById('spot-access').value.trim(),
                weatherSensitive: document.getElementById('weather-sensitive').checked,
                bestTime: document.getElementById('best-time').value
            },
            metadata: {
                tags: document.getElementById('spot-tags').value
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0)
            }
        };
        
        // Validate required fields
        if (!formData.name || !formData.type) {
            this.uiState.showNotification('Nom et type sont requis', 'error');
            return;
        }
        
        // Add the spot
        const spot = this.spotManager.addSpot(formData);
        
        if (spot) {
            // Add marker to map
            this.mapController.addCustomSpotMarker(spot);
            
            // Check weather for the spot if weather sensitive
            if (spot.access.weatherSensitive) {
                await this.checkSpotWeather(spot);
            }
            
            // Close modal
            this.cancelSpotCreation();
            
            // Show success message
            this.uiState.showNotification(
                `Spot "${spot.name}" ajouté avec succès!`,
                'success'
            );
            
            // Center map on new spot
            this.mapController.centerOnSpot(spot);
        } else {
            this.uiState.showNotification(
                'Erreur lors de l\'ajout du spot',
                'error'
            );
        }
    }
    
    /**
     * Load custom spots on startup
     * @private
     */
    loadCustomSpots() {
        const spots = this.spotManager.getAllSpots();
        spots.forEach(spot => {
            this.mapController.addCustomSpotMarker(spot);
        });
        
        console.log(`WeatherApp: Loaded ${spots.length} custom spots`);
        
        // Check weather for sensitive spots
        this.checkWeatherSensitiveSpots();
    }
    
    /**
     * Check weather for a specific spot
     * @param {Object} spot - Spot to check
     */
    async checkSpotWeather(spot) {
        if (!spot.access?.weatherSensitive) return;
        
        // Find nearest city
        const nearestCity = this.findNearestCity(
            spot.coordinates.lat,
            spot.coordinates.lon
        );
        
        if (!nearestCity) return;
        
        try {
            // Get current weather data
            const weatherData = this.uiState.weatherData;
            if (!weatherData || !weatherData.previsions) return;
            
            const cityWeather = weatherData.previsions.find(p => 
                p.nom === nearestCity.nom
            );
            
            if (cityWeather && cityWeather.jours && cityWeather.jours[0]) {
                const today = cityWeather.jours[0];
                const isRainy = today.pluie && today.pluie > 0.5;
                
                if (isRainy) {
                    this.uiState.showNotification(
                        `⚠️ Pluie prévue près de "${spot.name}" - Évite ce spot aujourd'hui`,
                        'warning'
                    );
                }
            }
        } catch (error) {
            console.error('Failed to check spot weather:', error);
        }
    }
    
    /**
     * Check all weather-sensitive spots
     * @private
     */
    async checkWeatherSensitiveSpots() {
        const sensitiveSpots = this.spotManager.getWeatherSensitiveSpots();
        
        for (const spot of sensitiveSpots) {
            await this.checkSpotWeather(spot);
        }
    }
    
    /**
     * Find nearest city to coordinates
     * @private
     */
    findNearestCity(lat, lon) {
        let nearest = null;
        let minDistance = Infinity;
        
        this.config.cities.forEach(city => {
            const distance = this.calculateDistance(lat, lon, city.lat, city.lon);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = city;
            }
        });
        
        return nearest;
    }
    
    /**
     * Calculate distance between two points
     * @private
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    /**
     * Show my spots
     */
    showMySpots() {
        const spots = this.spotManager.getAllSpots();
        
        if (spots.length === 0) {
            this.uiState.showNotification(
                'Aucun spot enregistré. Clique sur + pour ajouter!',
                'info'
            );
            return;
        }
        
        // Fit map to show all spots
        this.mapController.fitToCustomSpots();
        
        // Show stats
        const stats = this.spotManager.getStatistics();
        this.uiState.showNotification(
            `${stats.total} spots, ${stats.weatherSensitive} sensibles à la météo`,
            'info'
        );
    }
    
    /**
     * Export spots
     */
    exportSpots() {
        const stats = this.spotManager.getStatistics();
        
        if (stats.total === 0) {
            this.uiState.showNotification('Aucun spot à exporter', 'warning');
            return;
        }
        
        this.spotManager.exportAsFile('mes-spots-secrets');
        this.uiState.showNotification(
            `${stats.total} spots exportés avec succès!`,
            'success'
        );
        
        // Close modal
        document.getElementById('import-export-modal').classList.add('hidden');
    }
    
    /**
     * Import spots from file
     * @param {File} file - File to import
     */
    async importSpots(file) {
        try {
            const result = await this.spotManager.importFromFile(file);
            
            if (result.success) {
                // Add markers for new spots
                const spots = this.spotManager.getAllSpots();
                spots.forEach(spot => {
                    if (!this.mapController.customSpotMarkers?.has(spot.id)) {
                        this.mapController.addCustomSpotMarker(spot);
                    }
                });
                
                this.uiState.showNotification(
                    `${result.added} spots importés, ${result.skipped} ignorés (doublons)`,
                    'success'
                );
                
                // Fit map to show all spots
                if (result.added > 0) {
                    this.mapController.fitToCustomSpots();
                }
            } else {
                this.uiState.showNotification(
                    `Erreur d'import: ${result.error}`,
                    'error'
                );
            }
        } catch (error) {
            console.error('Import error:', error);
            this.uiState.showNotification(
                'Erreur lors de l\'import du fichier',
                'error'
            );
        }
        
        // Close modal and reset input
        document.getElementById('import-export-modal').classList.add('hidden');
        document.getElementById('import-file').value = '';
    }
    
    /**
     * Mark spot as visited
     * @param {string} spotId - Spot ID
     */
    markSpotVisited(spotId) {
        this.spotManager.markVisited(spotId);
        const spot = this.spotManager.getAllSpots().find(s => s.id === spotId);
        if (spot) {
            this.mapController.updateCustomSpotMarker(spot);
            this.uiState.showNotification(
                `"${spot.name}" marqué comme visité!`,
                'success'
            );
        }
    }
    
    /**
     * Edit spot (placeholder for future)
     * @param {string} spotId - Spot ID
     */
    editSpot(spotId) {
        // TODO: Implement edit functionality
        this.uiState.showNotification(
            'Fonction d\'édition à venir...',
            'info'
        );
    }
    
    /**
     * Delete spot
     * @param {string} spotId - Spot ID
     */
    deleteSpot(spotId) {
        const spot = this.spotManager.getAllSpots().find(s => s.id === spotId);
        if (!spot) return;
        
        if (confirm(`Supprimer "${spot.name}" ?`)) {
            const deleted = this.spotManager.deleteSpot(spotId);
            if (deleted) {
                this.mapController.removeCustomSpotMarker(spotId);
                this.uiState.showNotification(
                    `"${spot.name}" supprimé`,
                    'success'
                );
            }
        }
    }
    
    /**
     * Handle custom spot click
     * @param {Object} spot - Clicked spot
     */
    handleCustomSpotClick(spot) {
        // Could show detailed panel or navigate
        console.log('Custom spot clicked:', spot);
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        if (this.weatherService) {
            this.weatherService.clearCache();
        }
        
        if (this.uiState) {
            this.uiState.destroy();
        }
        
        if (this.mapController) {
            this.mapController.destroy();
        }
        
        this.isInitialized = false;
        console.log('WeatherApp: Application destroyed');
    }
}

// Export for use in HTML
export default WeatherApp;