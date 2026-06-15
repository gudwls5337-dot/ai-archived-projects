@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo Excel 번역기 시작 중...

:: 백그라운드에서 streamlit 실행
start "Excel 번역기 서버" python -m streamlit run app.py --server.port 8501 --server.address 127.0.0.1 --server.headless true

:: 서버 시작 대기 (5초)
timeout /t 5 /nobreak > nul

:: 브라우저 자동 열기
start http://127.0.0.1:8501

echo.
echo 브라우저가 열렸습니다.
echo 서버를 종료하려면 작업 표시줄의 "Excel 번역기 서버" 창을 닫으세요.
timeout /t 3 /nobreak > nul
