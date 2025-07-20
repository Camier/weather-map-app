/**
 * CDN Fallback System
 * Provides offline reliability by detecting CDN failures and providing fallbacks
 */

class CDNFallbackManager {
    constructor() {
        this.cdnStatus = new Map();
        this.fallbackStrategies = new Map();
        this.initializeFallbacks();
    }

    /**
     * Initialize fallback strategies for critical dependencies
     * @private
     */
    initializeFallbacks() {
        // Leaflet fallback strategy
        this.fallbackStrategies.set('leaflet', {
            primary: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
            fallback: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
            local: './vendors/leaflet/leaflet.min.js',
            hasLocalFallback: false, // No local files available
            test: () => typeof window.L !== 'undefined'
        });

        // Tailwind CSS fallback
        this.fallbackStrategies.set('tailwind', {
            primary: 'https://cdn.tailwindcss.com',
            fallback: 'https://unpkg.com/tailwindcss@3.3.0/lib/index.js',
            local: './vendors/tailwind/tailwind.min.css',
            hasLocalFallback: false, // No local files available
            test: () => this.testTailwindCSS()
        });

        // Google Fonts fallback
        this.fallbackStrategies.set('fonts', {
            primary: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
            fallback: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/index.css',
            local: './vendors/fonts/inter.css',
            hasLocalFallback: false, // No local files available
            test: () => this.testFontLoad('Inter')
        });
    }

    /**
     * Test if Tailwind CSS is loaded and working
     * @private
     * @returns {boolean} True if Tailwind is working
     */
    testTailwindCSS() {
        try {
            const testElement = document.createElement('div');
            testElement.className = 'bg-blue-500 text-white p-4 hidden';
            document.body.appendChild(testElement);
            
            const computed = window.getComputedStyle(testElement);
            const hasBlueBackground = computed.backgroundColor === 'rgb(59, 130, 246)';
            const hasWhiteText = computed.color === 'rgb(255, 255, 255)';
            const hasPadding = computed.padding === '16px';
            
            document.body.removeChild(testElement);
            return hasBlueBackground && hasWhiteText && hasPadding;
        } catch (error) {
            return false;
        }
    }

