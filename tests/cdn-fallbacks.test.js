/**
 * Unit tests for CDNFallbackManager
 * Tests CDN reliability, fallback strategies, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM APIs
global.document = {
  createElement: vi.fn(() => ({
    rel: '',
    href: '',
    src: '',
    onload: null,
    onerror: null,
    className: '',
    style: {},
    addEventListener: vi.fn()
  })),
  head: {
    appendChild: vi.fn()
  },
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  },
  querySelector: vi.fn()
};

global.window = {
  getComputedStyle: vi.fn(() => ({
    backgroundColor: 'rgb(59, 130, 246)',
    color: 'rgb(255, 255, 255)',
    padding: '16px'
  }))
};

// Mock canvas for font testing
global.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  font: '',
  measureText: vi.fn(() => ({ width: 100 }))
}));

const CDNFallbackManager = (await import('../cdn-fallbacks.js')).default;

describe('CDNFallbackManager', () => {
  let cdnManager;

  beforeEach(() => {
    cdnManager = new CDNFallbackManager();
  });

  describe('Initialization', () => {
    it('should initialize with fallback strategies', () => {
      expect(cdnManager.fallbackStrategies.size).toBeGreaterThan(0);
      expect(cdnManager.fallbackStrategies.has('leaflet')).toBe(true);
      expect(cdnManager.fallbackStrategies.has('tailwind')).toBe(true);
      expect(cdnManager.fallbackStrategies.has('fonts')).toBe(true);
    });

    it('should initialize CDN status map', () => {
      expect(cdnManager.cdnStatus).toBeInstanceOf(Map);
    });
  });

  describe('Fallback Strategies', () => {
    it('should have correct Leaflet strategy structure', () => {
      const leafletStrategy = cdnManager.fallbackStrategies.get('leaflet');
      
      expect(leafletStrategy).toEqual(expect.objectContaining({
        primary: expect.stringContaining('unpkg.com/leaflet'),
        fallback: expect.stringContaining('jsdelivr.net'),
        local: expect.stringContaining('./vendors/leaflet'),
        hasLocalFallback: false,
        test: expect.any(Function)
      }));
    });

    it('should have correct Tailwind strategy structure', () => {
      const tailwindStrategy = cdnManager.fallbackStrategies.get('tailwind');
      
      expect(tailwindStrategy).toEqual(expect.objectContaining({
        primary: expect.stringContaining('tailwindcss.com'),
        fallback: expect.stringContaining('unpkg.com'),
        hasLocalFallback: false,
        test: expect.any(Function)
      }));
    });

    it('should mark hasLocalFallback as false to prevent 404 errors', () => {
      const strategies = Array.from(cdnManager.fallbackStrategies.values());
      
      strategies.forEach(strategy => {
        expect(strategy.hasLocalFallback).toBe(false);
      });
    });
  });

  describe('Resource Loading', () => {
    it('should load CSS resources correctly', async () => {
      const mockLink = {
        rel: '',
        href: '',
        onload: null,
        onerror: null
      };
      
      document.createElement.mockReturnValue(mockLink);
      
      const loadPromise = cdnManager.loadResource('https://example.com/style.css', 'test');
      
      // Simulate successful load
      setTimeout(() => mockLink.onload(), 10);
      
      await expect(loadPromise).resolves.toBeUndefined();
      expect(mockLink.rel).toBe('stylesheet');
      expect(mockLink.href).toBe('https://example.com/style.css');
    });

    it('should load JS resources correctly', async () => {
      const mockScript = {
        src: '',
        onload: null,
        onerror: null
      };
      
      document.createElement.mockReturnValue(mockScript);
      
      const loadPromise = cdnManager.loadResource('https://example.com/script.js', 'test');
      
      // Simulate successful load
      setTimeout(() => mockScript.onload(), 10);
      
      await expect(loadPromise).resolves.toBeUndefined();
      expect(mockScript.src).toBe('https://example.com/script.js');
    });

    it('should handle resource load errors', async () => {
      const mockScript = {
        src: '',
        onload: null,
        onerror: null
      };
      
      document.createElement.mockReturnValue(mockScript);
      
      const loadPromise = cdnManager.loadResource('https://example.com/script.js', 'test');
      
      // Simulate load error
      setTimeout(() => mockScript.onerror(new Error('Load failed')), 10);
      
      await expect(loadPromise).rejects.toThrow();
    });

    it('should timeout after 10 seconds', async () => {
      const mockScript = {
        src: '',
        onload: null,
        onerror: null
      };
      
      document.createElement.mockReturnValue(mockScript);
      
      vi.useFakeTimers();
      
      const loadPromise = cdnManager.loadResource('https://example.com/script.js', 'test');
      
      // Advance time by 10 seconds
      vi.advanceTimersByTime(10000);
      
      await expect(loadPromise).rejects.toThrow('Load timeout');
      
      vi.useRealTimers();
    });
  });

  describe('Dependency Testing', () => {
    it('should test Tailwind CSS correctly', () => {
      const testElement = {
        className: '',
        style: {},
        remove: vi.fn()
      };
      
      document.createElement.mockReturnValue(testElement);
      document.body.appendChild.mockImplementation(() => {});
      document.body.removeChild.mockImplementation(() => {});
      
      window.getComputedStyle.mockReturnValue({
        backgroundColor: 'rgb(59, 130, 246)',
        color: 'rgb(255, 255, 255)',
        padding: '16px'
      });
      
      const result = cdnManager.testTailwindCSS();
      expect(result).toBe(true);
    });

    it('should test font loading correctly', () => {
      const mockContext = {
        font: '',
        measureText: vi.fn()
          .mockReturnValueOnce({ width: 100 }) // serif fallback
          .mockReturnValueOnce({ width: 120 }) // target font
      };
      
      document.createElement.mockReturnValue({
        getContext: vi.fn(() => mockContext)
      });
      
      const result = cdnManager.testFontLoad('Inter');
      expect(result).toBe(true);
    });
  });

  describe('Fallback Logic', () => {
    it('should return already-loaded status when dependency exists', async () => {
      const mockStrategy = {
        test: vi.fn(() => true), // Already loaded
        primary: 'https://example.com/lib.js',
        fallback: 'https://fallback.com/lib.js',
        hasLocalFallback: false
      };
      
      const result = await cdnManager.loadWithFallback('test', mockStrategy);
      
      expect(result).toEqual({
        name: 'test',
        status: 'already-loaded',
        source: 'cache'
      });
    });

    it('should skip local fallback when hasLocalFallback is false', async () => {
      const mockStrategy = {
        test: vi.fn(() => false), // Not loaded
        primary: 'https://example.com/lib.js',
        fallback: 'https://fallback.com/lib.js',
        hasLocalFallback: false
      };
      
      // Mock loadResource to always fail
      vi.spyOn(cdnManager, 'loadResource').mockRejectedValue(new Error('Load failed'));
      
      const result = await cdnManager.loadWithFallback('test', mockStrategy);
      
      expect(result.status).toBe('failed');
      expect(cdnManager.loadResource).toHaveBeenCalledTimes(2); // Primary + fallback only
      expect(cdnManager.loadResource).not.toHaveBeenCalledWith(
        expect.stringContaining('./vendors'),
        expect.anything()
      );
    });
  });

  describe('Minimal CSS Fallback', () => {
    it('should generate minimal CSS fallback', () => {
      const css = cdnManager.createMinimalCSSFallback();
      
      expect(css).toContain('.bg-white');
      expect(css).toContain('.text-center');
      expect(css).toContain('.touch-button');
      expect(css).toContain('.mobile-panel');
    });

    it('should inject minimal CSS fallback', () => {
      const mockStyle = {
        textContent: ''
      };
      
      document.createElement.mockReturnValue(mockStyle);
      
      cdnManager.injectMinimalCSS();
      
      expect(document.createElement).toHaveBeenCalledWith('style');
      expect(document.head.appendChild).toHaveBeenCalledWith(mockStyle);
      expect(mockStyle.textContent).toContain('.bg-white');
    });
  });

  describe('Initialization Process', () => {
    it('should complete initialization successfully', async () => {
      vi.spyOn(cdnManager, 'checkAndLoadFallbacks').mockResolvedValue({
        leaflet: { status: 'success', source: 'primary-cdn' },
        tailwind: { status: 'success', source: 'primary-cdn' },
        fonts: { status: 'success', source: 'primary-cdn' }
      });
      
      const result = await cdnManager.initialize();
      
      expect(result).toEqual(expect.objectContaining({
        results: expect.any(Object),
        loadTime: expect.any(Number),
        hasFailures: false,
        summary: expect.stringContaining('dependencies loaded successfully')
      }));
    });

    it('should inject minimal CSS when Tailwind fails', async () => {
      vi.spyOn(cdnManager, 'checkAndLoadFallbacks').mockResolvedValue({
        tailwind: { status: 'failed' }
      });
      
      vi.spyOn(cdnManager, 'injectMinimalCSS');
      
      await cdnManager.initialize();
      
      expect(cdnManager.injectMinimalCSS).toHaveBeenCalled();
    });
  });

  describe('Summary Generation', () => {
    it('should generate correct summary for all successful loads', () => {
      const results = {
        leaflet: { status: 'success' },
        tailwind: { status: 'already-loaded' },
        fonts: { status: 'success' }
      };
      
      const summary = cdnManager.generateSummary(results);
      expect(summary).toBe('All 3 dependencies loaded successfully');
    });

    it('should generate correct summary with failures', () => {
      const results = {
        leaflet: { status: 'success' },
        tailwind: { status: 'failed' },
        fonts: { status: 'success' }
      };
      
      const summary = cdnManager.generateSummary(results);
      expect(summary).toBe('2/3 dependencies loaded, 1 fallbacks applied');
    });
  });
});