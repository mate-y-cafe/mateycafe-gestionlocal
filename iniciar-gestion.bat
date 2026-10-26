@echo off
title Mate y Cafe - Gestion
cd /d "%~dp0"
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY (
  echo No se encontro Python. Instalalo desde https://www.python.org/downloads/ y volve a abrir este archivo.
  pause
  exit /b 1
)
echo.
echo  Gestion del local (stock y personal) en http://localhost:5500/gestion/
echo  Deja esta ventana abierta mientras lo uses. Cerrala para apagarlo.
echo.
start "" "http://localhost:5500/gestion/"
%PY% -m http.server 5500
pause