    /**
     * Test if a font family is loaded
     * @private
     * @param {string} fontFamily - Font family name
     * @returns {boolean} True if font is loaded
     */
    testFontLoad(fontFamily) {
        try {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            // Test with fallback font
            context.font = '16px serif';
            const fallbackWidth = context.measureText('Test').width;
            
            // Test with target font
            context.font = `16px ${fontFamily}, serif`;
            const targetWidth = context.measureText('Test').width;
            
            return fallbackWidth !== targetWidth;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check all CDN dependencies and load fallbacks if needed
     * @returns {Promise<Object>} Status report of all dependencies
     */
    async checkAndLoadFallbacks() {
        const results = {};
        
        for (const [name, strategy] of this.fallbackStrategies) {
            results[name] = await this.loadWithFallback(name, strategy);
        }
        
        return results;
    }

    /**
     * Load a resource with fallback strategy
     * @private
     * @param {string} name - Resource name
     * @param {Object} strategy - Fallback strategy
     * @returns {Promise<Object>} Load result
     */
    async loadWithFallback(name, strategy) {
        // First check if already loaded
        if (strategy.test()) {
            return { name, status: 'already-loaded', source: 'cache' };
        }

        // Try primary CDN
        try {
            await this.loadResource(strategy.primary, name);
            if (strategy.test()) {
                return { name, status: 'success', source: 'primary-cdn' };
            }
        } catch (error) {
            console.warn(`CDN Fallback: Primary CDN failed for ${name}:`, error.message);
        }

        // Try fallback CDN
        try {
            await this.loadResource(strategy.fallback, name);
            if (strategy.test()) {
                return { name, status: 'success', source: 'fallback-cdn' };
            }
        } catch (error) {
            console.warn(`CDN Fallback: Fallback CDN failed for ${name}:`, error.message);
        }

        // Try local resource only if we have verified local files exist
        if (strategy.hasLocalFallback) {
            try {
                await this.loadResource(strategy.local, name);
                if (strategy.test()) {
                    return { name, status: 'success', source: 'local' };
                }
            } catch (error) {
                console.warn(`CDN Fallback: Local resource failed for ${name}:`, error.message);
            }
        }

        return { name, status: 'failed', source: 'none', error: 'All sources failed' };
    }

    /**
     * Load a resource (CSS or JS)
     * @private
     * @param {string} url - Resource URL
     * @param {string} name - Resource name for identification
     * @returns {Promise<void>} Load promise
     */
    loadResource(url, name) {
        return new Promise((resolve, reject) => {
            const isCSS = url.includes('.css') || name === 'tailwind' || name === 'fonts';
            
            if (isCSS) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.onload = resolve;
                link.onerror = reject;
                document.head.appendChild(link);
            } else {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }

            // Timeout after 10 seconds
            setTimeout(() => reject(new Error('Load timeout')), 10000);
        });
    }

    /**
     * Create minimal CSS fallback for basic styling
     * @returns {string} Basic CSS fallback
     */
    createMinimalCSSFallback() {
        return `
            /* Minimal CSS fallback for weather app */
            .bg-white { background-color: white; }
            .bg-blue-600 { background-color: #2563eb; }
            .bg-green-600 { background-color: #16a34a; }
            .bg-red-600 { background-color: #dc2626; }
            .bg-yellow-600 { background-color: #ca8a04; }
            .text-white { color: white; }
            .text-center { text-align: center; }
            .p-1 { padding: 0.25rem; }
            .p-2 { padding: 0.5rem; }
            .p-4 { padding: 1rem; }
            .rounded { border-radius: 0.375rem; }
            .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .hidden { display: none; }
            .fixed { position: fixed; }
            .absolute { position: absolute; }
            .w-full { width: 100%; }
            .h-full { height: 100%; }
            .grid { display: grid; }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .justify-center { justify-content: center; }
            .space-y-2 > * + * { margin-top: 0.5rem; }
            .touch-button {
                min-height: 44px;
                padding: 8px 12px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                font-weight: 500;
            }
            .mobile-panel {
                position: fixed;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                border: 1px solid rgba(255,255,255,0.3);
            }
        `;
    }

    /**
     * Inject minimal CSS if Tailwind fails to load
     */
    injectMinimalCSS() {
        const style = document.createElement('style');
        style.textContent = this.createMinimalCSSFallback();
        document.head.appendChild(style);
        console.log('CDN Fallback: Injected minimal CSS fallback');
    }

    /**
     * Initialize CDN fallback system
     * @returns {Promise<Object>} Initialization result
     */
    async initialize() {
        console.log('CDN Fallback: Initializing fallback system...');
        
        const startTime = Date.now();
        const results = await this.checkAndLoadFallbacks();
        const loadTime = Date.now() - startTime;
        
        // Inject minimal CSS if Tailwind failed
        if (results.tailwind && results.tailwind.status === 'failed') {
            this.injectMinimalCSS();
        }
        
        console.log(`CDN Fallback: Initialization complete in ${loadTime}ms`, results);
        
        return {
            results,
            loadTime,
            hasFailures: Object.values(results).some(r => r.status === 'failed'),
            summary: this.generateSummary(results)
        };
    }

    /**
     * Generate human-readable summary
     * @private
     * @param {Object} results - Load results
     * @returns {string} Summary text
     */
    generateSummary(results) {
        const total = Object.keys(results).length;
        const successful = Object.values(results).filter(r => r.status === 'success' || r.status === 'already-loaded').length;
        const failed = total - successful;
        
        if (failed === 0) {
            return `All ${total} dependencies loaded successfully`;
        } else {
            return `${successful}/${total} dependencies loaded, ${failed} fallbacks applied`;
        }
    }
}

// Export for use in main application
export default CDNFallbackManager;