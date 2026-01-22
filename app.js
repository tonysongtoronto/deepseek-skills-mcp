// MCP 客户端类
class MCPClient {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.tools = [];
        this.deepseekApiKey = this.getDeepSeekApiKey();
        this.conversationHistory = [];
        this.init();
    }

    /**
     * 安全获取 DeepSeek API 密钥
     * 优先从环境变量读取，如果未设置则使用硬编码密钥（仅限开发环境）
     * 在生产环境中，应该通过后端代理来保护 API 密钥
     */
    getDeepSeekApiKey() {
        // 尝试从环境变量读取
        if (typeof process !== 'undefined' && process.env && process.env.DEEPSEEK_API_KEY) {
            return process.env.DEEPSEEK_API_KEY;
        }
        
        // 尝试从全局变量读取（适用于浏览器环境）
        if (typeof window !== 'undefined' && window.DEEPSEEK_API_KEY) {
            return window.DEEPSEEK_API_KEY;
        }
        
        // 开发环境回退（仅用于本地开发）
        // 注意：在生产环境中，这仍然不安全，应该使用后端代理
        console.warn('⚠️ 未找到环境变量 DEEPSEEK_API_KEY，使用开发密钥（仅限本地开发）');
        console.warn('⚠️ 生产环境请设置环境变量或使用后端代理保护 API 密钥');
        return 'sk-';
    }

    async init() {
        this.bindEvents();
        await this.checkConnection();
        await this.loadTools();
    }

    bindEvents() {
        const input = document.getElementById('userInput');
        const sendBtn = document.getElementById('sendBtn');

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
            sendBtn.disabled = !input.value.trim();
        });

        sendBtn.addEventListener('click', () => this.handleUserMessage());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) this.handleUserMessage();
            }
        });

        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.query;
                input.dispatchEvent(new Event('input'));
                this.handleUserMessage();
            });
        });
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tools`);
            if (response.ok) {
                this.updateStatus(true, '已连接');
            } else {
                this.updateStatus(false, '连接失败');
            }
        } catch (error) {
            this.updateStatus(false, '无法连接');
            console.error('连接检查失败:', error);
        }
    }

    updateStatus(connected, text) {
        const dot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        if (connected) {
            dot.classList.add('connected');
        } else {
            dot.classList.remove('connected');
        }
        statusText.textContent = text;
    }

    async loadTools() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tools`);
            const data = await response.json();
            
            if (data.result && data.result.tools) {
                this.tools = data.result.tools;
                this.displayTools();
            }
        } catch (error) {
            console.error('加载工具失败:', error);
        }
    }

    displayTools() {
        const toolsList = document.getElementById('toolsList');
        const toolCount = document.getElementById('toolCount');
        
        toolCount.textContent = this.tools.length;
        
        const toolIcons = {
            'calculate': '🔢',
            'read_file': '📄',
            'write_file': '✍️',
            'list_files': '📁',
            'execute_command': '⚙️',
            'current_time': '🕐',
            'web_search_mock': '🔍',
            'count_words': '📊'
        };

        toolsList.innerHTML = this.tools.map(tool => `
            <div class="tool-card" data-tool="${tool.name}">
                <div class="tool-name">
                    <span class="icon">${toolIcons[tool.name] || '🔧'}</span>
                    ${tool.name}
                </div>
                <div class="tool-desc">${this.truncate(tool.description, 60)}</div>
            </div>
        `).join('');
    }

    truncate(text, length) {
        return text.length > length ? text.substring(0, length) + '...' : text;
    }

    async handleUserMessage() {
        const input = document.getElementById('userInput');
        const query = input.value.trim();
        
        if (!query) return;

        input.value = '';
        input.style.height = 'auto';
        document.getElementById('sendBtn').disabled = true;

        const welcome = document.querySelector('.welcome');
        if (welcome) welcome.remove();

        this.addMessage('user', query);

        const loadingId = this.addLoadingMessage('正在分析任务...');

        try {
            // 1. 检查是否是询问能力的问题
            if (this.isMetaQuery(query)) {
                this.removeLoadingMessage(loadingId);
                this.handleMetaQuery();
                return;
            }

            // 2. 使用 DeepSeek 分析查询
            const analysis = await this.analyzeWithDeepSeek(query);
            this.removeLoadingMessage(loadingId);

            console.log('📊 分析结果:', analysis);

            // 3. 判断是单步骤还是多步骤任务
            if (analysis.workflow && analysis.workflow.length > 1) {
                // 多步骤工作流
                await this.executeWorkflow(analysis);
            } else if (analysis.tool && analysis.tool !== 'none') {
                // 单步骤任务
                await this.executeSingleTool(analysis);
            } else {
                this.addMessage('assistant', analysis.response || '抱歉，我无法处理这个请求。');
            }

        } catch (error) {
            this.removeLoadingMessage(loadingId);
            this.addMessage('assistant', `❌ 出错了：${error.message}`, null, true);
            console.error('处理消息失败:', error);
        }
    }

    async executeSingleTool(analysis) {
        this.addMessage('assistant', 
            `🔧 我将使用 **${analysis.tool}** 工具\n\n` +
            `📝 原因: ${analysis.reason}\n` +
            `⚙️ 参数: \`${JSON.stringify(analysis.params)}\``,
            analysis
        );

        const executeLoadingId = this.addLoadingMessage('正在执行...');
        try {
            const result = await this.callTool(analysis.tool, analysis.params);
            this.removeLoadingMessage(executeLoadingId);
            this.addMessage('assistant', `✅ 执行结果：\n\n${result}`, null, true);
        } catch (error) {
            this.removeLoadingMessage(executeLoadingId);
            throw error;
        }
    }

    async executeWorkflow(analysis) {
        this.addMessage('assistant', 
            `🔄 检测到多步骤任务，需要执行 ${analysis.workflow.length} 个步骤：\n\n` +
            analysis.workflow.map((step, i) => 
                `${i + 1}. **${step.tool}** - ${step.reason}`
            ).join('\n')
        );

        let previousResult = null;

        for (let i = 0; i < analysis.workflow.length; i++) {
            const step = analysis.workflow[i];
            const stepNum = i + 1;

            this.addMessage('assistant', 
                `📍 **步骤 ${stepNum}/${analysis.workflow.length}**: ${step.tool}\n` +
                `⚙️ 参数: \`${JSON.stringify(step.params)}\``
            );

            const loadingId = this.addLoadingMessage(`执行步骤 ${stepNum}...`);

            try {
                // 如果参数需要上一步的结果，进行替换
                let params = step.params;
                if (previousResult && step.usesPreviousResult) {
                    params = this.injectPreviousResult(params, previousResult);
                }

                const result = await this.callTool(step.tool, params);
                this.removeLoadingMessage(loadingId);

                // 保存结果供下一步使用
                previousResult = result;

                // 显示中间结果（如果不是最后一步）
                if (i < analysis.workflow.length - 1) {
                    const preview = result.length > 200 
                        ? result.substring(0, 200) + '...' 
                        : result;
                    this.addMessage('assistant', 
                        `✅ 步骤 ${stepNum} 完成\n\n${preview}`,
                        null, 
                        false
                    );
                } else {
                    // 最后一步显示完整结果
                    this.addMessage('assistant', 
                        `🎉 **任务完成！**\n\n${result}`,
                        null,
                        true
                    );
                }

            } catch (error) {
                this.removeLoadingMessage(loadingId);
                throw new Error(`步骤 ${stepNum} 失败: ${error.message}`);
            }
        }
    }

    injectPreviousResult(params, previousResult) {
        const newParams = { ...params };
        for (const key in newParams) {
            if (typeof newParams[key] === 'string' && 
                newParams[key].includes('[PREVIOUS_RESULT]')) {
                newParams[key] = previousResult;
            }
        }
        return newParams;
    }

    isMetaQuery(query) {
        const patterns = [
            /你(有|能做)(什么|哪些)(工具|功能|能力)/i,
            /工具列表/i,
            /可用工具/i,
            /支持.*工具/i,
            /能力列表/i
        ];
        return patterns.some(p => p.test(query));
    }

    handleMetaQuery() {
        const toolList = this.tools.map(t => 
            `• **${t.name}**: ${t.description}`
        ).join('\n\n');

        this.addMessage('assistant', 
            `我有以下 ${this.tools.length} 个工具可以使用：\n\n${toolList}\n\n` +
            `💡 你可以用自然语言告诉我要做什么，我会自动选择合适的工具来帮你！`
        );
    }

    async analyzeWithDeepSeek(query) {
        try {
            const toolsDesc = this.tools.map(t => 
                `- ${t.name}: ${t.description}`
            ).join('\n');

            const systemPrompt = `你是一个精确的任务分析和工具调度专家。分析用户请求，规划执行步骤。

可用工具：
${toolsDesc}

**重要规则**：

1. **多步骤任务识别**（优先级最高）：
   - "读取XX文件并统计字数" → 需要2步：read_file → count_words
   - "读取XX文件然后..." → 识别为多步骤
   - "...并且..." "...然后..." → 识别为多步骤

2. **工具选择规则**：
   - calculate: 数学计算（包含数字、运算符）
   - read_file: 读取文件内容（明确文件路径）
   - count_words: 统计文本（必须先有文本内容）
   - list_files: 列出目录（要求"列出""查看目录"等）
   - write_file: 写入文件
   - current_time: 查询时间
   - execute_command: 执行命令
   - web_search_mock: 搜索信息

3. **输出格式**：

单步骤任务：
\`\`\`json
{
  "type": "single",
  "tool": "工具名",
  "params": {参数},
  "reason": "选择原因"
}
\`\`\`

多步骤任务：
\`\`\`json
{
  "type": "workflow",
  "workflow": [
    {
      "tool": "read_file",
      "params": {"path": "demo.txt"},
      "reason": "先读取文件内容",
      "usesPreviousResult": false
    },
    {
      "tool": "count_words",
      "params": {"text": "[PREVIOUS_RESULT]"},
      "reason": "统计读取到的文本",
      "usesPreviousResult": true
    }
  ]
}
\`\`\`

**示例**：
输入："读取demo.txt文件并统计字数"
输出：多步骤工作流（read_file → count_words）

输入："计算2+2"
输出：单步骤（calculate）`;

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.deepseekApiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: query }
                    ],
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                throw new Error(`DeepSeek API 错误: ${response.status}`);
            }

            const data = await response.json();
            let content = data.choices[0].message.content;

            content = content.replace(/```json\s*|\s*```/g, '');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : content);

            console.log('🤖 DeepSeek原始分析:', analysis);

            // 标准化输出格式
            if (analysis.type === 'workflow' && analysis.workflow) {
                return analysis;
            } else {
                return {
                    tool: analysis.tool,
                    params: analysis.params,
                    reason: analysis.reason
                };
            }

        } catch (error) {
            console.error('❌ DeepSeek 分析失败:', error);
            return this.fallbackAnalysis(query);
        }
    }

    fallbackAnalysis(query) {
        const q = query.toLowerCase();

        // 检测多步骤任务
        if ((q.includes('读') || q.includes('读取')) && 
            (q.includes('统计') || q.includes('字数') || q.includes('行数'))) {
            const pathMatch = query.match(/[\w\.\/\-]+\.txt/i) || ['demo.txt'];
            return {
                type: 'workflow',
                workflow: [
                    {
                        tool: 'read_file',
                        params: { path: `./${pathMatch[0]}` },
                        reason: '读取文件内容',
                        usesPreviousResult: false
                    },
                    {
                        tool: 'count_words',
                        params: { text: '[PREVIOUS_RESULT]' },
                        reason: '统计文本字数和行数',
                        usesPreviousResult: true
                    }
                ]
            };
        }

        // 单步骤任务
        if (q.includes('计算') || /\d+[\+\-\*\/]/.test(q)) {
            const expr = query.match(/[\d\+\-\*\/\(\)\.\s]+/)?.[0] || '2+2';
            return {
                tool: 'calculate',
                params: { expression: expr.trim() },
                reason: '检测到数学表达式'
            };
        }

        if (q.includes('读') && q.includes('文件')) {
            const path = query.match(/[\w\.\/\-]+\.\w+/)?.[0] || './demo.txt';
            return {
                tool: 'read_file',
                params: { path },
                reason: '检测到文件读取请求'
            };
        }

        if (q.includes('列出') || (q.includes('查看') && q.includes('目录'))) {
            return {
                tool: 'list_files',
                params: { path: '.' },
                reason: '检测到目录列表请求'
            };
        }

        if (q.includes('时间')) {
            return {
                tool: 'current_time',
                params: { timezone: '' },
                reason: '检测到时间查询'
            };
        }

        return {
            tool: 'web_search_mock',
            params: { query },
            reason: '默认使用搜索'
        };
    }

    async callTool(toolName, params) {
        try {
            const response = await fetch(`${this.baseUrl}/api/tools`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: { name: toolName, arguments: params }
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message);
            }

            return data.result.content[0].text;

        } catch (error) {
            throw new Error(`工具调用失败: ${error.message}`);
        }
    }

    addMessage(role, content, metadata = null, isResult = false) {
        const chatArea = document.getElementById('chatArea');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        let formattedContent = content;
        formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');
        formattedContent = formattedContent.replace(/\n/g, '<br>');

        if (isResult && content.length > 100) {
            formattedContent = `<pre>${this.escapeHtml(content)}</pre>`;
        }

        messageDiv.innerHTML = `
            <div class="message-content">
                ${formattedContent}
                ${metadata && metadata.reason ? `
                    <div class="tool-selection">
                        <strong>🔧 工具分析</strong><br>
                        ${metadata.reason}
                    </div>
                ` : ''}
            </div>
            <div class="message-meta">${new Date().toLocaleTimeString()}</div>
        `;

        chatArea.appendChild(messageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;

        return messageDiv;
    }

    addLoadingMessage(text = '正在思考...') {
        const chatArea = document.getElementById('chatArea');
        const loadingDiv = document.createElement('div');
        const id = 'loading-' + Date.now();
        loadingDiv.id = id;
        loadingDiv.className = 'message assistant';
        loadingDiv.innerHTML = `
            <div class="message-content loading-message">
                ${text}
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatArea.appendChild(loadingDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
        return id;
    }

    removeLoadingMessage(id) {
        const loading = document.getElementById(id);
        if (loading) loading.remove();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.mcpClient = new MCPClient();
});
