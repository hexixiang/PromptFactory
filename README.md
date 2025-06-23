# PromptFactory

## 项目主界面

![](imgs/1.png)

## 批量处理示例

![](imgs/2.png)

一个基于Flask的Web应用，支持多项目管理、动态提示词编写和大模型API批量调用。

## 功能特性

- **多项目管理**: 创建、编辑、删除项目，每个项目独立的API配置
- **动态提示词**: 支持变量替换的提示词模板
- **批量处理**: 并发处理JSONL文件，支持自定义并发数
- **API配置**: 支持多种大模型API配置（OpenAI、自定义API等）
- **处理记录**: 保存处理历史，查看成功/失败统计
- **结果导出**: 自动下载处理结果文件

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务器

```bash
# Linux/Mac
./start.sh

# Windows
start.bat

# 或直接运行
python app.py
```

### 3. 访问应用

打开浏览器访问: http://localhost:5001

## 使用指南

### 1. 创建项目

1. 点击"创建新项目"
2. 填写项目名称和描述
3. 配置API参数：
   - **API地址**: 大模型API的URL（如：https://api.openai.com/v1/chat/completions）
   - **模型名称**: 使用的模型名称（如：gpt-4）
   - **API密钥**: 认证密钥
   - **温度**: 控制输出随机性（0-2）
   - **最大生成长度**: 单次响应的最大token数
   - **超时时间**: 请求超时时间（秒）
   - **请求频率限制**: 每秒请求数限制

### 2. 上传文件

1. 选择项目，点击"开始处理"
2. 上传JSONL格式文件（每行一个JSON对象）
3. 系统会自动解析文件并显示可用变量

### 3. 编写提示词

1. 在提示词编辑器中编写模板
2. 使用 `{{变量名}}` 格式引用数据中的字段
3. 点击"测试提示词"验证模板是否正确

### 4. 执行处理

1. 设置并发工作线程数（建议5-20）
2. 点击"开始处理"
3. 系统会并发调用API处理所有数据
4. 处理完成后自动下载结果文件

## API配置说明

### OpenAI API配置示例

```json
{
  "apiUrl": "https://api.openai.com/v1/chat/completions",
  "modelName": "gpt-4",
  "apiKey": "sk-your-api-key",
  "temperature": 0.7,
  "maxTokens": 1000,
  "timeout": 30
}
```

### 自定义API配置示例

```json
{
  "apiUrl": "https://your-api-endpoint.com/chat",
  "modelName": "your-model",
  "auth_token": "your-auth-token",
  "temperature": 0.3,
  "maxTokens": 16384,
  "timeout": 60
}
```

## 文件格式

### 输入文件格式（JSONL）

每行一个JSON对象，例如：

```jsonl
{"text": "你好，请介绍一下人工智能", "user_input": "什么是AI"}
{"text": "请解释机器学习的基本概念", "user_input": "机器学习是什么"}
{"text": "深度学习与传统机器学习的区别", "user_input": "深度学习和机器学习的区别"}
```

### 输出文件格式

处理后的文件会包含原始数据加上新的响应字段：

```jsonl
{"text": "你好，请介绍一下人工智能", "user_input": "什么是AI", "response": "人工智能是..."}
{"text": "请解释机器学习的基本概念", "user_input": "机器学习是什么", "response": "机器学习是..."}
{"text": "深度学习与传统机器学习的区别", "user_input": "深度学习和机器学习的区别", "response": "主要区别在于..."}
```

## 技术特性

- **并发处理**: 使用ThreadPoolExecutor实现并发API调用
- **错误处理**: 完善的错误处理和重试机制
- **进度跟踪**: 实时显示处理进度和统计信息
- **数据持久化**: SQLite数据库存储项目和记录
- **响应式UI**: 现代化的Web界面，支持拖拽上传

## 部署说明

### 生产环境部署

1. 使用生产级WSGI服务器（如Gunicorn）
2. 配置反向代理（如Nginx）
3. 设置环境变量和安全配置
4. 配置SSL证书

### Docker部署

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5001
CMD ["python", "app.py"]
```

## 故障排除

### 常见问题

1. **API调用失败**: 检查API配置是否正确，网络连接是否正常
2. **并发数过高**: 降低并发工作线程数，避免触发API限制
3. **文件格式错误**: 确保上传的是有效的JSONL文件
4. **内存不足**: 对于大文件，考虑分批处理

### 日志查看

应用运行时会输出详细的处理日志，包括：
- API调用状态
- 错误信息
- 处理进度
- 性能统计

## 更新日志

### v2.0.0
- 添加真正的模型API调用功能
- 支持多种API认证方式
- 优化并发处理性能
- 改进错误处理机制
- 添加处理进度跟踪

### v1.0.0
- 基础的多项目管理功能
- 文件上传和处理
- 提示词模板编辑
- 结果导出功能 