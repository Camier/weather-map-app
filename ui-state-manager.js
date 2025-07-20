/**
 * UI State Manager - Extracted from monolithic code
 * Manages all UI state, statistics, and component updates
 * 
 * Following scanner.rs refactoring pattern:
 * - Single responsibility: UI state management
 * - Clean separation from weather data logic
 * - Mobile-optimized component handling
 * - Event-driven architecture
 */

import WeatherConditions from './weather-conditions.js';

class UIStateManager {
    constructor(weatherService, options = {}) {
        this.weatherService = weatherService;
        this.weatherConditions = new WeatherConditions();
        this.options = {
            maxDays: options.maxDays || 7,
            updateInterval: options.updateInterval || 60000,
            ...options
        };
        
        // UI State
        this.currentDayIndex = 0;
        this.showOnlyDry = false;
        this.loadingStates = new Map();
        this.isInitialized = false;
        this.activeFilters = new Set(['cascade', 'thermes', 'lac', 'plage', 'gorges', 'grotte', 'piscine', 'vue', 'canyon']);
        this.weatherData = null;
        this.weeklyStats = {};
        this.isLoading = false;
        
        // UI Elements Cache
        this.elements = {};
        this.mobileState = {
            panelsOpen: new Set(),
            overlayVisible: false
        };
        
        // Event listeners storage for cleanup
        this.eventListeners = new Map();
        
        this.initializeElements();
        this.setupEventHandlers();
    }
    
    /**
     * Initialize and cache UI elements
     * @private
     */
    initializeElements() {
        // Core elements
        this.elements = {
            // Sliders and controls
            daySlider: document.getElementById('day-slider'),
            dateLabel: document.getElementById('date-label'),
            
            // Status and loading
            loadingOverlay: document.getElementById('overlay-chargement'),
            loadingText: document.getElementById('texte-chargement'),
            dataStatus: document.getElementById('data-status'),
            connectionStatus: document.getElementById('connection-status'),
            
            // Statistics display
            citiesWithoutRain: document.getElementById('villes-sans-pluie'),
            maxTemperature: document.getElementById('temperature-max'),
            idealActivities: document.getElementById('activites-ideales'),
            
            // Mobile panels
            mobileOverlay: document.getElementById('mobile-overlay'),
            activitiesPanel: document.getElementById('panneau-activites'),
            activitiesList: document.getElementById('liste-activites'),
            
            // Buttons
            btnDryOnly: document.getElementById('btn-sans-pluie'),
            btnActivities: document.getElementById('btn-activites'),
            btnWeek: document.getElementById('btn-semaine'),
            btnItinerary: document.getElementById('btn-itineraire'),
            closeActivities: document.getElementById('fermer-activites'),
            
            // Search and filters
            searchSpots: document.getElementById('recherche-spots'),
            activityFilters: document.getElementById('filtres-activites')
        };
        
        // Validate required elements
        const missingElements = Object.entries(this.elements)
            .filter(([key, element]) => !element)
            .map(([key]) => key);
            
        if (missingElements.length > 0) {
            console.warn('UIStateManager: Missing elements:', missingElements);
        }
    }
    
