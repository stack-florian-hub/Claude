#!/bin/bash
# Double-cliquer pour lancer le scanner. Premier lancement : installation (quelques minutes).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js est introuvable : installez-le depuis https://nodejs.org puis relancez."; read -r; exit 1; }
[ -d node_modules ] || { echo "Installation…"; npm install || exit 1; }
[ -f .next/BUILD_ID ] || { echo "Préparation de l'application…"; npm run build || exit 1; }
[ -d data/dvf ] || { echo "Téléchargement de la DVF 44 85 49 37 78…"; npm run dvf:fetch -- 44 85 49 37 78; }
(sleep 3; open http://localhost:3000) &
npm start
