#!/bin/bash

# --- Verifex One-Click VPS Deployment Script (Ubuntu 22.04) ---

set -e

echo "🚀 Starting Verifex Deployment..."

# 0. Create Swap file for low-resource VPS (4GB RAM)
if [ ! -f "/swapfile" ]; then
    echo "💾 Creating 2GB Swap file for memory stability..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap file created."
else
    echo "✅ Swap file already exists."
fi

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker if not present
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed."
else
    echo "✅ Docker is already installed."
fi

# 3. Install Docker Compose if not present
if ! [ -x "$(command -v docker-compose)" ]; then
    echo "🏗️ Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed."
else
    echo "✅ Docker Compose is already installed."
fi

# 4. Create local environment file from .env.local if available
if [ -f ".env.local" ] && [ ! -f ".env" ]; then
    echo "🔐 Converting .env.local to .env for Docker..."
    cp .env.local .env
fi

# 5. Build and Start the container
echo "🏗️ Building and starting Verifex AI Engine (this may take 5-10 mins for TensorFlow)..."
sudo docker-compose up --build -d

echo "🎉 Deployment Successful!"
echo "📍 Your app is now running at: http://$(curl -s ifconfig.me)"
echo "💡 Use 'sudo docker-compose logs -f' to see the live forensic output."
