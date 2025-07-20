#!/bin/bash

# Create a shareable package of the weather map app
echo "📦 Creating shareable weather map package..."

PACKAGE_NAME="weather-map-app-$(date +%Y%m%d)"
TEMP_DIR="/tmp/$PACKAGE_NAME"

# Create package directory
mkdir -p "$TEMP_DIR"

# Copy all necessary files
cp weather-map-modular.html "$TEMP_DIR/"
cp weather-app.js "$TEMP_DIR/"
cp weather-service.js "$TEMP_DIR/"
cp ui-state-manager.js "$TEMP_DIR/"
cp map-controller.js "$TEMP_DIR/"
cp sw.js "$TEMP_DIR/"
cp README.md "$TEMP_DIR/"
cp SETUP_GUIDE.md "$TEMP_DIR/"

# Create a simple startup script for the recipient
cat > "$TEMP_DIR/start.sh" << 'EOF'
#!/bin/bash
echo "🌦️ Starting Weather Map App..."
echo "🌐 Open: http://localhost:8001/weather-map-modular.html"
echo "🔄 Press Ctrl+C to stop"
python3 -m http.server 8001
EOF

chmod +x "$TEMP_DIR/start.sh"

# Create instructions for recipient
cat > "$TEMP_DIR/QUICK_START.txt" << 'EOF'
🌦️ WEATHER MAP APP - QUICK START

1. Open terminal/command prompt
2. Navigate to this folder
3. Run: ./start.sh
4. Open: http://localhost:8001/weather-map-modular.html

Requirements:
- Python 3 installed
- Modern web browser

Features:
- 7-day weather forecast for Southern France
- 15+ outdoor activity locations
- Mobile-optimized interface
- Offline mode support

Enjoy your trip planning! 🏖️🏔️
EOF

# Create ZIP package
cd /tmp
zip -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME/"

# Move to current directory
mv "$PACKAGE_NAME.zip" ~/projects/weather-map-app/

echo "✅ Package created: $PACKAGE_NAME.zip"
echo "📁 Location: ~/projects/weather-map-app/$PACKAGE_NAME.zip"
echo ""
echo "📤 Share this ZIP file with your friend!"
echo "📋 They just need to:"
echo "   1. Extract the ZIP"
echo "   2. Run ./start.sh"
echo "   3. Open the URL shown"

# Cleanup
rm -rf "$TEMP_DIR"