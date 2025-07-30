/**
 * Spot Manager Module
 * Handles custom spot creation, storage, and management
 * Following the modular pattern established in weather-app.js
 */

// Define custom spot types with French labels
export const CUSTOM_SPOT_TYPES = {
  // Urban exploration
  'warehouse': { icon: '🏭', color: '#6B7280', label: 'Entrepôt' },
  'urbex': { icon: '🏚️', color: '#92400E', label: 'Urbex' },
  'rooftop': { icon: '🏢', color: '#1E40AF', label: 'Toit' },
  'abandoned': { icon: '🏗️', color: '#7C2D12', label: 'Abandonné' },
  
  // Water spots
  'swimming': { icon: '🏊', color: '#0891B2', label: 'Baignade' },
  'cliff-jump': { icon: '🪂', color: '#0369A1', label: 'Saut' },
  'river': { icon: '💧', color: '#0E7490', label: 'Rivière' },
  'waterfall': { icon: '🌊', color: '#0284C7', label: 'Cascade' },
  
  // Nature spots
  'viewpoint': { icon: '👁️', color: '#7C3AED', label: 'Point de vue' },
  'camping': { icon: '⛺', color: '#059669', label: 'Camping' },
  'cave': { icon: '🕳️', color: '#451A03', label: 'Grotte' },
  'forest': { icon: '🌲', color: '#14532D', label: 'Forêt' },
  
  // Social spots
  'party': { icon: '🎉', color: '#E11D48', label: 'Fête' },
  'bbq': { icon: '🔥', color: '#EA580C', label: 'BBQ' },
  'picnic': { icon: '🧺', color: '#CA8A04', label: 'Pique-nique' },
  'hangout': { icon: '🤝', color: '#DB2777', label: 'Rencontre' },
  
  // Custom
  'custom': { icon: '📍', color: '#DC2626', label: 'Autre' }
};

export default class SpotManager {
  constructor() {
    this.spots = this.loadSpots();
    this.currentLocation = null;
    this.isAddingSpot = false;
    this.storageKey = 'customSpots_v1';
    this.maxSpots = 500; // Safety limit
  }
  
  /**
   * Load spots from localStorage with error handling
   * @returns {Array} Array of spots
   */
  loadSpots() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const spots = JSON.parse(stored);
      
      // Validate data structure
      if (!Array.isArray(spots)) {
        console.error('Invalid spots data structure');
        return [];
      }
      
