@echo off
rem Double-cliquer pour lancer le scanner. Premier lancement : installation (quelques minutes).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez. & pause & exit /b 1)
if not exist node_modules (echo Installation... & call npm install || (pause & exit /b 1))
if not exist .next\BUILD_ID (echo Preparation de l'application... & call npm run build || (pause & exit /b 1))
if not exist data\dvf (echo Telechargement de la DVF 44 85 49 37 78... & call npm run dvf:fetch -- 44 85 49 37 78)
start "" http://localhost:3000
call npm start
