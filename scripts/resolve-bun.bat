@echo off
set "BUN_EXE="

for /f "delims=" %%B in ('where bun.exe 2^>nul') do if not defined BUN_EXE set "BUN_EXE=%%B"

for %%B in (
  "%USERPROFILE%\.bun\bin\bun.exe"
  "%LOCALAPPDATA%\bun\bun.exe"
  "%USERPROFILE%\scoop\apps\bun\current\bun.exe"
) do if not defined BUN_EXE if exist "%%~B" set "BUN_EXE=%%~fB"

if not defined BUN_EXE (
  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Oven-sh.Bun_*") do (
    if exist "%%~fD\bun-windows-x64\bun.exe" set "BUN_EXE=%%~fD\bun-windows-x64\bun.exe"
  )
)

if not defined BUN_EXE (
  echo [RegChula] Bun 1.3.14 was not found in PATH or a standard per-user install location.
  exit /b 1
)

set "BUN_VERSION="
for /f "delims=" %%V in ('"%BUN_EXE%" --version 2^>nul') do set "BUN_VERSION=%%V"
if not "%BUN_VERSION%"=="1.3.14" (
  echo [RegChula] Bun 1.3.14 is required, but "%BUN_EXE%" reports %BUN_VERSION%.
  exit /b 1
)

exit /b 0
