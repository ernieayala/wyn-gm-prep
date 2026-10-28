@echo off
rem Serves the repo folder to this computer only (127.0.0.1), then opens the GM prep site.
rem Close this window to stop the site.
start "" http://127.0.0.1:8766/
python -m http.server 8766 --bind 127.0.0.1 --directory "%~dp0.."
