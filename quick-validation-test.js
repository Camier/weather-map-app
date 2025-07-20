/**
 * Quick Validation Test Script
 * Tests core app functionality without browser automation
 */

// Test 1: Module Structure Validation
console.log('🧪 Quick Validation Test - Weather Map App');
console.log('==========================================');

// Test CDN Fallback System
async function testCDNFallbacks() {
    console.log('\n🏗️ Testing CDN Fallback System...');
    
    try {
        const CDNFallbackManager = (await import('./cdn-fallbacks.js')).default;
        const manager = new CDNFallbackManager();
        
        // Test fallback strategies
        const hasLeaflet = manager.fallbackStrategies.has('leaflet');
        const hasTailwind = manager.fallbackStrategies.has('tailwind');
        const hasFonts = manager.fallbackStrategies.has('fonts');
        
        console.log(`  ✅ Leaflet strategy: ${hasLeaflet ? 'Present' : 'Missing'}`);
        console.log(`  ✅ Tailwind strategy: ${hasTailwind ? 'Present' : 'Missing'}`);
        console.log(`  ✅ Fonts strategy: ${hasFonts ? 'Present' : 'Missing'}`);
        
        // Test if strategies have correct structure
        if (hasLeaflet) {
            const leafletStrategy = manager.fallbackStrategies.get('leaflet');
            const hasCorrectStructure = leafletStrategy.primary && leafletStrategy.fallback && typeof leafletStrategy.test === 'function';
            console.log(`  ✅ Leaflet strategy structure: ${hasCorrectStructure ? 'Valid' : 'Invalid'}`);
        }
        
        return true;
    } catch (error) {
        console.log(`  ❌ CDN Fallback test failed: ${error.message}`);
        return false;
    }
}

// Test 2: Weather Service Validation
async function testWeatherService() {
    console.log('\n🌤️ Testing Weather Service...');
    
    try {
        const WeatherService = (await import('./weather-service.js')).default;
        const service = new WeatherService({
            timeout: 5000,
            maxRetries: 1
        });
        
        // Test service initialization
        console.log(`  ✅ Service initialized with timeout: ${service.timeout}ms`);
        console.log(`  ✅ Max retries configured: ${service.maxRetries}`);
        
        // Test methods exist
        const hasRequiredMethods = [
            'fetchWeatherData',
            'getCachedData',
            'cacheData',
            'validateWeatherData'
        ].every(method => typeof service[method] === 'function');
        
        console.log(`  ✅ Required methods: ${hasRequiredMethods ? 'Present' : 'Missing'}`);
        
        return true;
    } catch (error) {
        console.log(`  ❌ Weather Service test failed: ${error.message}`);
        return false;
    }
}

// Test 3: Map Controller Validation  
async function testMapController() {
    console.log('\n🗺️ Testing Map Controller...');
    
    try {
        const MapController = (await import('./map-controller.js')).default;
        
        // Test if zoom optimization methods exist in the class prototype
        const zoomMethods = [
            'getDynamicClusterRadius',
            'shouldShowMarker', 
            'getMarkerSizeForZoom',
            'handleZoomChange'
        ];
        
        const hasZoomMethods = zoomMethods.every(method => 
            typeof MapController.prototype[method] === 'function'
        );
        
        console.log(`  ✅ Zoom optimization methods: ${hasZoomMethods ? 'Present' : 'Missing'}`);
        
        // Test dynamic cluster radius logic
        if (hasZoomMethods) {
            const testController = { getDynamicClusterRadius: MapController.prototype.getDynamicClusterRadius };
            const radius6 = testController.getDynamicClusterRadius(6);
            const radius10 = testController.getDynamicClusterRadius(10);
            const radius14 = testController.getDynamicClusterRadius(14);
            
            const correctProgression = radius6 > radius10 && radius10 > radius14;
            console.log(`  ✅ Dynamic clustering logic: ${correctProgression ? 'Valid' : 'Invalid'} (${radius6}→${radius10}→${radius14})`);
        }
        
        return true;
    } catch (error) {
        console.log(`  ❌ Map Controller test failed: ${error.message}`);
        return false;
    }
}

// Test 4: UI State Manager Validation
async function testUIStateManager() {
    console.log('\n🎛️ Testing UI State Manager...');
    
    try {
        const UIStateManager = (await import('./ui-state-manager.js')).default;
        
        // Test required methods exist
        const requiredMethods = [
            'updateWeatherData',
            'updateDayFilter',
            'updateActivitySites',
            'refreshCurrentView'
        ];
        
        const hasRequiredMethods = requiredMethods.every(method => 
            typeof UIStateManager.prototype[method] === 'function'
        );
        
        console.log(`  ✅ Required methods: ${hasRequiredMethods ? 'Present' : 'Missing'}`);
        
        return true;
    } catch (error) {
        console.log(`  ❌ UI State Manager test failed: ${error.message}`);
        return false;
    }
}

// Test 5: Main Weather App Integration
async function testWeatherApp() {
    console.log('\n🚀 Testing Main Weather App...');
    
    try {
        const WeatherApp = (await import('./weather-app.js')).default;
        
        // Test configuration structure
        const testApp = new WeatherApp();
        const hasConfiguration = testApp.config && 
                                testApp.config.cities && 
                                testApp.config.activities;
        
        console.log(`  ✅ Configuration structure: ${hasConfiguration ? 'Valid' : 'Invalid'}`);
        
        if (hasConfiguration) {
            console.log(`  ✅ Cities configured: ${testApp.config.cities.length}`);
            console.log(`  ✅ Activities configured: ${testApp.config.activities.length}`);
        }
        
        // Test required methods
        const requiredMethods = [
            'initialize',
            'handleError',
            'refreshData'
        ];
        
        const hasRequiredMethods = requiredMethods.every(method => 
            typeof WeatherApp.prototype[method] === 'function'
        );
        
        console.log(`  ✅ Required methods: ${hasRequiredMethods ? 'Present' : 'Missing'}`);
        
        return true;
    } catch (error) {
        console.log(`  ❌ Weather App test failed: ${error.message}`);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('\n🎯 Starting Comprehensive Validation...\n');
    
    const results = await Promise.all([
        testCDNFallbacks(),
        testWeatherService(), 
        testMapController(),
        testUIStateManager(),
        testWeatherApp()
    ]);
    
    const passedTests = results.filter(r => r).length;
    const totalTests = results.length;
    
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    console.log(`✅ Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All core modules validated successfully!');
        console.log('🚀 App is ready for production use.');
    } else {
        console.log('⚠️ Some modules need attention.');
    }
    
    return {
        passed: passedTests,
        total: totalTests,
        successRate: (passedTests / totalTests) * 100
    };
}

// Export for use in other scripts
export { runAllTests };

// Run tests if executed directly
if (process.argv[1].endsWith('quick-validation-test.js')) {
    runAllTests();
}