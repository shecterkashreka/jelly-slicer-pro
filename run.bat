@echo off
cd /d "%~dp0"
py -u main.py
if errorlevel 1 (
    pause
)