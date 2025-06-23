// 全局变量
let currentView = 'projectListView';
let currentProject = null;
let projects = [];
let fileData = null;
let variables = [];
let promptEditor = null;
let isProcessing = false;
let shouldCancel = false;
let promptTemplates = [];

// DOM元素
const views = {
    projectListView: document.getElementById('projectListView'),
    projectDetailView: document.getElementById('projectDetailView'),
    projectEditView: document.getElementById('projectEditView'),
    processingView: document.getElementById('processingView')
};

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    initializeMonacoEditor();
    loadProjects();
    loadPromptTemplates();
});

// 初始化应用
function initializeApp() {
    require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' } });
}

// 设置事件监听器
function setupEventListeners() {
    // 文件上传
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (uploadArea) {
        setupDragAndDrop();
    }
    
    // 测试提示词
    const testPromptBtn = document.getElementById('testPromptBtn');
    if (testPromptBtn) {
        testPromptBtn.addEventListener('click', testPrompt);
    }
    
    // 执行控制
    const startBtn = document.getElementById('startBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    
    if (startBtn) {
        startBtn.addEventListener('click', startProcessing);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelProcessing);
    }
}

// 初始化Monaco编辑器
function initializeMonacoEditor() {
    require(['vs/editor/editor.main'], function() {
        const editorContainer = document.getElementById('promptEditor');
        if (editorContainer) {
            promptEditor = monaco.editor.create(editorContainer, {
                value: '请根据以下信息生成回复：\n\n用户输入：{{user_input}}\n\n请提供有帮助的回答。',
                language: 'markdown',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineNumbers: 'on',
                roundedSelection: false,
                scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible'
                }
            });
        }
    });
}

// 视图管理
function showView(viewName) {
    // 隐藏所有视图
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.remove('active');
        }
    });
    
    // 显示指定视图
    if (views[viewName]) {
        views[viewName].classList.add('active');
        currentView = viewName;
    }
}

// 加载项目列表
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (response.ok) {
            projects = await response.json();
            renderProjects();
        } else {
            showError('加载项目列表失败');
        }
    } catch (error) {
        showError(`加载项目列表失败: ${error.message}`);
    }
}

// 渲染项目列表
function renderProjects() {
    const projectsList = document.getElementById('projectsList');
    if (!projectsList) return;
    
    if (projects.length === 0) {
        projectsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <h3>还没有项目</h3>
                <p>创建您的第一个项目开始使用</p>
                <button class="btn btn-primary" onclick="showCreateProject()">创建项目</button>
            </div>
        `;
        return;
    }
    
    projectsList.innerHTML = projects.map(project => `
        <div class="project-card" onclick="openProject('${project.id}')">
            <div class="project-card-header">
                <div>
                    <div class="project-card-title">${project.name}</div>
                    <div class="project-card-description">${project.description || '暂无描述'}</div>
                </div>
            </div>
            <div class="project-card-meta">
                <span>创建时间: ${formatDate(project.created_at)}</span>
                <span>更新时间: ${formatDate(project.updated_at)}</span>
            </div>
            <div class="project-card-actions">
                <button class="btn btn-secondary" onclick="event.stopPropagation(); editProject('${project.id}')">编辑</button>
                <button class="btn btn-danger" onclick="event.stopPropagation(); deleteProject('${project.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

// 显示创建项目
function showCreateProject() {
    currentProject = null;
    showView('projectEditView');
    document.getElementById('editProjectName').value = '';
    document.getElementById('editProjectDescription').value = '';
    document.getElementById('editApiUrl').value = '';
    document.getElementById('editModelName').value = '';
    document.getElementById('editApiKey').value = '';
    document.getElementById('editTemperature').value = '0.7';
    document.getElementById('editMaxTokens').value = '1000';
    document.getElementById('editTimeout').value = '30';
    document.getElementById('editRateLimit').value = '5';
    if (promptEditor) promptEditor.setValue('');
}

// 打开项目
async function openProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (response.ok) {
            currentProject = await response.json();
            showProjectDetail();
        } else {
            showError('加载项目失败');
        }
    } catch (error) {
        showError(`加载项目失败: ${error.message}`);
    }
}

