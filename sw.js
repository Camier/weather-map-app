// Service Worker for Weather Map - Offline Functionality
const CACHE_NAME = 'weather-map-v1.2';
const STATIC_CACHE = 'weather-map-static-v1.2';
const WEATHER_CACHE = 'weather-data-v1.2';

// Critical files for offline operation
const STATIC_FILES = [
    '/',
    '/weather-map-mobile-optimized.html',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Weather API URLs pattern
const WEATHER_API_PATTERN = /^https:\/\/api\.open-meteo\.com\/v1\/forecast/;

// Install event - cache critical resources
self.addEventListener('install', event => {
    console.log('SW: Installing...');
    
    event.waitUntil(
        Promise.all([
            // Cache static files
            caches.open(STATIC_CACHE).then(cache => {
                console.log('SW: Caching static files');
                return cache.addAll(STATIC_FILES.filter(url => !url.includes('tailwindcss')));
            }),
            
            // Initialize weather cache
            caches.open(WEATHER_CACHE).then(cache => {
                console.log('SW: Weather cache initialized');
                return cache;
            })
        ]).then(() => {
            console.log('SW: Installation complete');
            return self.skipWaiting();
        }).catch(error => {
            console.error('SW: Installation failed:', error);
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    console.log('SW: Activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE && 
                        cacheName !== WEATHER_CACHE && 
                        cacheName !== CACHE_NAME) {
                        console.log('SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('SW: Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Handle different types of requests
    if (WEATHER_API_PATTERN.test(request.url)) {
        // Weather API requests - cache with expiration
        event.respondWith(handleWeatherRequest(request));
    } else if (request.destination === 'document') {
        // HTML documents - network first, cache fallback
        event.respondWith(handleDocumentRequest(request));
    } else if (request.destination === 'script' || 
               request.destination === 'style' || 
               request.destination === 'font') {
        // Static assets - cache first
        event.respondWith(handleStaticRequest(request));
    } else {
        // Other requests - network first
        event.respondWith(handleNetworkFirst(request));
    }
});

// Handle weather API requests with intelligent caching
async function handleWeatherRequest(request) {
    const url = new URL(request.url);
    const cacheKey = `weather-${url.searchParams.get('latitude')}-${url.searchParams.get('longitude')}`;
    
    try {
        // Try network first for fresh data
        const response = await fetch(request);
        
        if (response.ok) {
            // Cache successful response with timestamp
            const cache = await caches.open(WEATHER_CACHE);
            const responseClone = response.clone();
            
            // Add timestamp to cached response
            const cachedData = {
                timestamp: Date.now(),
                data: await responseClone.json()
            };
            
            await cache.put(cacheKey, new Response(JSON.stringify(cachedData), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'max-age=3600' // 1 hour
                }
            }));
            
            console.log('SW: Weather data cached for', cacheKey);
            return response;
        }
    } catch (error) {
        console.log('SW: Network failed, trying cache for weather data');
    }
    
    // Network failed, try cache
    const cache = await caches.open(WEATHER_CACHE);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
        const cachedData = await cachedResponse.json();
        const age = Date.now() - cachedData.timestamp;
        
        // Return cached data if less than 6 hours old
        if (age < 6 * 60 * 60 * 1000) {
            console.log('SW: Serving cached weather data (age:', Math.round(age / 60000), 'min)');
            return new Response(JSON.stringify(cachedData.data), {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Cache': 'SW-HIT',
                    'X-Cache-Age': age.toString()
                }
            });
        } else {
            console.log('SW: Cached weather data expired');
        }
    }
    
    // No valid cache, return error
    return new Response(JSON.stringify({
        error: 'Données météo non disponibles hors ligne',
        offline: true,
        timestamp: Date.now()
    }), {
        status: 503,
        headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'SW-MISS'
        }
    });
}

// Handle document requests (HTML pages)
async function handleDocumentRequest(request) {
    try {
        // Try network first
        const response = await fetch(request);
        if (response.ok) {
            // Cache successful response
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
            return response;
        }
    } catch (error) {
        console.log('SW: Network failed for document, trying cache');
    }
    
    // Network failed, try cache
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // No cache available, return offline page
    return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Hors ligne - Carte Météo</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: #f5f5f5; 
                }
                .offline-message {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    max-width: 400px;
                    margin: 0 auto;
                }
            </style>
        </head>
        <body>
            <div class="offline-message">
                <h1>📵 Mode hors ligne</h1>
                <p>Vous êtes actuellement hors ligne.</p>
                <p>Reconnectez-vous à internet pour accéder aux dernières données météo.</p>
                <button onclick="location.reload()">🔄 Réessayer</button>
            </div>
        </body>
        </html>
    `, {
        headers: { 'Content-Type': 'text/html' }
    });
}

// Handle static assets (CSS, JS, fonts)
async function handleStaticRequest(request) {
    const cache = await caches.open(STATIC_CACHE);
    
    // Try cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Cache miss, try network
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
            return response;
        }
    } catch (error) {
        console.log('SW: Failed to fetch static asset:', request.url);
    }
    
    return new Response('Resource not available offline', { status: 503 });
}

// Handle other requests with network-first strategy
async function handleNetworkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            // Optionally cache successful responses
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
            return response;
        }
    } catch (error) {
        // Network failed, try cache
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
    }
    
    return new Response('Not available offline', { status: 503 });
}

// Message handling for cache management
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAR_WEATHER_CACHE') {
        caches.delete(WEATHER_CACHE).then(() => {
            console.log('SW: Weather cache cleared');
            event.ports[0].postMessage({ success: true });
        });
    }
    
    if (event.data && event.data.type === 'GET_CACHE_STATUS') {
        Promise.all([
            caches.open(STATIC_CACHE).then(cache => cache.keys()),
            caches.open(WEATHER_CACHE).then(cache => cache.keys())
        ]).then(([staticKeys, weatherKeys]) => {
            event.ports[0].postMessage({
                staticCached: staticKeys.length,
                weatherCached: weatherKeys.length,
                totalSize: staticKeys.length + weatherKeys.length
            });
        });
    }
});

// Background sync for weather data updates
self.addEventListener('sync', event => {
    if (event.tag === 'weather-update') {
        console.log('SW: Background sync triggered for weather update');
        event.waitUntil(updateWeatherCache());
    }
});

// Update weather cache in background
async function updateWeatherCache() {
    try {
        const cache = await caches.open(WEATHER_CACHE);
        const cachedRequests = await cache.keys();
        
        // Update cached weather data
        for (const request of cachedRequests) {
            try {
                const response = await fetch(request);
                if (response.ok) {
                    await cache.put(request, response);
                    console.log('SW: Background updated weather cache for', request.url);
                }
            } catch (error) {
                console.log('SW: Failed to update cache for', request.url);
            }
        }
    } catch (error) {
        console.error('SW: Background weather update failed:', error);
    }
}

// Clean up expired weather cache entries
setInterval(async () => {
    try {
        const cache = await caches.open(WEATHER_CACHE);
        const cachedRequests = await cache.keys();
        const now = Date.now();
        
        for (const request of cachedRequests) {
            const response = await cache.match(request);
            if (response) {
                const cachedData = await response.json();
                const age = now - cachedData.timestamp;
                
                // Remove entries older than 24 hours
                if (age > 24 * 60 * 60 * 1000) {
                    await cache.delete(request);
                    console.log('SW: Cleaned expired weather cache entry');
                }
            }
        }
    } catch (error) {
        console.error('SW: Cache cleanup failed:', error);
    }
}, 60 * 60 * 1000); // Run every hour