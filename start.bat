@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: ============================================================================
:: 1, 2, 3 DO! -- WINDOWS STARTUP SCRIPT (Master Plan v1.0 -- Task 5.4)
:: - Chuyen ve dung thu muc chua start.bat (ho tro duong dan co dau cach).
:: - Giu nguyen MOCK mode mac dinh, khong tu chuyen APP_MODE=LIVE.
:: - Khong tu dong chay npm install khi chua co su dong y cua nguoi dung.
:: - Khong yeu cau hay in ra bat ky cookie, session, mat khau, ADMIN_SECRET_TOKEN.
:: - Khong xoa data/state-snapshot.json khi khoi dong.
:: - Phuc vu truc tiep ca Game Frontend (client/dist) va Backend tren cong 3000.
:: ============================================================================

cd /d "%~dp0"
title 1, 2, 3 DO! - Quan Nhau Via He (TikTok Live Interactive Game)

echo ============================================================================
echo   1, 2, 3 DO! - QUAN NHAU VIA HE (Master Plan v1.0)
echo   Thu muc lam viec: "%CD%"
echo ============================================================================
echo.

:: 1. Kiem tra Node.js va npm co san
where node >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js trong PATH he thong.
    echo       Vui long cai dat Node.js LTS ^(>= 18.x^) tai https://nodejs.org/ roi thu lai.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay cong cu npm trong PATH he thong.
    echo       Vui long kiem tra lai cai dat Node.js va npm.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "delims=" %%v in ('call npm -v 2^>nul') do set "NPM_VER=%%v"
echo [OK] Phat hien Node.js %NODE_VER% va npm v%NPM_VER%.

:: 2. Kiem tra cac thu muc va file bat buoc
if not exist "%~dp0package.json" (
    echo [LOI] Thieu file bat buoc: package.json tai thu muc goc.
    pause
    exit /b 1
)
if not exist "%~dp0server\index.js" (
    echo [LOI] Thieu file bat buoc: server\index.js.
    pause
    exit /b 1
)
if not exist "%~dp0config\default.json" (
    echo [LOI] Thieu file bat buoc: config\default.json.
    pause
    exit /b 1
)
if not exist "%~dp0client\package.json" (
    echo [LOI] Thieu file bat buoc: client\package.json.
    pause
    exit /b 1
)
if not exist "%~dp0mock-dashboard\index.html" (
    echo [LOI] Thieu file bat buoc: mock-dashboard\index.html.
    pause
    exit /b 1
)
echo [OK] Day du cac file cau truc he thong bat buoc.

:: 3. Kiem tra dependencies da duoc cai (Khong tu dong npm install neu chua co su dong y)
if not exist "%~dp0node_modules\express\package.json" (
    echo.
    echo [LOI] Chua cai dat thu vien Backend ^(thieu thu muc node_modules^).
    echo       Script KHONG tu dong chay npm install khi chua co su dong y cua ban.
    echo       Vui long mo Terminal tai "%CD%" va chay lenh:
    echo         npm install
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0client\node_modules\phaser\package.json" (
    echo.
    echo [LOI] Chua cai dat thu vien Frontend ^(thieu thu muc client\node_modules^).
    echo       Script KHONG tu dong chay npm install khi chua co su dong y cua ban.
    echo       Vui long mo Terminal tai "%CD%\client" va chay lenh:
    echo         cd client ^&^& npm install
    echo.
    pause
    exit /b 1
)
echo [OK] Dependencies Backend va Frontend da san sang.

:: 4. Kiem tra ban build Production cua Frontend (client\dist\index.html)
::    Khong build lai moi lan mo game neu da co san client\dist\index.html
if not exist "%~dp0client\dist\index.html" (
    echo [THONG BAO] Chua co ban build giao dien client\dist\index.html.
    echo             Dang tien hanh build giao dien Frontend lan dau...
    pushd "%~dp0client"
    call npm run build
    if errorlevel 1 (
        popd
        echo [LOI] Build giao dien Frontend that bai. Vui long kiem tra thong bao loi phia tren.
        pause
        exit /b 1
    )
    popd
)
echo [OK] Ban build giao dien Production ^(client\dist\index.html^) da san sang.

:: 5. Doc cong PORT va che do APP_MODE an toan (Tuyet doi khong in ra bat ky secret/token nao)
set "GAME_HOST=127.0.0.1"
set "GAME_PORT=3000"
set "GAME_MODE=MOCK"

if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if /i "!KEY!"=="PORT" if not "!VAL!"=="" set "GAME_PORT=!VAL!"
        if /i "!KEY!"=="HOST" if not "!VAL!"=="" set "GAME_HOST=!VAL!"
        if /i "!KEY!"=="APP_MODE" if not "!VAL!"=="" set "GAME_MODE=!VAL!"
    )
)

:: 6. Kiem tra xung dot cong (Khong tao nhieu Backend/Frontend server trung cong)
"%SystemRoot%\System32\NETSTAT.EXE" -ano 2>nul | "%SystemRoot%\System32\findstr.exe" /R /C:":%GAME_PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo.
    echo [LOI] Cong %GAME_PORT% dang bi chiem boi mot tien trinh khac ^(hoac Game dang chay san^).
    echo       He thong chan khoi tao trung lap de bao ve trang thai ban nhau va snapshot.
    echo.
    echo       Cach xu ly:
    echo         1. Neu Game dang chay o cua so khac, hay su dung cua so do hoac nhan Ctrl+C de tat.
    echo         2. Kiem tra tien trinh chiem cong bang lenh: netstat -ano ^| findstr :%GAME_PORT%
    echo.
    pause
    exit /b 1
)
echo [OK] Cong %GAME_PORT% thong thoang, khong co tien trinh trung lap.

:: 7. Hien thi thong tin van hanh va huong dan dung an toan
echo.
echo ============================================================================
echo   THONG TIN VAN HANH (Che do hien tai: %GAME_MODE%)
echo ----------------------------------------------------------------------------
echo   * Bang dieu khien Control Panel (Ket noi TikTok Live + Mock Simulator):
echo       http://%GAME_HOST%:%GAME_PORT%/mock
echo.
echo   * Man hinh Game Overlay 9:16 (TikTok LIVE Studio / OBS 1080x1920):
echo       http://%GAME_HOST%:%GAME_PORT%/overlay   (hoac http://%GAME_HOST%:%GAME_PORT%/)
echo.
echo   * Kiem tra trang thai Server (Health Check):
echo       http://%GAME_HOST%:%GAME_PORT%/health
echo.
echo   * File Snapshot trang thai ban nhau (KHONG bi xoa khi khoi dong):
echo       data\state-snapshot.json
echo ----------------------------------------------------------------------------
echo   HUONG DAN DUNG GAME AN TOAN:
echo   - Nhan to hop phim Ctrl + C ngay tai cua so nay de tat Server an toan.
echo   - Khi nhan Ctrl + C, Backend se luu ngay snapshot moi nhat ra dia truoc khi thoat.
echo   - Tranh tat ngang cua so bang dau [X] khi dang co bien doi trang thai.
echo ============================================================================
echo.

:: 8. Khoi chay Backend Node.js (phuc vu dong thoi ca Frontend Production Build + Socket.io + API)
node "%~dp0server\index.js"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [CANH BAO] Tien trinh Backend da dung voi ma loi: %EXIT_CODE%.
    echo            Snapshot khan cap ^(neu co^) da duoc bao toan tai data\state-snapshot.json.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo [HOAN TAT] Game da dung an toan.
exit /b 0
