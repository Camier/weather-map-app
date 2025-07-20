/**
 * Weather Conditions Module - Enhanced Weather Icons and Descriptions
 * Handles weather code interpretation and visual representation
 * 
 * Based on Open-Meteo weather codes with French descriptions
 * Optimized for outdoor activity planning in Southern France
 */

class WeatherConditions {
    constructor() {
        // WMO Weather codes to conditions mapping
        this.weatherCodes = {
            0: { condition: 'clear', description: 'Ciel dégagé', icon: '☀️', color: '#fbbf24' },
            1: { condition: 'mainly_clear', description: 'Principalement dégagé', icon: '🌤️', color: '#fbbf24' },
            2: { condition: 'partly_cloudy', description: 'Partiellement nuageux', icon: '⛅', color: '#94a3b8' },
            3: { condition: 'overcast', description: 'Couvert', icon: '☁️', color: '#64748b' },
            
            45: { condition: 'fog', description: 'Brouillard', icon: '🌫️', color: '#9ca3af' },
            48: { condition: 'rime_fog', description: 'Brouillard givrant', icon: '🌫️', color: '#9ca3af' },
            
            51: { condition: 'light_drizzle', description: 'Bruine légère', icon: '🌦️', color: '#60a5fa' },
            53: { condition: 'moderate_drizzle', description: 'Bruine modérée', icon: '🌦️', color: '#3b82f6' },
            55: { condition: 'dense_drizzle', description: 'Bruine dense', icon: '🌧️', color: '#2563eb' },
            
            56: { condition: 'light_freezing_drizzle', description: 'Bruine verglaçante légère', icon: '🌨️', color: '#0ea5e9' },
            57: { condition: 'dense_freezing_drizzle', description: 'Bruine verglaçante dense', icon: '🌨️', color: '#0284c7' },
            
            61: { condition: 'slight_rain', description: 'Pluie légère', icon: '🌦️', color: '#60a5fa' },
            63: { condition: 'moderate_rain', description: 'Pluie modérée', icon: '🌧️', color: '#3b82f6' },
            65: { condition: 'heavy_rain', description: 'Pluie forte', icon: '🌧️', color: '#1d4ed8' },
            
            66: { condition: 'light_freezing_rain', description: 'Pluie verglaçante légère', icon: '🌨️', color: '#0ea5e9' },
            67: { condition: 'heavy_freezing_rain', description: 'Pluie verglaçante forte', icon: '🌨️', color: '#0284c7' },
            
            71: { condition: 'slight_snowfall', description: 'Chute de neige légère', icon: '❄️', color: '#e0e7ff' },
            73: { condition: 'moderate_snowfall', description: 'Chute de neige modérée', icon: '🌨️', color: '#c7d2fe' },
            75: { condition: 'heavy_snowfall', description: 'Chute de neige forte', icon: '❄️', color: '#a5b4fc' },
            
            77: { condition: 'snow_grains', description: 'Grains de neige', icon: '🌨️', color: '#c7d2fe' },
            
            80: { condition: 'slight_rain_showers', description: 'Averses légères', icon: '🌦️', color: '#60a5fa' },
            81: { condition: 'moderate_rain_showers', description: 'Averses modérées', icon: '🌧️', color: '#3b82f6' },
            82: { condition: 'violent_rain_showers', description: 'Averses violentes', icon: '⛈️', color: '#1d4ed8' },
            
            85: { condition: 'slight_snow_showers', description: 'Averses de neige légères', icon: '🌨️', color: '#c7d2fe' },
            86: { condition: 'heavy_snow_showers', description: 'Averses de neige fortes', icon: '❄️', color: '#a5b4fc' },
            
            95: { condition: 'thunderstorm', description: 'Orage', icon: '⛈️', color: '#7c3aed' },
            96: { condition: 'thunderstorm_slight_hail', description: 'Orage avec grêle légère', icon: '⛈️', color: '#6d28d9' },
            97: { condition: 'thunderstorm_heavy_hail', description: 'Orage avec grêle forte', icon: '⛈️', color: '#5b21b6' }
        };

        // Activity suitability based on weather conditions
        this.activitySuitability = {
            // Perfect conditions
            clear: { hiking: 5, beach: 5, cycling: 5, sightseeing: 5, thermes: 4 },
            mainly_clear: { hiking: 5, beach: 4, cycling: 5, sightseeing: 5, thermes: 4 },
            
            // Good conditions with some clouds
            partly_cloudy: { hiking: 4, beach: 3, cycling: 4, sightseeing: 4, thermes: 5 },
            overcast: { hiking: 3, beach: 2, cycling: 3, sightseeing: 3, thermes: 5 },
            
            // Poor conditions
            fog: { hiking: 1, beach: 1, cycling: 2, sightseeing: 1, thermes: 4 },
            light_drizzle: { hiking: 2, beach: 1, cycling: 2, sightseeing: 2, thermes: 5 },
            moderate_drizzle: { hiking: 1, beach: 1, cycling: 1, sightseeing: 2, thermes: 5 },
            dense_drizzle: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 5 },
            
            // Rain conditions
            slight_rain: { hiking: 1, beach: 1, cycling: 1, sightseeing: 2, thermes: 5 },
            moderate_rain: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 5 },
            heavy_rain: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 4 },
            
            // Severe conditions
            thunderstorm: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 3 },
            thunderstorm_slight_hail: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 2 },
            thunderstorm_heavy_hail: { hiking: 1, beach: 1, cycling: 1, sightseeing: 1, thermes: 1 }
        };
    }

    /**
     * Get weather condition from WMO code
     * @param {number} weatherCode - WMO weather code
     * @returns {Object} Weather condition object
     */
    getCondition(weatherCode) {
        return this.weatherCodes[weatherCode] || {
            condition: 'unknown',
            description: 'Conditions inconnues',
            icon: '❓',
            color: '#6b7280'
        };
    }

    /**
     * Get enhanced weather icon based on conditions
     * @param {number} weatherCode - WMO weather code
     * @param {number} temperature - Temperature in Celsius
     * @param {number} windSpeed - Wind speed in km/h
     * @param {boolean} isDay - Whether it's daytime
     * @returns {string} Weather emoji icon
     */
    getEnhancedIcon(weatherCode, temperature = 20, windSpeed = 0, isDay = true) {
        const baseCondition = this.getCondition(weatherCode);
        
        // Enhanced logic for better visual representation
        if (weatherCode === 0) { // Clear sky
            if (temperature > 30) return '🌞'; // Very hot
            if (temperature > 25) return '☀️'; // Hot
            if (temperature < 5) return isDay ? '🌤️' : '🌙'; // Cold
            return isDay ? '☀️' : '🌙';
        }
        
        if (weatherCode === 1) { // Mainly clear
            if (temperature > 28) return '🌤️';
            return isDay ? '🌤️' : '🌙';
        }
        
        if ([2, 3].includes(weatherCode)) { // Cloudy
            if (windSpeed > 25) return '💨'; // Windy
            return baseCondition.icon;
        }
        
        if ([61, 63, 65].includes(weatherCode)) { // Rain
            if (windSpeed > 20) return '🌪️'; // Stormy rain
            if (temperature < 5) return '🌨️'; // Cold rain (potential sleet)
            return baseCondition.icon;
        }
        
        if ([95, 96, 97].includes(weatherCode)) { // Thunderstorms
            if (windSpeed > 30) return '🌪️'; // Severe storms
            return baseCondition.icon;
        }
        
        return baseCondition.icon;
    }

    /**
     * Get activity suitability score
     * @param {string} condition - Weather condition
     * @param {string} activity - Activity type
     * @returns {number} Suitability score (1-5)
     */
    getActivitySuitability(condition, activity) {
        const suitability = this.activitySuitability[condition];
        if (!suitability) return 3; // Default moderate suitability
        
        return suitability[activity] || 3;
    }

    /**
     * Get comprehensive weather assessment
     * @param {Object} weatherData - Weather data object
     * @returns {Object} Enhanced weather assessment
     */
    getWeatherAssessment(weatherData) {
        const {
            weather_code = 0,
            temp_max = 20,
            temp_min = 15,
            precipitation = 0,
            wind_speed = 0,
            wind_gusts = 0,
            uv_index = 5,
            lever_soleil,
            coucher_soleil
        } = weatherData;

        const condition = this.getCondition(weather_code);
        const isDay = this.isDaytime(lever_soleil, coucher_soleil);
        const enhancedIcon = this.getEnhancedIcon(weather_code, temp_max, wind_speed, isDay);

        // Calculate comfort index (0-100)
        let comfortIndex = 100;
        
        // Temperature comfort (optimal 18-25°C)
        if (temp_max > 35 || temp_max < 0) comfortIndex -= 40;
        else if (temp_max > 30 || temp_max < 5) comfortIndex -= 20;
        else if (temp_max > 28 || temp_max < 10) comfortIndex -= 10;
        
        // Precipitation impact
        if (precipitation > 20) comfortIndex -= 30;
        else if (precipitation > 10) comfortIndex -= 20;
        else if (precipitation > 5) comfortIndex -= 10;
        else if (precipitation > 0.1) comfortIndex -= 5;
        
        // Wind impact
        if (wind_speed > 40) comfortIndex -= 25;
        else if (wind_speed > 25) comfortIndex -= 15;
        else if (wind_speed > 15) comfortIndex -= 5;
        
        // UV impact (high UV reduces comfort for outdoor activities)
        if (uv_index > 8) comfortIndex -= 10;
        else if (uv_index > 6) comfortIndex -= 5;

        comfortIndex = Math.max(0, Math.min(100, comfortIndex));

        // Activity recommendations
        const activities = {
            hiking: this.getActivitySuitability(condition.condition, 'hiking'),
            beach: this.getActivitySuitability(condition.condition, 'beach'),
            cycling: this.getActivitySuitability(condition.condition, 'cycling'),
            sightseeing: this.getActivitySuitability(condition.condition, 'sightseeing'),
            thermes: this.getActivitySuitability(condition.condition, 'thermes')
        };

        // Weather alerts
        const alerts = this.generateWeatherAlerts(weatherData);

        return {
            condition: condition.condition,
            description: condition.description,
            icon: enhancedIcon,
            baseIcon: condition.icon,
            color: condition.color,
            comfortIndex,
            activities,
            alerts,
            isDay,
            summary: this.generateWeatherSummary(comfortIndex, condition, precipitation, temp_max, wind_speed)
        };
    }

    /**
     * Check if it's currently daytime
     * @param {string} sunrise - Sunrise time ISO string
     * @param {string} sunset - Sunset time ISO string
     * @returns {boolean} True if daytime
     */
    isDaytime(sunrise, sunset) {
        if (!sunrise || !sunset) return true; // Default to day

        const now = new Date();
        const sunriseTime = new Date(sunrise);
        const sunsetTime = new Date(sunset);

        return now >= sunriseTime && now <= sunsetTime;
    }

    /**
     * Generate weather alerts for safety
     * @param {Object} weatherData - Weather data
     * @returns {Array} Array of alert objects
     */
    generateWeatherAlerts(weatherData) {
        const alerts = [];
        const {
            weather_code = 0,
            temp_max = 20,
            precipitation = 0,
            wind_speed = 0,
            wind_gusts = 0,
            uv_index = 5
        } = weatherData;

        // Heat warnings
        if (temp_max > 35) {
            alerts.push({
                level: 'danger',
                icon: '🥵',
                message: 'Chaleur extrême - Hydratez-vous régulièrement',
                category: 'temperature'
            });
        } else if (temp_max > 30) {
            alerts.push({
                level: 'warning',
                icon: '☀️',
                message: 'Forte chaleur - Protection solaire recommandée',
                category: 'temperature'
            });
        }

        // Cold warnings
        if (temp_max < 5) {
            alerts.push({
                level: 'warning',
                icon: '🥶',
                message: 'Températures froides - Vêtements chauds nécessaires',
                category: 'temperature'
            });
        }

        // Precipitation warnings
        if (precipitation > 20) {
            alerts.push({
                level: 'danger',
                icon: '🌧️',
                message: 'Pluies importantes - Activités extérieures déconseillées',
                category: 'precipitation'
            });
        } else if (precipitation > 10) {
            alerts.push({
                level: 'warning',
                icon: '🌦️',
                message: 'Pluie modérée - Équipement imperméable recommandé',
                category: 'precipitation'
            });
        }

        // Wind warnings
        if (wind_speed > 40 || wind_gusts > 60) {
            alerts.push({
                level: 'danger',
                icon: '💨',
                message: 'Vents forts - Prudence près des arbres et structures',
                category: 'wind'
            });
        } else if (wind_speed > 25 || wind_gusts > 40) {
            alerts.push({
                level: 'warning',
                icon: '🌬️',
                message: 'Vent modéré - Activités en hauteur déconseillées',
                category: 'wind'
            });
        }

        // UV warnings
        if (uv_index > 8) {
            alerts.push({
                level: 'warning',
                icon: '☀️',
                message: 'UV très élevé - Protection solaire indispensable',
                category: 'uv'
            });
        }

        // Severe weather warnings
        if ([95, 96, 97].includes(weather_code)) {
            alerts.push({
                level: 'danger',
                icon: '⛈️',
                message: 'Orage - Évitez les espaces ouverts et les hauteurs',
                category: 'severe'
            });
        }

        return alerts;
    }

    /**
     * Generate a human-readable weather summary
     * @param {number} comfortIndex - Comfort index (0-100)
     * @param {Object} condition - Weather condition object
     * @param {number} precipitation - Precipitation amount
     * @param {number} temperature - Temperature
     * @param {number} windSpeed - Wind speed
     * @returns {string} Weather summary
     */
    generateWeatherSummary(comfortIndex, condition, precipitation, temperature, windSpeed) {
        if (comfortIndex >= 80) {
            return 'Excellentes conditions pour les activités extérieures';
        } else if (comfortIndex >= 60) {
            return 'Bonnes conditions, quelques précautions à prendre';
        } else if (comfortIndex >= 40) {
            return 'Conditions correctes, équipement adapté nécessaire';
        } else if (comfortIndex >= 20) {
            return 'Conditions difficiles, activités limitées';
        } else {
            return 'Conditions défavorables, activités intérieures recommandées';
        }
    }

    /**
     * Get seasonal recommendations for Southern France
     * @param {Date} date - Date to check
     * @param {Object} weatherData - Weather data
     * @returns {Array} Array of seasonal recommendations
     */
    getSeasonalRecommendations(date = new Date(), weatherData = {}) {
        const month = date.getMonth() + 1; // 1-12
        const { temp_max = 20, precipitation = 0 } = weatherData;
        
        const recommendations = [];

        // Spring (March-May)
        if (month >= 3 && month <= 5) {
            if (temp_max > 20 && precipitation < 5) {
                recommendations.push('Idéal pour la randonnée et les cascades');
                recommendations.push('Parfait pour visiter les gorges');
            }
            recommendations.push('Saison des fleurs sauvages en montagne');
        }

        // Summer (June-August)
        if (month >= 6 && month <= 8) {
            if (temp_max > 25) {
                recommendations.push('Parfait pour les plages et baignades');
                recommendations.push('Idéal pour les piscines naturelles');
            }
            if (temp_max > 30) {
                recommendations.push('Privilégiez les activités matinales');
                recommendations.push('Thermes recommandés en soirée');
            }
        }

        // Autumn (September-November)
        if (month >= 9 && month <= 11) {
            if (temp_max > 15 && precipitation < 10) {
                recommendations.push('Excellent pour la randonnée');
                recommendations.push('Parfait pour les points de vue');
            }
            recommendations.push('Saison idéale pour les thermes');
        }

        // Winter (December-February)
        if (month >= 12 || month <= 2) {
            recommendations.push('Saison parfaite pour les thermes');
            if (temp_max > 10 && precipitation < 5) {
                recommendations.push('Randonnées hivernales possibles');
            }
        }

        return recommendations;
    }
}

// Export for use in main application
export default WeatherConditions;