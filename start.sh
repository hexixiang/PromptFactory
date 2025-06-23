#!/bin/bash

echo "🚀 启动LLM批量处理工具服务器..."
echo "📁 当前目录: $(pwd)"

# 检查Python版本
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到Python3，请先安装Python 3.7+"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📥 安装依赖..."
pip install -r requirements.txt

# 启动服务器
echo "🌐 启动Flask服务器..."
echo "📍 服务器地址: http://localhost:5000"
echo "🛑 按 Ctrl+C 停止服务器"
echo ""

python app.py 