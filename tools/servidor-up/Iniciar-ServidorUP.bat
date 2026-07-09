@echo off
cd /d "%~dp0"
echo.
echo   Radio Ibiza - Servidor UP (migracao legado)
echo   ===========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo   [ERRO] Python nao encontrado. Instale em python.org
  pause
  exit /b 1
)

where ffprobe >nul 2>&1
if errorlevel 1 (
  echo   [AVISO] ffprobe nao encontrado - instale ffmpeg
  echo.
)

echo   Servidor em https://127.0.0.1:8766
echo   Portal: Criacao - Servidor UP
echo.
echo   PRIMEIRA VEZ: abra https://127.0.0.1:8766/health e aceite o certificado.
echo.
python server.py
pause
