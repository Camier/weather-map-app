/**
 * Error Monitoring System
 * Production-ready error tracking and performance monitoring
 */

class ErrorMonitor {
    constructor(config = {}) {
        this.config = {
            maxErrors: config.maxErrors || 50,
            reportingInterval: config.reportingInterval || 30000, // 30 seconds
            enableConsoleLog: config.enableConsoleLog !== false,
            enableLocalStorage: config.enableLocalStorage !== false,
            appVersion: config.appVersion || '2.0.0',
            environment: config.environment || 'production'
        };
        
        this.errors = [];
        this.performance = {
            marks: new Map(),
            measures: new Map(),
            userTimings: []
        };
        
        this.userSession = {
            sessionId: this.generateSessionId(),
            startTime: Date.now(),
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            interactions: 0,
            pageViews: 1
        };
        
        this.initialize();
    }

    /**
     * Initialize error monitoring
     */
    initialize() {
        // Global error handling
        window.addEventListener('error', (event) => {
            this.captureError({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                stack: event.error?.stack
            });
        });

        // Promise rejection handling
        window.addEventListener('unhandledrejection', (event) => {
            this.captureError({
                type: 'promise',
                message: event.reason?.message || 'Unhandled Promise Rejection',
                reason: event.reason,
                stack: event.reason?.stack
            });
        });

        // Track user interactions
        ['click', 'touchstart', 'keydown'].forEach(eventType => {
            document.addEventListener(eventType, () => {
                this.userSession.interactions++;
            }, { passive: true });
        });

        // Performance observer for navigation timing
        if ('PerformanceObserver' in window) {
            try {
                const perfObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        this.capturePerformanceEntry(entry);
                    });
                });
                
                perfObserver.observe({ entryTypes: ['navigation', 'measure', 'mark'] });
            } catch (error) {
                console.warn('ErrorMonitor: Performance Observer not supported');
            }
        }

        // Periodic reporting
        setInterval(() => this.generateReport(), this.config.reportingInterval);

        if (this.config.enableConsoleLog) {
            console.log('ErrorMonitor: Initialized for', this.config.environment);
        }
    }

    /**
     * Capture application errors
     * @param {Object} errorData - Error information
     * @param {Object} context - Additional context
     */
    captureError(errorData, context = {}) {
        const error = {
            id: this.generateErrorId(),
            timestamp: Date.now(),
            sessionId: this.userSession.sessionId,
            type: errorData.type || 'unknown',
            message: errorData.message,
            stack: errorData.stack,
            context: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                timestamp: new Date().toISOString(),
                ...context
            },
            severity: this.determineSeverity(errorData),
            fingerprint: this.generateFingerprint(errorData)
        };

        this.errors.push(error);

        // Maintain error limit
        if (this.errors.length > this.config.maxErrors) {
            this.errors.shift();
        }

        // Store in localStorage for persistence
        if (this.config.enableLocalStorage) {
            this.persistError(error);
        }

        // Log to console in development
        if (this.config.enableConsoleLog) {
            console.error('ErrorMonitor:', error);
        }

        // Trigger immediate report for critical errors
        if (error.severity === 'critical') {
            this.generateReport();
        }
    }

    /**
     * Capture performance metrics
     * @param {PerformanceEntry} entry - Performance entry
     */
    capturePerformanceEntry(entry) {
        if (entry.entryType === 'navigation') {
            this.performance.navigation = {
                loadComplete: entry.loadEventEnd - entry.loadEventStart,
                domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                firstByte: entry.responseStart - entry.requestStart,
                pageLoad: entry.loadEventEnd - entry.navigationStart
            };
        } else if (entry.entryType === 'measure') {
            this.performance.measures.set(entry.name, entry.duration);
        } else if (entry.entryType === 'mark') {
            this.performance.marks.set(entry.name, entry.startTime);
        }
    }

    /**
     * Track custom performance metrics
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Unit of measurement
     */
    trackPerformance(name, value, unit = 'ms') {
        this.performance.userTimings.push({
            name,
            value,
            unit,
            timestamp: Date.now()
        });
    }

    /**
     * Track weather app specific metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in ms
     * @param {Object} metadata - Additional data
     */
    trackWeatherOperation(operation, duration, metadata = {}) {
        this.trackPerformance(`weather_${operation}`, duration, 'ms');
        
        if (this.config.enableConsoleLog) {
            console.log(`Weather Operation: ${operation} completed in ${duration}ms`, metadata);
        }
    }

    /**
     * Generate unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique error ID
     * @returns {string} Error ID
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate error fingerprint for deduplication
     * @param {Object} errorData - Error data
     * @returns {string} Fingerprint
     */
    generateFingerprint(errorData) {
        const message = errorData.message || '';
        const type = errorData.type || '';
        const stack = errorData.stack || '';
        
        // Simple hash for fingerprinting
        return btoa(message + type + stack.split('\n')[0]).slice(0, 16);
    }

    /**
     * Determine error severity
     * @param {Object} errorData - Error data
     * @returns {string} Severity level
     */
    determineSeverity(errorData) {
        const message = (errorData.message || '').toLowerCase();
        
        if (message.includes('network') || message.includes('fetch')) {
            return 'warning';
        }
        
        if (message.includes('timeout') || message.includes('abort')) {
            return 'info';
        }
        
        if (errorData.type === 'promise' || message.includes('unhandled')) {
            return 'error';
        }
        
        return 'error';
    }

    /**
     * Persist error to localStorage
     * @param {Object} error - Error object
     */
    persistError(error) {
        try {
            const key = `error_monitor_${this.userSession.sessionId}`;
            const existing = localStorage.getItem(key);
            const errors = existing ? JSON.parse(existing) : [];
            
            errors.push(error);
            
            // Keep only last 20 errors per session
            if (errors.length > 20) {
                errors.shift();
            }
            
            localStorage.setItem(key, JSON.stringify(errors));
        } catch (e) {
            console.warn('ErrorMonitor: Failed to persist error', e);
        }
    }

    /**
     * Generate comprehensive error report
     * @returns {Object} Error report
     */
    generateReport() {
        const now = Date.now();
        const sessionDuration = now - this.userSession.startTime;
        
        const report = {
            session: {
                ...this.userSession,
                duration: sessionDuration,
                endTime: now
            },
            errors: {
                total: this.errors.length,
                bySeverity: this.groupErrorsBySeverity(),
                byType: this.groupErrorsByType(),
                recent: this.errors.slice(-5) // Last 5 errors
            },
            performance: {
                navigation: this.performance.navigation,
                customMetrics: Array.from(this.performance.measures.entries()),
                userTimings: this.performance.userTimings.slice(-10) // Last 10 metrics
            },
            browser: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine,
                hardwareConcurrency: navigator.hardwareConcurrency
            },
            timestamp: new Date().toISOString(),
            appVersion: this.config.appVersion,
            environment: this.config.environment
        };

        if (this.config.enableConsoleLog) {
            console.log('ErrorMonitor Report:', report);
        }

        return report;
    }

    /**
     * Group errors by severity
     * @returns {Object} Errors grouped by severity
     */
    groupErrorsBySeverity() {
        return this.errors.reduce((acc, error) => {
            acc[error.severity] = (acc[error.severity] || 0) + 1;
            return acc;
        }, {});
    }

    /**
     * Group errors by type
     * @returns {Object} Errors grouped by type
     */
    groupErrorsByType() {
        return this.errors.reduce((acc, error) => {
            acc[error.type] = (acc[error.type] || 0) + 1;
            return acc;
        }, {});
    }

    /**
     * Clear all stored errors and reset session
     */
    reset() {
        this.errors = [];
        this.performance.userTimings = [];
        this.userSession = {
            ...this.userSession,
            sessionId: this.generateSessionId(),
            startTime: Date.now(),
            interactions: 0
        };

        if (this.config.enableLocalStorage) {
            const key = `error_monitor_${this.userSession.sessionId}`;
            localStorage.removeItem(key);
        }
    }

    /**
     * Get current error statistics
     * @returns {Object} Error statistics
     */
    getStats() {
        return {
            totalErrors: this.errors.length,
            sessionDuration: Date.now() - this.userSession.startTime,
            userInteractions: this.userSession.interactions,
            bySeverity: this.groupErrorsBySeverity(),
            byType: this.groupErrorsByType()
        };
    }
}

// User-friendly error messages for the weather app
export const WEATHER_ERROR_MESSAGES = {
    'network': '🌐 Connexion Internet lente. Vérification en cours...',
    'api_timeout': '⏱️ Serveurs météo surchargés. Nouvelles données dans 30s...',
    'location': '📍 Localisation non trouvée. Essayez une ville proche.',
    'data_invalid': '📊 Données météo incomplètes. Actualisation automatique...',
    'map_error': '🗺️ Erreur de carte. Rechargement en cours...',
    'storage_full': '💾 Stockage local plein. Nettoyage automatique...',
    'unknown': '⚠️ Erreur temporaire. L\'application continue de fonctionner.'
};

export default ErrorMonitor;