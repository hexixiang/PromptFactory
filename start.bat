@echo off
echo 🚀 启动LLM批量处理工具服务器...
echo 📁 当前目录: %CD%

REM 检查Python版本
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到Python，请先安装Python 3.7+
    pause
    exit /b 1
)

REM 检查虚拟环境
if not exist "venv" (
    echo 📦 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
echo 🔧 激活虚拟环境...
call venv\Scripts\activate.bat

REM 安装依赖
echo 📥 安装依赖...
pip install -r requirements.txt

REM 启动服务器
echo 🌐 启动Flask服务器...
echo 📍 服务器地址: http://localhost:5000
echo 🛑 按 Ctrl+C 停止服务器
echo.

python app.py
pause 