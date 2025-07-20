/**
 * Enhanced Service Worker for Weather Map App
 * Provides offline functionality, strategic caching, and background sync
 */

const CACHE_NAME = 'weather-map-v2.0.0';
const API_CACHE_NAME = 'weather-api-v2.0.0';
const FALLBACK_CACHE_NAME = 'weather-fallback-v2.0.0';

// Core app files that should always be cached
const CORE_FILES = [
    '/',
    '/weather-map-modular.html',
    '/weather-app.js',
    '/weather-service.js',
    '/map-controller.js',
    '/ui-state-manager.js',
    '/weather-conditions.js',
    '/cdn-fallbacks.js',
    '/error-monitor.js'
];

// CDN resources with fallbacks
const CDN_RESOURCES = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// API endpoints to cache
const API_PATTERNS = [
    /^https:\/\/api\.open-meteo\.com\/v1\/forecast/
];

// Cache strategies configuration
const CACHE_STRATEGIES = {
    core: 'cache-first',
    api: 'network-first-with-fallback',
    cdn: 'cache-first-with-network-fallback',
    images: 'cache-first'
};

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
    api: 1000 * 60 * 60,      // 1 hour
    cdn: 1000 * 60 * 60 * 24, // 24 hours
    core: 1000 * 60 * 60 * 24 * 7 // 7 days
};

/**
 * Install event - cache core resources
 */
self.addEventListener('install', event => {
    console.log('SW: Installing enhanced service worker...');
    
    event.waitUntil(
        Promise.all([
            cacheCore(),
            cacheCDNResources(),
            self.skipWaiting()
        ])
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', event => {
    console.log('SW: Activating enhanced service worker...');
    
    event.waitUntil(
        Promise.all([
            cleanupOldCaches(),
            self.clients.claim()
        ])
    );
});

/**
 * Fetch event - handle all network requests with appropriate strategies
 */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-HTTP requests
    if (!request.url.startsWith('http')) return;
    
    // Determine caching strategy based on request type
    if (isCoreFile(request.url)) {
        event.respondWith(handleCoreFile(request));
    } else if (isAPIRequest(request.url)) {
        event.respondWith(handleAPIRequest(request));
    } else if (isCDNResource(request.url)) {
        event.respondWith(handleCDNResource(request));
    } else {
        event.respondWith(handleGenericRequest(request));
    }
});

/**
 * Background sync for weather data updates
 */
self.addEventListener('sync', event => {
    console.log('SW: Background sync triggered:', event.tag);
    
    if (event.tag === 'background-weather-sync') {
        event.waitUntil(backgroundWeatherSync());
    }
});

/**
 * Message handling for cache management
 */
self.addEventListener('message', event => {
    const { action, data } = event.data;
    
    switch (action) {
        case 'CACHE_WEATHER_DATA':
            event.waitUntil(cacheWeatherData(data));
            break;
        case 'CLEAR_CACHE':
            event.waitUntil(clearAllCaches());
            break;
        case 'GET_CACHE_STATUS':
            event.waitUntil(getCacheStatus().then(status => {
                event.ports[0].postMessage(status);
            }));
            break;
    }
});

// ============================================================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Cache core application files
 */
async function cacheCore() {
    try {
        const cache = await caches.open(CACHE_NAME);
        console.log('SW: Caching core files...');
        
        const cachePromises = CORE_FILES.map(async file => {
            try {
                const response = await fetch(file);
                if (response.ok) {
                    await cache.put(file, response);
                    console.log('SW: Cached', file);
                }
            } catch (error) {
                console.warn('SW: Failed to cache', file, error);
            }
        });
        
        await Promise.allSettled(cachePromises);
    } catch (error) {
        console.error('SW: Core caching failed:', error);
    }
}

/**
 * Cache CDN resources
 */
async function cacheCDNResources() {
    try {
        const cache = await caches.open(CACHE_NAME);
        console.log('SW: Caching CDN resources...');
        
        const cachePromises = CDN_RESOURCES.map(async url => {
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (response.ok) {
                    await cache.put(url, response);
                    console.log('SW: Cached CDN resource', url);
                }
            } catch (error) {
                console.warn('SW: Failed to cache CDN resource', url, error);
            }
        });
        
        await Promise.allSettled(cachePromises);
    } catch (error) {
        console.error('SW: CDN caching failed:', error);
    }
}

/**
 * Clean up old caches
 */
async function cleanupOldCaches() {
    try {
        const cacheNames = await caches.keys();
        const validCaches = [CACHE_NAME, API_CACHE_NAME, FALLBACK_CACHE_NAME];
        
        const cleanupPromises = cacheNames
            .filter(name => !validCaches.includes(name))
            .map(name => {
                console.log('SW: Deleting old cache:', name);
                return caches.delete(name);
            });
        
        await Promise.all(cleanupPromises);
    } catch (error) {
        console.error('SW: Cache cleanup failed:', error);
    }
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('SW: All caches cleared');
    } catch (error) {
        console.error('SW: Failed to clear caches:', error);
    }
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

/**
 * Handle core application files (cache-first)
 */
