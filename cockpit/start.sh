#!/usr/bin/env bash
# Industrial Decision Cockpit — setup script for a fresh GitHub Codespace
# Usage: ./start.sh
#
# This script:
#   1. Starts MongoDB in Docker
#   2. Configures backend/.env and frontend/.env with Codespaces public URLs
#   3. Installs Python deps in a venv
#   4. Installs frontend deps with yarn
#   5. Tells you what to do next (launching servers in 2 separate terminals)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Industrial Decision Cockpit — Setup ==="
echo ""

# --- 1. MongoDB ---
echo "▶ Vérification de MongoDB..."
if docker ps --format '{{.Names}}' | grep -q '^mongo-cockpit$'; then
    echo "  ✓ MongoDB tourne déjà"
elif docker ps -a --format '{{.Names}}' | grep -q '^mongo-cockpit$'; then
    echo "  → Redémarrage du conteneur existant"
    docker start mongo-cockpit
else
    echo "  → Création d'un nouveau conteneur Mongo:7"
    docker run -d --name mongo-cockpit -p 27017:27017 mongo:7
fi
echo ""

# --- 2. Detect Codespace URLs ---
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
    BACKEND_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    FRONTEND_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo "▶ Codespaces détecté"
    echo "  Backend URL  : $BACKEND_URL"
    echo "  Frontend URL : $FRONTEND_URL"
else
    BACKEND_URL="http://localhost:8000"
    FRONTEND_URL="http://localhost:3000"
    echo "▶ Environnement local détecté (pas Codespaces)"
    echo "  Backend URL  : $BACKEND_URL"
    echo "  Frontend URL : $FRONTEND_URL"
fi
echo ""

# --- 3. Write .env files ---
echo "▶ Configuration des .env..."
cat > backend/.env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="industrial_decision"
JWT_SECRET="dev-only-change-for-production-use-secrets-token-hex-32"
CORS_ORIGINS="http://localhost:3000,${FRONTEND_URL}"
EOF
echo "  ✓ backend/.env"

cat > frontend/.env << EOF
REACT_APP_BACKEND_URL=${BACKEND_URL}
EOF
echo "  ✓ frontend/.env"
echo ""

# --- 4. Backend install ---
echo "▶ Installation du backend (venv + deps)..."
cd backend
if [ ! -d .venv ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate
cd ..
echo "  ✓ Backend prêt"
echo ""

# --- 5. Frontend install ---
echo "▶ Installation du frontend (yarn)..."
cd frontend
if [ ! -d node_modules ]; then
    yarn install --silent
else
    echo "  → node_modules déjà présent, skip install"
fi
cd ..
echo "  ✓ Frontend prêt"
echo ""

# --- 6. Next steps ---
cat << 'EOF'
====================================================
✓ Setup terminé — lance les serveurs dans 2 terminaux
====================================================

Terminal 1 (backend) :
  cd backend
  source .venv/bin/activate
  uvicorn server:app --reload --host 0.0.0.0 --port 8000

Terminal 2 (frontend) :
  cd frontend
  yarn start

Puis dans l'onglet PORTS de VSCode :
  - Clic droit sur 8000 → Port Visibility → Public
  - Clic droit sur 3000 → Port Visibility → Public
  - Clic sur l'icône globe à côté du port 3000

Login :
  Email    : lucas@industrial-decision.fr
  Password : industrialdecision

(Tu seras redirigé vers /profil pour changer le mot de passe
au premier login — c'est normal.)

EOF