// 显示项目详情
async function showProjectDetail() {
    if (!currentProject) return;
    
    showView('projectDetailView');
    
    // 更新项目名称
    document.getElementById('projectName').textContent = currentProject.name;
    
    // 显示项目配置
    renderProjectConfig();
    
    // 加载处理历史
    await loadProcessingHistory();
}

// 渲染项目配置
function renderProjectConfig() {
    const configDisplay = document.getElementById('projectConfig');
    if (!configDisplay || !currentProject) return;
    
    const apiConfig = currentProject.api_config || {};
    
    configDisplay.innerHTML = `
        <div class="config-item">
            <span class="config-label">项目名称</span>
            <span class="config-value">${currentProject.name}</span>
        </div>
        <div class="config-item">
            <span class="config-label">项目描述</span>
            <span class="config-value">${currentProject.description || '暂无描述'}</span>
        </div>
        <div class="config-item">
            <span class="config-label">API地址</span>
            <span class="config-value">${apiConfig.api_url || '未配置'}</span>
        </div>
        <div class="config-item">
            <span class="config-label">模型名称</span>
            <span class="config-value">${apiConfig.modelName || '未配置'}</span>
        </div>
        <div class="config-item">
            <span class="config-label">温度</span>
            <span class="config-value">${apiConfig.temperature || '0.7'}</span>
        </div>
        <div class="config-item">
            <span class="config-label">最大生成长度</span>
            <span class="config-value">${apiConfig.max_tokens || '1000'}</span>
        </div>
        <div class="config-item">
            <span class="config-label">超时时间</span>
            <span class="config-value">${apiConfig.timeout || '30'}秒</span>
        </div>
        <div class="config-item">
            <span class="config-label">频率限制</span>
            <span class="config-value">${apiConfig.rate_limit || '5'}次/秒</span>
        </div>
    `;
}

// 加载处理历史
async function loadProcessingHistory() {
    if (!currentProject) return;
    
    try {
        const response = await fetch(`/api/processing-records?project_id=${currentProject.id}`);
        if (response.ok) {
            const records = await response.json();
            renderProcessingHistory(records);
        }
    } catch (error) {
        console.error('加载处理历史失败:', error);
    }
}

// 渲染处理历史
function renderProcessingHistory(records) {
    const historyList = document.getElementById('processingHistory');
    if (!historyList) return;
    
    if (records.length === 0) {
        historyList.innerHTML = '<p>暂无处理记录</p>';
        return;
    }
    
    historyList.innerHTML = records.map(record => `
        <div class="history-item">
            <div class="history-info">
                <div class="history-file">${record.file_name}</div>
                <div class="history-stats">
                    总行数: ${record.total_lines} | 
                    成功: ${record.success_count} | 
                    失败: ${record.error_count} | 
                    时间: ${formatDate(record.created_at)}
                </div>
            </div>
            <div class="history-status ${record.status}">${getStatusText(record.status)}</div>
        </div>
    `).join('');
}

// 编辑项目
function editProject(projectId = null) {
    if (projectId) {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            currentProject = project;
        }
    }
    if (!currentProject) return;
    showView('projectEditView');
    document.getElementById('editProjectName').value = currentProject.name;
    document.getElementById('editProjectDescription').value = currentProject.description || '';
    const apiConfig = currentProject.api_config || {};
    document.getElementById('editApiUrl').value = apiConfig.api_url || '';
    document.getElementById('editModelName').value = apiConfig.modelName || '';
    document.getElementById('editApiKey').value = apiConfig.apiKey || '';
    document.getElementById('editTemperature').value = apiConfig.temperature || '0.7';
    document.getElementById('editMaxTokens').value = apiConfig.max_tokens || '1000';
    document.getElementById('editTimeout').value = apiConfig.timeout || '30';
    document.getElementById('editRateLimit').value = apiConfig.rate_limit || '5';
    if (promptEditor) promptEditor.setValue(currentProject.prompt_template || '');
}

