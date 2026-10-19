@echo off
title Mate y Cafe - Stock
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
echo  Sistema de stock en http://localhost:5500/stock/
echo  Deja esta ventana abierta mientras lo uses. Cerrala para apagarlo.
echo.
start "" "http://localhost:5500/stock/"
%PY% -m http.server 5500
pause
