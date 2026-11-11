@echo off
chcp 65001 >nul
title App Lyrics - Servidor Local
cd /d "%~dp0"

echo ==================================================
echo   App Lyrics - Alabanza y Medios Audiovisuales
echo ==================================================
echo.

if not exist "package.json" (
    echo [ERROR] No se encontro package.json en esta carpeta.
    echo Si deseas un icono en el Escritorio, crea un "Acceso directo"
    echo a este archivo en lugar de moverlo fuera de la carpeta del proyecto.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No se encontro Node.js / npm instalado en el sistema.
    echo Descarga e instala Node.js LTS desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] No se encontro la carpeta node_modules.
    echo [INFO] Instalando dependencias por primera vez...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
    echo.
)

echo [INFO] Iniciando servidor local...
echo [INFO] El navegador se abrira automaticamente en unos segundos.
echo [INFO] Para probar en celular (misma red Wi-Fi), abre la URL "Network" que aparece abajo.
echo [INFO] Para detener la aplicacion, cierra esta ventana o presiona Ctrl + C.
echo.

call npm run dev -- --host --open

echo.
echo [INFO] El servidor local se ha detenido.
pause
