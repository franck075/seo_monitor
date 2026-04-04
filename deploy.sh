#!/bin/bash
# Script de déploiement SEO Alert Scan
# Usage: ./deploy.sh

set -e

echo "=== SEO Alert Scan - Déploiement ==="

# 1. Pull dernières modifications
echo "→ Mise à jour du code..."
git pull origin main

# 2. Build des images
echo "→ Build des images Docker..."
docker compose -f docker-compose.prod.yml build --no-cache

# 3. Démarrage des services
echo "→ Démarrage des services..."
DB_USER=seomonitor DB_PASSWORD=seomonitor DB_NAME=seomonitor \
  docker compose -f docker-compose.prod.yml up -d

# 4. Migrations base de données
echo "→ Exécution des migrations..."
sleep 8
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

echo "✅ Déploiement terminé !"
echo "→ Site     : https://seoalertscan.com"
echo "→ API docs : https://seoalertscan.com/api/v1/docs"