// 保存项目
async function saveProject() {
    const projectData = {
        name: document.getElementById('editProjectName').value,
        description: document.getElementById('editProjectDescription').value,
        api_config: {
            api_url: document.getElementById('editApiUrl').value,
            modelName: document.getElementById('editModelName').value,
            apiKey: document.getElementById('editApiKey').value,
            temperature: parseFloat(document.getElementById('editTemperature').value),
            max_tokens: parseInt(document.getElementById('editMaxTokens').value),
            timeout: parseInt(document.getElementById('editTimeout').value),
            rate_limit: parseInt(document.getElementById('editRateLimit').value)
        },
        prompt_template: promptEditor ? promptEditor.getValue() : ''
    };
    
    try {
        let response;
        if (currentProject) {
            // 更新项目
            response = await fetch(`/api/projects/${currentProject.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });
        } else {
            // 创建项目
            response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });
        }
        
        if (response.ok) {
            if (!currentProject) {
                currentProject = await response.json();
            }
            await loadProjects();
            showProjectDetail();
        } else {
            showError('保存项目失败');
        }
    } catch (error) {
        showError(`保存项目失败: ${error.message}`);
    }
}

// 删除项目
function deleteProject(projectId = null) {
    const targetId = projectId || (currentProject ? currentProject.id : null);
    if (!targetId) return;
    
    showModal('确认删除', '确定要删除这个项目吗？此操作不可恢复。', async () => {
        try {
            const response = await fetch(`/api/projects/${targetId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                if (currentProject && currentProject.id === targetId) {
                    currentProject = null;
                }
                await loadProjects();
                showView('projectListView');
            } else {
                showError('删除项目失败');
            }
        } catch (error) {
            showError(`删除项目失败: ${error.message}`);
        }
    });
}

// 显示项目列表
function showProjectList() {
    showView('projectListView');
    currentProject = null;
}

// 开始快速处理
function startQuickProcess() {
    if (!currentProject) return;
    showView('processingView');
}

// 文件上传处理
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

// 设置拖拽上传
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    });
}

// 处理文件
async function processFile(file) {
    try {
        if (!file.name.endsWith('.jsonl') && !file.name.endsWith('.json')) {
            showError('请上传JSONL或JSON文件');
            return;
        }
        
        const text = await readFileAsText(file);
        const lines = text.split('\n').filter(line => line.trim());
        
        const parsedData = [];
        for (let i = 0; i < lines.length; i++) {
            try {
                const json = JSON.parse(lines[i]);
                parsedData.push(json);
            } catch (error) {
                showError(`第${i + 1}行JSON格式错误: ${error.message}`);
                return;
            }
        }
        
        if (parsedData.length === 0) {
            showError('文件中没有有效的JSON数据');
            return;
        }
        
        // 创建一个新的File对象，包含原始内容
        const originalText = text;
        const newFile = new File([originalText], file.name, { type: file.type });
        
        fileData = {
            file: newFile,
            data: parsedData,
            originalText: text
        };
        
        variables = extractVariables(parsedData[0]);
        showFilePreview(file, parsedData);
        updateVariableLists();
        
        log('info', `成功加载文件: ${file.name} (${parsedData.length} 行数据)`);
        
    } catch (error) {
        showError(`文件处理失败: ${error.message}`);
    }
}

// 读取文件为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

// 提取变量
function extractVariables(obj) {
    const vars = [];
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            vars.push(key);
        }
    }
    return vars;
}

// 显示文件预览
function showFilePreview(file, data) {
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const lineCount = document.getElementById('lineCount');
    const firstLinePreview = document.getElementById('firstLinePreview');
    const filePreview = document.getElementById('filePreview');
    
    if (fileName) fileName.textContent = `文件名: ${file.name}`;
    if (fileSize) fileSize.textContent = `大小: ${formatFileSize(file.size)}`;
    if (lineCount) lineCount.textContent = `行数: ${data.length}`;
    if (firstLinePreview) firstLinePreview.textContent = JSON.stringify(data[0], null, 2);
    if (filePreview) filePreview.style.display = 'block';
}

