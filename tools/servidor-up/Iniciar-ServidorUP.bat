@echo off
cd /d "%~dp0"
echo.
echo   Radio Ibiza - Servidor UP (migracao legado)
echo   ===========================================
echo.

set PYEXE=
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set PYEXE=py -3
)

if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -c "import sys" >nul 2>&1
    if not errorlevel 1 set PYEXE=python
  )
)

if not defined PYEXE (
  echo   [ERRO] Python 3 nao instalado ou incompleto.
  echo.
  echo   No PowerShell, rode UM dos comandos abaixo e depois abra este .bat de novo:
  echo     py install default
  echo   ou instale em https://www.python.org/downloads/ ^(marque Add to PATH^)
  echo.
  pause
  exit /b 1
)

where ffprobe >nul 2>&1
if errorlevel 1 (
  echo   [AVISO] ffprobe nao encontrado - duração das faixas ficará vazia.
  echo   Instale: winget install Gyan.FFmpeg
  echo   Depois FECHE e abra de novo este terminal.
  echo.
)

echo   Usando: %PYEXE%
%PYEXE% --version
echo.
echo   Servidor em https://127.0.0.1:8766
echo   Portal: Criacao - Servidor UP
echo.
echo   PRIMEIRA VEZ: abra https://127.0.0.1:8766/health e aceite o certificado.
echo   Deixe ESTA JANELA ABERTA durante a migracao.
echo.
%PYEXE% server.py
if errorlevel 1 (
  echo.
  echo   [ERRO] Servidor encerrou com falha.
)
pause