    /**
     * Setup all event handlers
     * @private
     */
    setupEventHandlers() {
        // Day slider
        this.addEventHandler(this.elements.daySlider, 'input', (e) => {
            this.setCurrentDay(parseInt(e.target.value));
        });
        
        // Control buttons
        this.addEventHandler(this.elements.btnDryOnly, 'click', () => {
            this.toggleDryOnly();
        });
        
        this.addEventHandler(this.elements.btnActivities, 'click', () => {
            this.togglePanel('activities');
        });
        
        this.addEventHandler(this.elements.btnWeek, 'click', () => {
            this.showWeeklyStats();
        });
        
        this.addEventHandler(this.elements.btnItinerary, 'click', () => {
            this.togglePanel('itinerary');
        });
        
        // Mobile panel controls
        this.addEventHandler(this.elements.closeActivities, 'click', () => {
            this.closePanel('activities');
        });
        
        this.addEventHandler(this.elements.mobileOverlay, 'click', () => {
            this.closeAllPanels();
        });
        
        // Search functionality
        if (this.elements.searchSpots) {
            this.addEventHandler(this.elements.searchSpots, 'input', (e) => {
                this.filterActivitiesBySearch(e.target.value);
            });
        }
        
        // Activity type filters
        if (this.elements.activityFilters) {
            this.elements.activityFilters.addEventListener('click', (e) => {
                if (e.target.classList.contains('filtre-type')) {
                    this.toggleActivityFilter(e.target.dataset.type);
                }
            });
        }
        
        // Connection status monitoring
        this.addEventHandler(window, 'online', () => this.updateConnectionStatus());
        this.addEventHandler(window, 'offline', () => this.updateConnectionStatus());
        
        // Touch optimization for mobile
        this.setupTouchOptimization();
    }
    
