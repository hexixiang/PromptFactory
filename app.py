from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
import json
import os
import uuid
from datetime import datetime
import sqlite3
from werkzeug.utils import secure_filename
import requests
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # 在生产环境中应该使用环境变量
CORS(app)

# 线程锁用于文件写入
write_lock = threading.Lock()

# 数据库初始化
def init_db():
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    # 创建项目表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            api_config TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 创建处理记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processing_records (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            file_name TEXT,
            total_lines INTEGER,
            success_count INTEGER,
            error_count INTEGER,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# 初始化数据库
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """获取所有项目列表"""
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, name, description, api_config, created_at, updated_at 
        FROM projects 
        ORDER BY updated_at DESC
    ''')
    
    projects = []
    for row in cursor.fetchall():
        projects.append({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'api_config': json.loads(row[3]) if row[3] else None,
            'created_at': row[4],
            'updated_at': row[5]
        })
    
    conn.close()
    return jsonify(projects)

@app.route('/api/projects', methods=['POST'])
def create_project():
    """创建新项目"""
    data = request.json
    project_id = str(uuid.uuid4())
    
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO projects (id, name, description, api_config)
        VALUES (?, ?, ?, ?)
    ''', (
        project_id,
        data.get('name', '新项目'),
        data.get('description', ''),
        json.dumps(data.get('api_config', {}))
    ))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': project_id,
        'name': data.get('name', '新项目'),
        'description': data.get('description', ''),
        'api_config': data.get('api_config', {}),
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    })

