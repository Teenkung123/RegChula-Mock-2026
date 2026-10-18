@echo off
setlocal
cd /d "%~dp0"
bun run test:load:prepare || exit /b 1
docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 -v "%cd%\tests\load:/scripts" grafana/k6 run /scripts/presentation.js || exit /b 1
bun run test:load:verify
