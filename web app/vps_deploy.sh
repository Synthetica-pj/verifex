#!/bin/bash
# =============================================================================
# VERIFEX 1.0 - AUTOMATED VPS DEPLOYMENT SCRIPT
# For: Ubuntu 24.04 with CloudPanel
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=================================================${NC}"
echo -e "${GREEN}🚀 VERIFEX 1.0 DEPLOYMENT SCRIPT${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# =============================================================================
# STEP 0: CHECK PREREQUISITES
# =============================================================================
echo -e "${YELLOW}[0/6] Checking prerequisites...${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root: sudo bash deploy.sh${NC}"
    exit 1
fi

# Check OS
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}❌ Unsupported OS${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Running as root on $(uname -a)${NC}"
echo ""

# =============================================================================
# STEP 1: SYSTEM UPDATE & SWAP
# =============================================================================
echo -e "${YELLOW}[1/6] Updating system and configuring memory...${NC}"

# Fix DNS issues (common in Docker build failures)
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf > /dev/null
echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf > /dev/null

# Restart Docker to pick up DNS changes if it's already installed
if command -v systemctl &> /dev/null && systemctl is-active --quiet docker; then
    echo "🔄 Restarting Docker to apply DNS changes..."
    sudo systemctl restart docker
fi

apt-get update -qq
apt-get upgrade -y -qq

# Create 4GB Swap file (8GB RAM total = 2GB physical + 4GB swap comfortable)
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    echo -e "${GREEN}✅ Created 4GB Swap file${NC}"
else
    echo -e "${GREEN}✅ Swap file already exists${NC}"
fi

sysctl vm.swappiness=10
echo -e "${GREEN}✅ System updated${NC}"
echo ""

# =============================================================================
# STEP 2: INSTALL DOCKER
# =============================================================================
echo -e "${YELLOW}[2/6] Installing Docker...${NC}"

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    systemctl start docker
    systemctl enable docker
    usermod -aG docker www-data
    echo -e "${GREEN}✅ Docker installed${NC}"
else
    echo -e "${GREEN}✅ Docker already installed${NC}"
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✅ Docker Compose already installed${NC}"
fi

docker --version
docker-compose --version
echo ""

# =============================================================================
# STEP 3: CREATE APP DIRECTORY & COPY FILES
# =============================================================================
echo -e "${YELLOW}[3/6] Setting up application directory...${NC}"

APP_DIR="/var/www/verifex"
mkdir -p $APP_DIR
chown www-data:www-data $APP_DIR

echo -e "${GREEN}✅ Created directory: $APP_DIR${NC}"
echo -e "${YELLOW}📁 Please upload your Verifex 1.0 files to: $APP_DIR${NC}"
echo -e "${YELLOW}   (Use SFTP or CloudPanel File Manager)${NC}"
echo ""

# =============================================================================
# STEP 4: CONFIGURE ENVIRONMENT
# =============================================================================
echo -e "${YELLOW}[4/6] Configuring environment variables...${NC}"

# Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    cat > $APP_DIR/.env << 'ENVFILE'
# Convex Configuration
CONVEX_URL=https://your-convex-project.convex.cloud

# Hidden Tier API (Optional)
HIDDEN_TIER_API_KEY=your_hidden_tier_api_key_here
HIDDEN_TIER_API_ENDPOINT=https://api.hidden-tier.com/analyze
HIDDEN_TIER_API_AUTH_MODE=bearer
ENVFILE
    echo -e "${GREEN}✅ Created .env file (please update with your real values)${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

chown www-data:www-data $APP_DIR/.env
echo ""

# =============================================================================
# STEP 5: BUILD & START CONTAINER
# =============================================================================
echo -e "${YELLOW}[5/6] Building and starting Docker container...${NC}"

cd $APP_DIR

# Build the Docker image
docker build -t verifex-app .
echo -e "${GREEN}✅ Docker image built${NC}"

# Run the container
docker stop verifex-app 2>/dev/null || true
docker rm verifex-app 2>/dev/null || true

docker run -d \
    --name verifex-app \
    --restart always \
    -p 8501:8501 \
    --env-file $APP_DIR/.env \
    -v $APP_DIR/logs:/app/logs \
    verifex-app

echo -e "${GREEN}✅ Container started${NC}"
docker ps | grep verifex-app
echo ""

# =============================================================================
# STEP 6: SETUP NGINX & SSL
# =============================================================================
echo -e "${YELLOW}[6/6] Setting up Nginx reverse proxy and SSL...${NC}"

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
    echo -e "${GREEN}✅ Nginx installed${NC}"
fi

# Create Nginx config
cat > /etc/nginx/sites-available/verifex << 'NGINXCONF'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8501;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINXCONF

# Enable the site
ln -sf /etc/nginx/sites-available/verifex /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx
systemctl enable nginx
echo -e "${GREEN}✅ Nginx configured${NC}"

# =============================================================================
# SSL CERTIFICATE (Let's Encrypt)
# =============================================================================
echo ""
echo -e "${YELLOW}🔐 SSL Certificate Setup${NC}"
echo -e "${YELLOW}To enable FREE SSL, run this command with your domain:${NC}"
echo -e "${GREEN}   certbot --nginx -d yourdomain.com${NC}"
echo ""

# =============================================================================
# FINAL STATUS
# =============================================================================
echo -e "${BLUE}=================================================${NC}"
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""
echo -e "${GREEN}📍 App running at: http://76.13.190.8:8501${NC}"
echo -e "${GREEN}🔧 Nginx proxy at: http://76.13.190.8${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update .env with your real CONVEX_URL"
echo "2. (Optional) Run: certbot --nginx -d yourdomain.com"
echo "3. Access your app at http://76.13.190.8"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  docker logs -f verifex-app    # View live logs"
echo "  docker restart verifex-app    # Restart app"
echo "  docker exec -it verifex-app bash  # Shell into container"
echo ""
