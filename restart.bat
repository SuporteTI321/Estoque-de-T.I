@echo off
echo Matando processos...
taskkill /F /IM almoxarifado-pro.exe /T >nul 2>&1
taskkill /F /IM vite.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo Verificando porta 1423...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1423" ^| findstr "LISTENING"') do (
    echo Matando PID %%a
    taskkill /F /PID %%a /T >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Iniciando aplicacao...
cd /d "D:\Projetos em Andamentos\Estoque de T.I"
npx tauri dev
