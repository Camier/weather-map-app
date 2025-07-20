#!/bin/bash

# Weather Map App Server Startup Script
# Finds available port and starts HTTP server

cd "$(dirname "$0")"

echo "🌦️ Starting Weather Map App Server..."
echo "📁 Directory: $(pwd)"

# Try different ports
PORTS=(8001 8002 8003 8004 8005 3000 3001 5000 5001)

for PORT in "${PORTS[@]}"; do
    if ! netstat -tuln | grep -q ":$PORT "; then
        echo "🚀 Starting server on port $PORT..."
        echo ""
        echo "🌐 Open in browser: http://localhost:$PORT/weather-map-modular.html"
        echo ""
        echo "📱 Mobile users: Use the same URL on your mobile browser"
        echo "🔄 Press Ctrl+C to stop the server"
        echo ""
        echo "Starting Python HTTP server..."
        python3 -m http.server $PORT
        exit 0
    fi
done

echo "❌ Error: No available ports found. Ports in use:"
netstat -tuln | grep -E ":(3000|5000|8001|8002|8003|8004|8005) "
echo ""
echo "💡 Try manually: python3 -m http.server 9000"
exit 1