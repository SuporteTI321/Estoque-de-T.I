@echo off
echo Matando processos...
taskkill /F /IM "Estoque de T.I.exe" /T >nul 2>&1
rem taskkill vite.exe removido: o dev server roda em node, este kill nunca pegava nada
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
