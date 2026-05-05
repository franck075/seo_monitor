#!/bin/bash
# Script de déploiement SEO Alert Scan
# Usage: ./deploy.sh

set -e

echo "=== SEO Alert Scan - Déploiement ==="

# 1. Pull dernières modifications
echo "→ Mise à jour du code..."
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

# 2. Build des images
echo "→ Build des images Docker..."
docker compose -f docker-compose.prod.yml build --no-cache

# 3. Démarrage des services (les credentials sont lus depuis .env automatiquement)
echo "→ Démarrage des services..."
docker compose -f docker-compose.prod.yml up -d

# 4. Attendre que le backend soit prêt (il exécute les migrations au démarrage)
echo "→ Attente du backend..."
sleep 15
docker compose -f docker-compose.prod.yml ps backend

# 5. Redémarrer nginx pour qu'il rafraîchisse le DNS interne vers les containers recréés
echo "→ Redémarrage nginx (rafraîchissement DNS)..."
docker compose -f docker-compose.prod.yml restart nginx

echo "✅ Déploiement terminé !"
echo "→ Site     : https://seoalertscan.com"
echo "→ API docs : https://seoalertscan.com/api/v1/docs"