      // Filter out any corrupted entries
      return spots.filter(spot => this.validateSpot(spot));
    } catch (error) {
      console.error('Failed to load spots:', error);
      // Backup corrupted data
      this.backupCorruptedData();
      return [];
    }
  }
  
  /**
   * Validate spot data structure
   * @param {Object} spot - Spot to validate
   * @returns {boolean} Is valid
   */
  validateSpot(spot) {
    return spot && 
           spot.id && 
           spot.name && 
           spot.type && 
           spot.coordinates && 
           typeof spot.coordinates.lat === 'number' &&
           typeof spot.coordinates.lon === 'number';
  }
  
  /**
   * Backup corrupted data before clearing
   */
  backupCorruptedData() {
    try {
      const corrupted = localStorage.getItem(this.storageKey);
      if (corrupted) {
        localStorage.setItem(this.storageKey + '_backup_' + Date.now(), corrupted);
      }
    } catch (e) {
      console.error('Failed to backup corrupted data:', e);
    }
  }
  
  /**
   * Save spots to localStorage with size check
   * @returns {boolean} Success status
   */
  saveSpots() {
    try {
      // Check number of spots
      if (this.spots.length > this.maxSpots) {
        console.warn(`Too many spots (${this.spots.length}), max is ${this.maxSpots}`);
        return false;
      }
      
      const data = JSON.stringify(this.spots);
      
      // Check size (localStorage typically has 5-10MB limit)
      const sizeInBytes = new Blob([data]).size;
      const sizeInMB = sizeInBytes / (1024 * 1024);
      
      if (sizeInMB > 4) { // Leave some headroom
        console.warn(`Spots data too large: ${sizeInMB.toFixed(2)}MB`);
        return false;
      }
      
      localStorage.setItem(this.storageKey, data);
      return true;
    } catch (error) {
      console.error('Failed to save spots:', error);
      if (error.name === 'QuotaExceededError') {
        this.handleStorageQuotaExceeded();
      }
      return false;
    }
  }
  
  /**
   * Handle storage quota exceeded
   */
  handleStorageQuotaExceeded() {
    console.warn('Storage quota exceeded, attempting cleanup...');
    // Could implement cleanup of old data, photos, etc.
  }
  
  /**
   * Add a new spot
   * @param {Object} spotData - Spot data
   * @returns {Object|null} Created spot or null on error
   */
  addSpot(spotData) {
    // Generate unique ID
    const id = 'spot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const spot = {
      id,
      name: spotData.name || 'Sans nom',
      type: spotData.type || 'custom',
      coordinates: {
        lat: spotData.coordinates.lat,
        lon: spotData.coordinates.lon
      },
      description: spotData.description || '',
      access: {
        difficulty: spotData.access?.difficulty || 'moderate',
        notes: spotData.access?.notes || '',
        weatherSensitive: Boolean(spotData.access?.weatherSensitive),
        bestTime: spotData.access?.bestTime || 'anytime'
      },
      metadata: {
        addedBy: spotData.metadata?.addedBy || 'Anonymous',
        addedDate: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        lastVisited: null,
        visitCount: 0,
        photos: spotData.metadata?.photos || [],
        tags: spotData.metadata?.tags || []
      },
      sharing: {
        isPrivate: spotData.sharing?.isPrivate !== false, // Default to private
        sharedWith: spotData.sharing?.sharedWith || []
      }
    };
    
    this.spots.push(spot);
    
    if (this.saveSpots()) {
      return spot;
    } else {
      // Rollback on save failure
      this.spots.pop();
      return null;
    }
  }
  
  /**
   * Update existing spot
   * @param {string} spotId - Spot ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated spot or null
   */
  updateSpot(spotId, updates) {
    const index = this.spots.findIndex(s => s.id === spotId);
    if (index === -1) return null;
    
    // Deep merge updates
    const currentSpot = this.spots[index];
    const updatedSpot = {
      ...currentSpot,
      ...updates,
      coordinates: updates.coordinates || currentSpot.coordinates,
      access: { ...currentSpot.access, ...updates.access },
      metadata: { 
        ...currentSpot.metadata, 
        ...updates.metadata,
        lastModified: new Date().toISOString()
      },
      sharing: { ...currentSpot.sharing, ...updates.sharing }
    };
    
    this.spots[index] = updatedSpot;
    
    if (this.saveSpots()) {
      return updatedSpot;
    } else {
      // Rollback on save failure
      this.spots[index] = currentSpot;
      return null;
    }
  }
  
  /**
   * Delete a spot
   * @param {string} spotId - Spot ID
   * @returns {Object|null} Deleted spot or null
   */
  deleteSpot(spotId) {
    const index = this.spots.findIndex(s => s.id === spotId);
    if (index === -1) return null;
    
    const deleted = this.spots.splice(index, 1)[0];
    
    if (this.saveSpots()) {
      return deleted;
    } else {
      // Rollback on save failure
      this.spots.splice(index, 0, deleted);
      return null;
    }
  }
  
  /**
   * Mark spot as visited
   * @param {string} spotId - Spot ID
   */
  markVisited(spotId) {
    const spot = this.spots.find(s => s.id === spotId);
    if (spot) {
      spot.metadata.lastVisited = new Date().toISOString();
      spot.metadata.visitCount = (spot.metadata.visitCount || 0) + 1;
      this.saveSpots();
    }
  }
  
  /**
   * Get all spots
   * @returns {Array} All spots
   */
  getAllSpots() {
    return [...this.spots]; // Return copy to prevent external modifications
  }
  
  /**
   * Get spots by type
   * @param {string} type - Spot type
   * @returns {Array} Filtered spots
   */
  getSpotsByType(type) {
    return this.spots.filter(s => s.type === type);
  }
  
  /**
   * Get weather-sensitive spots
   * @returns {Array} Weather-sensitive spots
   */
  getWeatherSensitiveSpots() {
    return this.spots.filter(s => s.access?.weatherSensitive);
  }
  
  /**
   * Get spots by tags
   * @param {Array} tags - Tags to filter by
   * @returns {Array} Filtered spots
   */
  getSpotsByTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return [];
    
    return this.spots.filter(spot => {
      const spotTags = spot.metadata?.tags || [];
      return tags.some(tag => spotTags.includes(tag));
    });
  }
  
  /**
   * Get spots within radius
   * @param {number} lat - Center latitude
   * @param {number} lon - Center longitude
   * @param {number} radiusKm - Radius in kilometers
   * @returns {Array} Spots within radius
   */
  getSpotsNearby(lat, lon, radiusKm = 10) {
    return this.spots.filter(spot => {
      const distance = this.calculateDistance(
        lat, lon, 
        spot.coordinates.lat, 
        spot.coordinates.lon
      );
      return distance <= radiusKm;
    });
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
   * Export spots as JSON
   * @param {Array} spotIds - Optional specific spots to export
   * @returns {string} JSON string
   */
  exportSpots(spotIds = null) {
    const spotsToExport = spotIds 
      ? this.spots.filter(s => spotIds.includes(s.id))
      : this.spots;
    
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      exportedBy: 'Weather Map Secret Spots',
      count: spotsToExport.length,
      spots: spotsToExport
    };
    
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Export as downloadable file
   * @param {string} filename - Filename without extension
   */
  exportAsFile(filename = 'mes-spots') {
    const data = this.exportSpots();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Import spots from JSON
   * @param {string} jsonString - JSON data
   * @param {boolean} merge - Merge with existing spots
   * @returns {Object} Import result
   */
  importSpots(jsonString, merge = true) {
    try {
      const data = JSON.parse(jsonString);
      
      // Validate import data
      if (!data.spots || !Array.isArray(data.spots)) {
        throw new Error('Invalid import format');
      }
      
      const importedSpots = data.spots.filter(spot => this.validateSpot(spot));
      let added = 0;
      let skipped = 0;
      
      if (!merge) {
        // Replace all spots
        this.spots = importedSpots;
        added = importedSpots.length;
      } else {
        // Merge with existing
        importedSpots.forEach(spot => {
          if (!this.spots.find(s => s.id === spot.id)) {
            this.spots.push(spot);
            added++;
          } else {
            skipped++;
          }
        });
      }
      
      const saved = this.saveSpots();
      
      return { 
        success: saved, 
        added, 
        skipped,
        total: importedSpots.length 
      };
    } catch (error) {
      console.error('Failed to import spots:', error);
      return { 
        success: false, 
        error: error.message,
        added: 0,
        skipped: 0,
        total: 0
      };
    }
  }
  
  /**
   * Import from file input
   * @param {File} file - File object from input
   * @returns {Promise} Import result
   */
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const result = this.importSpots(e.target.result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
  
  /**
   * Get statistics about spots
   * @returns {Object} Statistics
   */
  getStatistics() {
    const stats = {
      total: this.spots.length,
      byType: {},
      weatherSensitive: 0,
      visited: 0,
      addedLast7Days: 0,
      totalVisits: 0,
      popularTags: {}
    };
    
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    this.spots.forEach(spot => {
      // By type
      stats.byType[spot.type] = (stats.byType[spot.type] || 0) + 1;
      
      // Weather sensitive
      if (spot.access?.weatherSensitive) stats.weatherSensitive++;
      
      // Visited
      if (spot.metadata?.lastVisited) stats.visited++;
      
      // Recent
      if (new Date(spot.metadata.addedDate) > weekAgo) stats.addedLast7Days++;
      
      // Total visits
      stats.totalVisits += spot.metadata?.visitCount || 0;
      
      // Tags
      (spot.metadata?.tags || []).forEach(tag => {
        stats.popularTags[tag] = (stats.popularTags[tag] || 0) + 1;
      });
    });
    
    // Sort tags by popularity
    stats.popularTags = Object.entries(stats.popularTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [tag, count]) => {
        obj[tag] = count;
        return obj;
      }, {});
    
    return stats;
  }
}