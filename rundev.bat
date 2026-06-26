@echo off
REM ============================================================
REM  rundev.bat - Khoi dong nhanh moi truong DEV ZeplaoPrint
REM    [1] Redis     (cache / websocket)  - Pricing\redis_bin
REM    [2] Backend   NestJS API           - http://localhost:4000/api/v1
REM    [3] Frontend  Next.js (agent UI)   - http://localhost:3002
REM  Moi service mo trong 1 cua so rieng. Dong cua so de tat service do.
REM  Cach dung:
REM    rundev.bat          -> khoi dong binh thuong
REM    rundev.bat clean    -> xoa cache .next truoc khi start (dung khi frontend bi treo)
REM  Luu y: duong dan du an khong nen chua dau cach.
REM ============================================================
setlocal
set "ROOT=%~dp0"

if /I "%~1"=="clean" (
  echo [clean] Xoa cache .next cua frontend...
  if exist "%ROOT%frontend\.next" rmdir /s /q "%ROOT%frontend\.next"
)

echo [1/3] Starting Redis...
if exist "%ROOT%redis_bin\redis-server.exe" (
  start "ZeplaoPrint Redis" "%ROOT%redis_bin\redis-server.exe" "%ROOT%redis_bin\redis.windows.conf"
) else (
  echo    ^> Khong tim thay Redis, bo qua. Backend van chay; chat/websocket co the han che.
)

echo [2/3] Starting Backend ^(NestJS :4000^)...
start "ZeplaoPrint Backend :4000" cmd /k "cd /d %ROOT%backend && npm run start:dev"

echo [3/3] Starting Frontend ^(Next.js :3002^)...
start "ZeplaoPrint Frontend :3002" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo.
echo ==============================================
echo   Backend : http://localhost:4000/api/v1
echo   Swagger : http://localhost:4000/api/v1/docs
echo   Frontend: http://localhost:3002
echo ==============================================
echo Da mo 3 cua so. Dong cua so tuong ung de tat tung service.
endlocal