// 更新变量列表
function updateVariableLists() {
    const variableTags = variables.map(varName => 
        `<span class="variable-tag" onclick="insertVariable('{{${varName}}}')">{{${varName}}}</span>`
    ).join('');
    
    const variableList = document.getElementById('variableList');
    const variableList2 = document.getElementById('variableList2');
    
    if (variableList) variableList.innerHTML = variableTags;
    if (variableList2) variableList2.innerHTML = variableTags;
}

// 插入变量到编辑器
function insertVariable(variable) {
    if (promptEditor) {
        const selection = promptEditor.getSelection();
        const range = new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn
        );
        promptEditor.executeEdits('', [{
            range: range,
            text: variable
        }]);
        promptEditor.focus();
    }
}

// 测试提示词
async function testPrompt() {
    if (!fileData || !promptEditor || !currentProject) {
        showError('请先上传文件并编写提示词');
        return;
    }
    
    const prompt = promptEditor.getValue();
    if (!prompt.trim()) {
        showError('请输入提示词');
        return;
    }
    
    if (!fileData.data || fileData.data.length === 0) {
        showError('文件中没有可用的数据');
        return;
    }
    
    try {
        log('info', '正在测试提示词...');
        
        // 使用第一条数据进行测试
        const testData = fileData.data[0];
        log('info', `使用第一条数据进行测试: ${JSON.stringify(testData)}`);
        
        // 调用后端测试API
        const response = await fetch('/api/test-prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_id: currentProject.id,
                prompt_template: prompt,
                test_data: testData
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            document.getElementById('apiResponse').textContent = result.response;
            document.getElementById('testResult').style.display = 'block';
            log('success', '提示词测试成功');
        } else {
            document.getElementById('apiResponse').textContent = `错误: ${result.error || 'API调用失败'}`;
            document.getElementById('testResult').style.display = 'block';
            log('error', `提示词测试失败: ${result.error || 'API调用失败'}`);
        }
        
    } catch (error) {
        document.getElementById('apiResponse').textContent = `错误: ${error.message}`;
        document.getElementById('testResult').style.display = 'block';
        log('error', `提示词测试失败: ${error.message}`);
    }
}

