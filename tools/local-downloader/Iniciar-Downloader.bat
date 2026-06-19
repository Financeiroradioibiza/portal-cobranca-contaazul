@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Radio Ibiza — Downloader local

echo.
echo  Radio Ibiza — Downloader local (yt-dlp)
echo  =======================================
echo.

set "PY="
where python >nul 2>&1
if %errorlevel%==0 set "PY=python"
if not defined PY (
  where py >nul 2>&1
  if %errorlevel%==0 set "PY=py -3"
)

if not defined PY (
  echo  [ERRO] Python 3 nao encontrado.
  echo.
  echo  Instale em https://www.python.org/downloads/
  echo  Na instalacao, marque: "Add python.exe to PATH"
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo  Usando: %%v
echo.

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
  echo  [AVISO] ffmpeg nao encontrado — downloads podem falhar.
  echo  Instale: winget install Gyan.FFmpeg
  echo.
)

echo  Instalando/atualizando yt-dlp...
%PY% -m pip install --user -r requirements.txt
if %errorlevel% neq 0 (
  echo.
  echo  [ERRO] Falha ao instalar dependencias.
  pause
  exit /b 1
)

echo.
echo  Servidor em https://127.0.0.1:8765
echo  MP3s em %%USERPROFILE%%\Downloads\RadioIbiza-downloads
echo.
echo  PRIMEIRA VEZ: abra https://127.0.0.1:8765/health no navegador
echo  e aceite o certificado. Depois recarregue o portal.
echo.
echo  Deixe ESTA JANELA ABERTA enquanto usa o portal:
echo  Criacao ^> Upload ^> Musica baixada
echo.
echo  Para encerrar: feche esta janela ou Ctrl+C
echo.

%PY% server.py

echo.
echo  Servidor encerrado.
pause