    /**
     * Add event handler with cleanup tracking
     * @private
     */
    addEventHandler(element, event, handler) {
        if (!element) return;
        
        element.addEventListener(event, handler);
        
        // Store for cleanup
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler });
    }
    
    /**
     * Setup touch optimization for mobile devices
     * @private
     */
    setupTouchOptimization() {
        // Add touch classes for all interactive elements
        const touchElements = document.querySelectorAll('.touch-button, .carte-meteo, .filtre-type');
        
        touchElements.forEach(element => {
            element.addEventListener('touchstart', function(e) {
                this.style.transform = 'scale(0.95)';
            }, { passive: true });
            
            element.addEventListener('touchend', function(e) {
                this.style.transform = '';
            }, { passive: true });
            
            element.addEventListener('touchcancel', function(e) {
                this.style.transform = '';
            }, { passive: true });
        });
    }
    
    /**
     * Update weather data and refresh UI
     * @param {Object} newWeatherData - New weather data from service
     */
    updateWeatherData(newWeatherData) {
        this.weatherData = newWeatherData;
        this.calculateWeeklyStats();
        this.refreshCurrentView();
        
        // Update data status
        this.updateDataStatus(newWeatherData.metadata);
    }
    
    /**
     * Set current day and update all dependent UI
     * @param {number} dayIndex - Day index (0-6)
     */
    setCurrentDay(dayIndex) {
        if (dayIndex < 0 || dayIndex >= this.options.maxDays) return;
        
        this.currentDayIndex = dayIndex;
        this.updateDateLabel();
        this.updateDayStats();
        this.updateSliderPosition();
        
        // Emit event for map updates
        this.emit('dayChanged', { dayIndex, weatherData: this.getCurrentDayData() });
    }
    
    /**
     * Toggle dry-only filter
     */
    toggleDryOnly() {
        this.showOnlyDry = !this.showOnlyDry;
        
        const btn = this.elements.btnDryOnly;
        if (btn) {
            btn.textContent = this.showOnlyDry ? '🌍 Tout' : '☀️ Sec';
            btn.className = this.showOnlyDry ? 
                btn.className.replace('bg-green-600', 'bg-gray-600') :
                btn.className.replace('bg-gray-600', 'bg-green-600');
        }
        
        this.emit('filterChanged', { showOnlyDry: this.showOnlyDry });
    }
    
    /**
     * Toggle activity type filter
     * @param {string} activityType - Type of activity to toggle
     */
    toggleActivityFilter(activityType) {
        if (this.activeFilters.has(activityType)) {
            this.activeFilters.delete(activityType);
        } else {
            this.activeFilters.add(activityType);
        }
        
        // Update filter button appearance
        const filterBtn = document.querySelector(`[data-type="${activityType}"]`);
        if (filterBtn) {
            filterBtn.classList.toggle('opacity-50', !this.activeFilters.has(activityType));
        }
        
        this.emit('activityFiltersChanged', { activeFilters: [...this.activeFilters] });
    }
    
    /**
     * Toggle mobile panel
     * @param {string} panelName - Name of panel to toggle
     */
    togglePanel(panelName) {
        const isOpen = this.mobileState.panelsOpen.has(panelName);
        
        if (isOpen) {
            this.closePanel(panelName);
        } else {
            this.openPanel(panelName);
        }
    }
    
    /**
     * Open specific mobile panel
     * @param {string} panelName - Name of panel to open
     */
    openPanel(panelName) {
        // Close other panels first
        this.closeAllPanels();
        
        this.mobileState.panelsOpen.add(panelName);
        
        const panelElement = this.getPanelElement(panelName);
        if (panelElement) {
            panelElement.classList.add('open');
        }
        
        if (this.elements.mobileOverlay) {
            this.elements.mobileOverlay.classList.add('show');
            this.mobileState.overlayVisible = true;
        }
        
        this.emit('panelOpened', { panelName });
    }
    
    /**
     * Close specific mobile panel
     * @param {string} panelName - Name of panel to close
     */
    closePanel(panelName) {
        this.mobileState.panelsOpen.delete(panelName);
        
        const panelElement = this.getPanelElement(panelName);
        if (panelElement) {
            panelElement.classList.remove('open');
        }
        
        // Hide overlay if no panels open
        if (this.mobileState.panelsOpen.size === 0) {
            if (this.elements.mobileOverlay) {
                this.elements.mobileOverlay.classList.remove('show');
                this.mobileState.overlayVisible = false;
            }
        }
        
        this.emit('panelClosed', { panelName });
    }
    
    /**
     * Close all mobile panels
     */
    closeAllPanels() {
        const openPanels = [...this.mobileState.panelsOpen];
        
        openPanels.forEach(panelName => {
            const panelElement = this.getPanelElement(panelName);
            if (panelElement) {
                panelElement.classList.remove('open');
            }
        });
        
        this.mobileState.panelsOpen.clear();
        
        if (this.elements.mobileOverlay) {
            this.elements.mobileOverlay.classList.remove('show');
            this.mobileState.overlayVisible = false;
        }
        
        this.emit('allPanelsClosed');
    }
    
    /**
     * Get panel element by name
     * @private
     * @param {string} panelName - Panel name
     * @returns {Element|null} Panel element
     */
    getPanelElement(panelName) {
        const panelMap = {
            'activities': this.elements.activitiesPanel,
            'itinerary': document.getElementById('panneau-itineraire'),
            'week': document.getElementById('panneau-semaine')
        };
        
        return panelMap[panelName] || null;
    }
    
    /**
     * Update data status display
     * @param {Object} metadata - Weather data metadata
     */
    updateDataStatus(metadata) {
        if (!this.elements.dataStatus) return;
        
        const { source, age, userWarning, successRate } = metadata;
        
        // Clear previous classes
        this.elements.dataStatus.classList.remove('hidden', 'data-warning', 'data-error', 'data-success');
        
        if (userWarning) {
            this.elements.dataStatus.textContent = `${userWarning.icon} ${userWarning.message}`;
            this.elements.dataStatus.classList.add(`data-${userWarning.level}`);
        } else if (source === 'api') {
            this.elements.dataStatus.textContent = `✅ Données fraîches (${successRate}% réussite)`;
            this.elements.dataStatus.classList.add('data-success');
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                this.elements.dataStatus.classList.add('hidden');
            }, 3000);
        }
    }
    
    /**
     * Update connection status indicator
     */
    updateConnectionStatus() {
        if (!this.elements.connectionStatus) return;
        
        const isOnline = navigator.onLine;
        
        this.elements.connectionStatus.className = isOnline ? 
            'connection-status online' : 
            'connection-status offline';
        this.elements.connectionStatus.textContent = isOnline ? '●' : '⚠';
        
        this.emit('connectionChanged', { isOnline });
    }
    
    /**
     * Calculate weekly statistics
     * @private
     */
    calculateWeeklyStats() {
        if (!this.weatherData?.data) return;
        
        this.weeklyStats = {};
        
        // Extract cities from first day
        const cities = this.weatherData.data[0]?.previsions || [];
        
        cities.forEach(city => {
            let totalRain = 0;
            let rainyDays = 0;
            let avgTemp = 0;
            let validDays = 0;
            
            this.weatherData.data.forEach(day => {
                const cityData = day.previsions.find(p => p.nom === city.nom);
                if (!cityData?.donnees_disponibles) return;
                
                validDays++;
                totalRain += cityData.precipitation || 0;
                avgTemp += (cityData.temp_max + cityData.temp_min) / 2;
                
                if ((cityData.precipitation || 0) > 0.1) rainyDays++;
            });
            
            avgTemp = validDays > 0 ? avgTemp / validDays : 0;
            
            this.weeklyStats[city.nom] = {
                totalRain,
                rainyDays,
                dryDays: validDays - rainyDays,
                validDays,
                avgTemp,
                region: city.region || 'Unknown'
            };
        });
    }
    
    /**
     * Update current day statistics display with enhanced weather conditions
     * @private
     */
    updateDayStats() {
        const currentDayData = this.getCurrentDayData();
        if (!currentDayData) return;
        
        let citiesWithoutRain = 0;
        let maxTemp = -Infinity;
        let idealActivities = 0;
        let totalComfortIndex = 0;
        let citiesWithData = 0;
        
        currentDayData.previsions.forEach(city => {
            if (!city.donnees_disponibles) return;
            citiesWithData++;
            
            // Use enhanced weather assessment
            const assessment = this.weatherConditions.getWeatherAssessment(city);
            
            if ((city.precipitation || 0) === 0) citiesWithoutRain++;
            maxTemp = Math.max(maxTemp, city.temp_max || -Infinity);
            
            // Enhanced activity suitability calculation
            totalComfortIndex += assessment.comfortIndex;
            
            // Count cities with excellent conditions (comfort index >= 70)
            if (assessment.comfortIndex >= 70) {
                idealActivities++;
            }
        });
        
        // Calculate average comfort for better statistics
        const avgComfort = citiesWithData > 0 ? totalComfortIndex / citiesWithData : 0;
        
        // Update display
        if (this.elements.citiesWithoutRain) {
            this.elements.citiesWithoutRain.textContent = citiesWithoutRain;
        }
        
        if (this.elements.maxTemperature) {
            this.elements.maxTemperature.textContent = 
                maxTemp !== -Infinity ? `${Math.round(maxTemp)}°` : '--°';
        }
        
        if (this.elements.idealActivities) {
            this.elements.idealActivities.textContent = idealActivities;
        }
    }
    
    /**
     * Update date label for current day
     * @private
     */
    updateDateLabel() {
        if (!this.elements.dateLabel) return;
        
        const date = new Date();
        date.setDate(date.getDate() + this.currentDayIndex);
        
        this.elements.dateLabel.textContent = date.toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    }
    
    /**
     * Update slider position
     * @private
     */
    updateSliderPosition() {
        if (this.elements.daySlider) {
            this.elements.daySlider.value = this.currentDayIndex;
        }
    }
    
    /**
     * Get current day weather data
     * @returns {Object|null} Current day data
     */
    getCurrentDayData() {
        return this.weatherData?.data?.[this.currentDayIndex] || null;
    }
    
    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Chargement...') {
        this.isLoading = true;
        
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.display = 'flex';
            this.elements.loadingOverlay.style.opacity = '1';
        }
        
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = message;
        }
    }
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.isLoading = false;
        
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                this.elements.loadingOverlay.style.display = 'none';
            }, 500);
        }
    }
    
    /**
     * Show weekly statistics
     */
    showWeeklyStats() {
        // Implementation would create/show weekly stats panel
        console.log('Weekly stats:', this.weeklyStats);
        this.emit('weeklyStatsRequested', { stats: this.weeklyStats });
    }
    
    /**
     * Filter activities by search term
     * @param {string} searchTerm - Search term
     */
    filterActivitiesBySearch(searchTerm) {
        this.emit('searchActivities', { searchTerm: searchTerm.toLowerCase() });
    }
    
    /**
     * Refresh current view
     * @private
     */
    refreshCurrentView() {
        this.updateDayStats();
        this.updateDateLabel();
        this.updateSliderPosition();
        
        // Enable slider if weather data is available
        if (this.elements.daySlider && this.weatherData?.data) {
            this.elements.daySlider.disabled = false;
            this.elements.daySlider.max = Math.min(this.weatherData.data.length - 1, this.options.maxDays - 1);
        }
    }
    
    /**
     * Set loading state for specific component
     * @param {string} component - Component identifier
     * @param {boolean} isLoading - Loading state
     * @param {string} message - Optional loading message
     */
    setLoadingState(component, isLoading, message = '') {
        if (isLoading) {
            this.loadingStates.set(component, { isLoading: true, message, startTime: Date.now() });
        } else {
            this.loadingStates.delete(component);
        }
        
        // Update UI based on loading states
        this.updateLoadingDisplay();
    }
    
    /**
     * Update loading display based on current loading states
     * @private
     */
    updateLoadingDisplay() {
        const hasAnyLoading = this.loadingStates.size > 0;
        const loadingOverlay = document.getElementById('overlay-chargement');
        const loadingText = document.getElementById('texte-chargement');
        
        if (hasAnyLoading && loadingOverlay) {
            const currentLoading = Array.from(this.loadingStates.values())[0];
            loadingOverlay.style.display = 'flex';
            if (loadingText) {
                loadingText.textContent = currentLoading.message || 'Chargement...';
            }
        } else if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        // Disable controls during loading
        if (this.elements.daySlider) {
            this.elements.daySlider.disabled = hasAnyLoading;
        }
        
        // Update button states
        const buttons = document.querySelectorAll('.touch-button');
        buttons.forEach(btn => {
            if (hasAnyLoading) {
                btn.style.opacity = '0.6';
                btn.style.pointerEvents = 'none';
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        });
    }
    
    /**
     * Show empty state when no data is available
     * @param {string} message - Empty state message
     */
    showEmptyState(message = 'Aucune donnée disponible') {
        const dataStatus = this.elements.dataStatus;
        if (dataStatus) {
            dataStatus.textContent = `📭 ${message}`;
            dataStatus.classList.remove('hidden', 'data-warning', 'data-success');
            dataStatus.classList.add('data-error');
        }
        
        // Clear statistics
        if (this.elements.citiesWithoutRain) this.elements.citiesWithoutRain.textContent = '--';
        if (this.elements.maxTemp) this.elements.maxTemp.textContent = '--°';
        if (this.elements.idealActivities) this.elements.idealActivities.textContent = '--';
    }
    
    /**
     * Get current UI state
     * @returns {Object} Current state
     */
    getState() {
        return {
            currentDayIndex: this.currentDayIndex,
            showOnlyDry: this.showOnlyDry,
            activeFilters: [...this.activeFilters],
            isLoading: this.isLoading,
            loadingStates: Object.fromEntries(this.loadingStates),
            openPanels: [...this.mobileState.panelsOpen],
            overlayVisible: this.mobileState.overlayVisible,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Simple event emitter
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data = {}) {
        const customEvent = new CustomEvent(`uistate:${event}`, {
            detail: { ...data, timestamp: Date.now() }
        });
        document.dispatchEvent(customEvent);
    }
    
    /**
     * Listen to UI state events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        document.addEventListener(`uistate:${event}`, handler);
    }
    
    /**
     * Clean up event listeners
     */
    destroy() {
        // Remove all tracked event listeners
        this.eventListeners.forEach((listeners, element) => {
            listeners.forEach(({ event, handler }) => {
                element.removeEventListener(event, handler);
            });
        });
        
        this.eventListeners.clear();
        
        // Reset state
        this.weatherData = null;
        this.weeklyStats = {};
        this.mobileState.panelsOpen.clear();
        this.mobileState.overlayVisible = false;
        
        console.log('UIStateManager: Cleaned up');
    }
}

// Export for use in main application
export default UIStateManager;