// 开始处理
async function startProcessing() {
    if (!fileData || !promptEditor || !currentProject) {
        showError('请先上传文件并编写提示词');
        return;
    }
    
    isProcessing = true;
    shouldCancel = false;
    
    const startBtn = document.getElementById('startBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressContainer = document.querySelector('.progress-container');
    
    if (startBtn) startBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (progressContainer) progressContainer.style.display = 'block';
    
    const totalLines = fileData.data.length;
    let successCount = 0;
    let errorCount = 0;
    
    const logOutput = document.getElementById('logOutput');
    if (logOutput) logOutput.innerHTML = '';
    
    log('info', `开始处理 ${totalLines} 行数据...`);
    
    try {
        // 准备表单数据
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('prompt_template', promptEditor.getValue());
        formData.append('result_field_name', document.getElementById('resultFieldName').value || 'response');
        formData.append('max_workers', document.getElementById('maxWorkers').value || '10');
        
        // 发送到服务器处理
        const response = await fetch(`/api/projects/${currentProject.id}/process`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            successCount = result.success_count;
            errorCount = result.error_count;
            
            log('success', `处理完成！成功: ${successCount}, 失败: ${errorCount}`);
            
            // 下载结果
            downloadResults(result.processed_data);
            
        } else {
            const error = await response.json();
            throw new Error(error.error || '处理失败');
        }
        
    } catch (error) {
        log('error', `处理过程中发生错误: ${error.message}`);
    } finally {
        isProcessing = false;
        if (startBtn) startBtn.style.display = 'inline-flex';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
}

// 取消处理
function cancelProcessing() {
    shouldCancel = true;
    log('info', '正在取消处理...');
}

// 下载结果
function downloadResults(processedData) {
    if (!processedData || !fileData) {
        showError('没有可下载的数据');
        return;
    }
    
    try {
        const jsonlContent = processedData.map(item => JSON.stringify(item)).join('\n');
        const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_${fileData.file.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        log('success', '结果文件下载成功');
        
    } catch (error) {
        showError(`下载失败: ${error.message}`);
    }
}

// 更新进度
function updateProgress(current, total, success, error) {
    const percentage = (current / total) * 100;
    
    const progressText = document.getElementById('progressText');
    const progressCount = document.getElementById('progressCount');
    const progressFill = document.getElementById('progressFill');
    const successCount = document.getElementById('successCount');
    const errorCount = document.getElementById('errorCount');
    const remainingCount = document.getElementById('remainingCount');
    
    if (progressText) progressText.textContent = '处理中...';
    if (progressCount) progressCount.textContent = `${current} / ${total}`;
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (successCount) successCount.textContent = success;
    if (errorCount) errorCount.textContent = error;
    if (remainingCount) remainingCount.textContent = total - current;
}

// 日志记录
function log(type, message) {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    logOutput.appendChild(logEntry);
    logOutput.scrollTop = logOutput.scrollHeight;
}

// 显示模态框
function showModal(title, message, onConfirm) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    
    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.textContent = message;
    if (modal) modal.style.display = 'flex';
    
    if (modalConfirmBtn && onConfirm) {
        modalConfirmBtn.onclick = () => {
            closeModal();
            onConfirm();
        };
    }
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
}

// 显示错误
function showError(message) {
    showModal('错误', message, null);
}

// 切换密码显示
function toggleEditPassword() {
    const input = document.getElementById('editApiKey');
    const button = document.querySelector('.toggle-password');
    
    if (input && button) {
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
        } else {
            input.type = 'password';
            button.textContent = '👁️';
        }
    }
}

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function getStatusText(status) {
    const statusMap = {
        'completed': '已完成',
        'processing': '处理中',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

// 全局函数
window.showCreateProject = showCreateProject;
window.openProject = openProject;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.showProjectList = showProjectList;
window.startQuickProcess = startQuickProcess;
window.saveProject = saveProject;
window.closeModal = closeModal;
window.toggleEditPassword = toggleEditPassword;
window.insertVariable = insertVariable;

// 折叠/展开内容
function toggleCollapse(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (el.style.display === 'none' || el.classList.contains('collapsed')) {
        el.style.display = '';
        el.classList.remove('collapsed');
    } else {
        el.style.display = 'none';
        el.classList.add('collapsed');
    }
}

// 一键复制内容
function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.textContent || el.innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showModal('复制成功', '内容已复制到剪贴板');
        }, () => {
            showModal('复制失败', '无法复制内容');
        });
    } else {
        // 兼容旧浏览器
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showModal('复制成功', '内容已复制到剪贴板');
        } catch (err) {
            showModal('复制失败', '无法复制内容');
        }
        document.body.removeChild(textarea);
    }
}

// 新增：加载预设模板
async function loadPromptTemplates() {
    try {
        const response = await fetch('/static/prompt_templates.json');
        if (response.ok) {
            promptTemplates = await response.json();
            renderPromptTemplateSelector();
        }
    } catch (e) {
        // 忽略
    }
}

function renderPromptTemplateSelector() {
    const container = document.getElementById('promptTemplateSelector');
    if (!container) return;
    let html = '<select id="templateSelect"><option value="">选择预设模板</option>';
    promptTemplates.forEach(t => {
        html += `<option value="${t.id}">${t.name}</option>`;
    });
    html += '</select>';
    container.innerHTML = html;
    document.getElementById('templateSelect').onchange = function() {
        const id = this.value;
        const tpl = promptTemplates.find(t => t.id == id);
        if (tpl && promptEditor) {
            promptEditor.setValue(tpl.content);
        }
    };
} 