@app.route('/api/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    """获取单个项目详情"""
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, name, description, api_config, created_at, updated_at 
        FROM projects 
        WHERE id = ?
    ''', (project_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return jsonify({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'api_config': json.loads(row[3]) if row[3] else None,
            'created_at': row[4],
            'updated_at': row[5]
        })
    else:
        return jsonify({'error': '项目不存在'}), 404

@app.route('/api/projects/<project_id>', methods=['PUT'])
def update_project(project_id):
    """更新项目"""
    data = request.json
    
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE projects 
        SET name = ?, description = ?, api_config = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('name', ''),
        data.get('description', ''),
        json.dumps(data.get('api_config', {})),
        project_id
    ))
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({'error': '项目不存在'}), 404
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': '项目更新成功'})

@app.route('/api/projects/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """删除项目"""
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({'error': '项目不存在'}), 404
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': '项目删除成功'})

@app.route('/api/projects/<project_id>/process', methods=['POST'])
def process_file(project_id):
    """处理文件"""
    try:
        # 获取项目配置
        conn = sqlite3.connect('projects.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT api_config FROM projects WHERE id = ?', (project_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({'error': '项目不存在'}), 404
        
        api_config = json.loads(row[0]) if row[0] else {}
        conn.close()
        
        # 获取上传的文件
        if 'file' not in request.files:
            print("DEBUG: 没有找到文件字段")
            print(f"DEBUG: 请求文件字段: {list(request.files.keys())}")
            return jsonify({'error': '没有上传文件'}), 400
        
        file = request.files['file']
        if file.filename == '':
            print("DEBUG: 文件名为空")
            return jsonify({'error': '没有选择文件'}), 400
        
        print(f"DEBUG: 接收到文件: {file.filename}")
        
        # 读取文件内容
        try:
            content = file.read().decode('utf-8')
            print(f"DEBUG: 文件内容长度: {len(content)}")
        except Exception as e:
            print(f"DEBUG: 文件读取失败: {e}")
            return jsonify({'error': f'文件读取失败: {str(e)}'}), 400
        
        lines = content.split('\n')
        print(f"DEBUG: 文件行数: {len(lines)}")
        
        # 解析JSONL
        data = []
        for i, line in enumerate(lines):
            if line.strip():
                try:
                    json_obj = json.loads(line)
                    data.append(json_obj)
                except json.JSONDecodeError as e:
                    print(f"DEBUG: 第{i+1}行JSON解析失败: {e}")
                    return jsonify({'error': f'第{i+1}行JSON格式错误: {str(e)}'}), 400
        
        print(f"DEBUG: 成功解析 {len(data)} 行数据")
        
        # 获取处理参数
        prompt_template = request.form.get('prompt_template', '')
        result_field_name = request.form.get('result_field_name', 'response')
        max_workers = int(request.form.get('max_workers', 10))
        
        print(f"DEBUG: 提示词模板长度: {len(prompt_template)}")
        print(f"DEBUG: 结果字段名: {result_field_name}")
        print(f"DEBUG: 最大工作线程数: {max_workers}")
        
        # 检查API配置
        api_url = api_config.get('api_url') or api_config.get('apiUrl')
        if not api_url:
            print("DEBUG: API URL未配置")
            return jsonify({'error': '请先配置API URL'}), 400
        
        print(f"DEBUG: API URL: {api_url}")
        
        # 使用线程池处理数据
        processed_data = []
        error_count = 0
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(call_llm_api, item, prompt_template, api_config, result_field_name): idx
                for idx, item in enumerate(data)
            }
            
            for future in as_completed(futures):
                try:
                    processed_item, error = future.result()
                    processed_data.append(processed_item)
                    if error:
                        error_count += 1
                        print(f"DEBUG: 处理错误: {error}")
                except Exception as e:
                    error_count += 1
                    print(f"处理任务异常：{e}")
        
        print(f"DEBUG: 处理完成，成功: {len(processed_data) - error_count}, 失败: {error_count}")
        
        # 保存处理记录
        record_id = str(uuid.uuid4())
        conn = sqlite3.connect('projects.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO processing_records (id, project_id, file_name, total_lines, success_count, error_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            record_id,
            project_id,
            file.filename,
            len(data),
            len(processed_data) - error_count,
            error_count,
            'completed'
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'record_id': record_id,
            'processed_data': processed_data,
            'total_lines': len(data),
            'success_count': len(processed_data) - error_count,
            'error_count': error_count
        })
        
    except Exception as e:
        print(f"DEBUG: 处理文件异常: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/processing-records', methods=['GET'])
def get_processing_records():
    """获取处理记录"""
    project_id = request.args.get('project_id')
    
    conn = sqlite3.connect('projects.db')
    cursor = conn.cursor()
    
    if project_id:
        cursor.execute('''
            SELECT id, project_id, file_name, total_lines, success_count, error_count, status, created_at
            FROM processing_records 
            WHERE project_id = ?
            ORDER BY created_at DESC
        ''', (project_id,))
    else:
        cursor.execute('''
            SELECT id, project_id, file_name, total_lines, success_count, error_count, status, created_at
            FROM processing_records 
            ORDER BY created_at DESC
        ''')
    
    records = []
    for row in cursor.fetchall():
        records.append({
            'id': row[0],
            'project_id': row[1],
            'file_name': row[2],
            'total_lines': row[3],
            'success_count': row[4],
            'error_count': row[5],
            'status': row[6],
            'created_at': row[7]
        })
    
    conn.close()
    return jsonify(records)

@app.route('/api/test-prompt', methods=['POST'])
def test_prompt():
    """测试提示词API调用"""
    try:
        data = request.json
        project_id = data.get('project_id')
        prompt_template = data.get('prompt_template')
        test_data = data.get('test_data')
        
        if not all([project_id, prompt_template, test_data]):
            return jsonify({'error': '缺少必要参数'}), 400
        
        # 获取项目配置
        conn = sqlite3.connect('projects.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT api_config FROM projects WHERE id = ?', (project_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({'error': '项目不存在'}), 404
        
        api_config = json.loads(row[0]) if row[0] else {}
        conn.close()
        
        # 调用API进行测试
        processed_item, error = call_llm_api(test_data, prompt_template, api_config, 'response')
        
        # 使用相同的变量替换函数来渲染提示词
        import re
        def replace_variables(template, data):
            """智能变量替换函数 - 使用更精确的匹配规则"""
            def replace_match(match):
                var_name = match.group(1)
                if var_name in data:
                    return str(data[var_name])
                else:
                    # 如果变量不存在，保持原样
                    return match.group(0)
            
            # 使用更精确的正则表达式：
            # 1. 匹配{{变量名}}格式，其中变量名只能包含字母、数字、下划线
            # 2. 确保{{和}}之间没有空格
            # 3. 避免匹配转义的大括号
            pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}'
            return re.sub(pattern, replace_match, template)
        
        rendered_prompt = replace_variables(prompt_template, test_data)
        
        if error:
            return jsonify({
                'success': False,
                'error': error,
                'rendered_prompt': rendered_prompt
            })
        else:
            return jsonify({
                'success': True,
                'response': processed_item.get('response', ''),
                'rendered_prompt': rendered_prompt
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def call_llm_api(data_item, prompt_template, api_config, result_field_name):
    """调用大模型API"""
    try:
        import re
        
        # 使用正则表达式精确匹配{{变量名}}格式，避免误处理其他大括号
        def replace_variables(template, data):
            """智能变量替换函数 - 使用更精确的匹配规则"""
            def replace_match(match):
                var_name = match.group(1)
                if var_name in data:
                    return str(data[var_name])
                else:
                    # 如果变量不存在，保持原样
                    return match.group(0)
            
            # 使用更精确的正则表达式：
            # 1. 匹配{{变量名}}格式，其中变量名只能包含字母、数字、下划线
            # 2. 确保{{和}}之间没有空格
            # 3. 避免匹配转义的大括号
            pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}'
            return re.sub(pattern, replace_match, template)
        
        # 构建用户提示词
        try:
            user_prompt = replace_variables(prompt_template, data_item)
            print(f"DEBUG: 原始模板: {prompt_template}")
            print(f"DEBUG: 数据项: {data_item}")
            print(f"DEBUG: 渲染后提示词: {user_prompt}")
        except Exception as e:
            raise ValueError(f"模板渲染失败: {str(e)}")
        
        # 构建请求头
        headers = {
            "Content-Type": "application/json"
        }
        
        # 处理API URL - 支持前端和后端的字段名
        api_url = api_config.get('api_url') or api_config.get('apiUrl')
        if not api_url:
            raise ValueError("API URL未配置")
        
        # 处理认证信息 - 支持多种认证方式
        if api_config.get('apiKey'):
            headers["Authorization"] = f"Bearer {api_config['apiKey']}"
        elif api_config.get('auth_token'):
            headers["X-Auth-Token"] = api_config['auth_token']
        elif api_config.get('authorization'):
            headers["Authorization"] = api_config['authorization']
        
        # 构建请求体 - 修复消息格式
        payload = {
            "model": api_config.get('modelName', 'gpt-4'),
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            "temperature": api_config.get('temperature', 0.3),
            "max_tokens": api_config.get('max_tokens') or api_config.get('maxTokens', 16384),
            "stream": False
        }
        
        # 发送请求
        response = requests.post(
            api_url, 
            headers=headers, 
            json=payload, 
            verify=api_config.get('verify_ssl', True),
            timeout=api_config.get('timeout', 30)
        )
        response.raise_for_status()
        
        # 解析响应
        response_data = response.json()
        if 'choices' in response_data and len(response_data['choices']) > 0:
            result = response_data['choices'][0]['message']['content']
        else:
            result = response_data.get('content', str(response_data))
        
        # 返回处理后的数据
        processed_item = data_item.copy()
        processed_item[result_field_name] = result
        return processed_item, None
        
    except Exception as e:
        # 返回错误信息
        processed_item = data_item.copy()
        processed_item[result_field_name] = f"错误: {str(e)}"
        return processed_item, str(e)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001, use_reloader=False) 