async function handleCoreFile(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            // Serve from cache and update in background if needed
            if (isCacheExpired(cachedResponse, CACHE_DURATIONS.core)) {
                event.waitUntil(updateCacheInBackground(request, cache));
            }
            return cachedResponse;
        }
        
        // Fallback to network
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('SW: Core file handler failed:', error);
        return new Response('Offline - Core file not available', { status: 503 });
    }
}

/**
 * Handle API requests (network-first with intelligent fallback)
 */
async function handleAPIRequest(request) {
    try {
        const cache = await caches.open(API_CACHE_NAME);
        
        // Try network first
        try {
            const networkResponse = await fetch(request, { 
                signal: AbortSignal.timeout(8000) // 8 second timeout
            });
            
            if (networkResponse.ok) {
                // Cache successful response
                cache.put(request, networkResponse.clone());
                return networkResponse;
            }
        } catch (networkError) {
            console.warn('SW: Network request failed, trying cache:', networkError.message);
        }
        
        // Fallback to cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log('SW: Serving stale weather data from cache');
            // Add header to indicate stale data
            const staleResponse = new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers: {
                    ...cachedResponse.headers,
                    'X-Cache-Status': 'stale'
                }
            });
            return staleResponse;
        }
        
        // No cache available - return offline response
        return createOfflineWeatherResponse();
    } catch (error) {
        console.error('SW: API handler failed:', error);
        return createOfflineWeatherResponse();
    }
}

/**
 * Handle CDN resources (cache-first with network fallback)
 */
async function handleCDNResource(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse && !isCacheExpired(cachedResponse, CACHE_DURATIONS.cdn)) {
            return cachedResponse;
        }
        
        // Try to update from network
        try {
            const networkResponse = await fetch(request, { mode: 'cors' });
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
                return networkResponse;
            }
        } catch (networkError) {
            console.warn('SW: CDN network failed:', networkError.message);
        }
        
        // Return cached version even if expired
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // No cache available
        return new Response('CDN resource not available offline', { status: 503 });
    } catch (error) {
        console.error('SW: CDN handler failed:', error);
        return new Response('CDN resource error', { status: 500 });
    }
}

/**
 * Handle generic requests
 */
async function handleGenericRequest(request) {
    try {
        return await fetch(request);
    } catch (error) {
        console.warn('SW: Generic request failed:', error.message);
        return new Response('Request failed', { status: 503 });
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if URL is a core application file
 */
function isCoreFile(url) {
    return CORE_FILES.some(file => url.endsWith(file) || url.includes(file));
}

/**
 * Check if URL is an API request
 */
function isAPIRequest(url) {
    return API_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if URL is a CDN resource
 */
function isCDNResource(url) {
    return CDN_RESOURCES.some(resource => url.includes(resource) || resource.includes(url));
}

/**
 * Check if cached response is expired
 */
function isCacheExpired(response, maxAge) {
    const cachedDate = response.headers.get('sw-cached-date');
    if (!cachedDate) return true;
    
    const cacheTime = new Date(cachedDate).getTime();
    const now = Date.now();
    return (now - cacheTime) > maxAge;
}

/**
 * Update cache in background
 */
async function updateCacheInBackground(request, cache) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const responseToCache = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                    ...response.headers,
                    'sw-cached-date': new Date().toISOString()
                }
            });
            await cache.put(request, responseToCache);
        }
    } catch (error) {
        console.warn('SW: Background update failed:', error);
    }
}

/**
 * Create offline weather response
 */
function createOfflineWeatherResponse() {
    const offlineData = {
        error: 'offline',
        message: 'Données météo non disponibles hors ligne',
        previsions: [],
        dates: [],
        derniere_mise_a_jour: null
    };
    
    return new Response(JSON.stringify(offlineData), {
        status: 503,
        headers: {
            'Content-Type': 'application/json',
            'X-Cache-Status': 'offline'
        }
    });
}

/**
 * Background sync for weather data
 */
async function backgroundWeatherSync() {
    try {
        console.log('SW: Performing background weather sync...');
        
        // This would typically update weather data in the background
        // For now, we'll just log that sync occurred
        
        // You could extend this to:
        // 1. Fetch fresh weather data
        // 2. Update cached data
        // 3. Notify the app of updates
        
        console.log('SW: Background sync completed');
    } catch (error) {
        console.error('SW: Background sync failed:', error);
    }
}

/**
 * Cache weather data from app
 */
async function cacheWeatherData(data) {
    try {
        const cache = await caches.open(API_CACHE_NAME);
        const response = new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'sw-cached-date': new Date().toISOString()
            }
        });
        
        await cache.put('/api/weather/latest', response);
        console.log('SW: Weather data cached from app');
    } catch (error) {
        console.error('SW: Failed to cache weather data:', error);
    }
}

/**
 * Get cache status
 */
async function getCacheStatus() {
    try {
        const cacheNames = await caches.keys();
        const status = {
            totalCaches: cacheNames.length,
            caches: {},
            totalSize: 0
        };
        
        for (const name of cacheNames) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            status.caches[name] = {
                entries: keys.length,
                urls: keys.map(req => req.url)
            };
        }
        
        return status;
    } catch (error) {
        console.error('SW: Failed to get cache status:', error);
        return { error: error.message };
    }
}

console.log('SW: Enhanced service worker loaded for Weather Map App v2.0.0');