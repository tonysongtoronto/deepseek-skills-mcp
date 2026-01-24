// MCP 客户端类 - 安全版本(API密钥在服务器端)
class MCPClient {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.tools = [];
        this.conversationHistory = [];
        this.toolResults = [];
        this.init();
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
            'write_file': '✏️',
            'list_files': '📁',
            'execute_command': '⚙️',
            'current_time': '🕐',
            'web_search': '🔍',
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
        
        this.conversationHistory.push({
            role: 'user',
            content: query
        });

        const thinkingId = this.addLoadingMessage('🤔 AI 正在思考...');

        try {
            const aiDecision = await this.askAIForDecision(query);
            this.removeLoadingMessage(thinkingId);

            console.log('🤖 AI 决策:', aiDecision);

            if (aiDecision.needsTools && aiDecision.toolCalls && aiDecision.toolCalls.length > 0) {
                await this.executeToolCalls(aiDecision);
            } else {
                this.addMessage('assistant', aiDecision.response);
                this.conversationHistory.push({
                    role: 'assistant',
                    content: aiDecision.response
                });
            }

        } catch (error) {
            this.removeLoadingMessage(thinkingId);
            this.addMessage('assistant', `❌ 出错了: ${error.message}`, null, true);
            console.error('处理消息失败:', error);
        }
    }

    async askAIForDecision(userQuery) {
        const toolsDescription = this.tools.map(t => 
            `- **${t.name}**: ${t.description}\n  参数: ${JSON.stringify(t.inputSchema.properties)}`
        ).join('\n\n');

        const toolResultsContext = this.toolResults.length > 0 
            ? `\n\n最近的工具执行结果:\n${this.toolResults.slice(-3).map(r => 
                `- ${r.tool}: ${r.result.substring(0, 200)}...`
              ).join('\n')}` 
            : '';

        // 当前日期（用于提示模型判断“昨天”是哪一天）
        const today = new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        const systemPrompt = `你是一个智能助手,可以调用工具来帮助用户完成任务。

**可用工具列表:**
${toolsDescription}

**你的职责:**
1. 理解用户需求
2. 判断是否需要调用工具
3. 如果需要,规划工具调用方案(可以是单个或多个工具)
4. 如果不需要,直接用自然语言回复用户

**重要规则:**
- 对于需要多步骤的任务(如"读取文件并统计字数"),必须规划多个工具调用
- 工具调用要有明确的顺序和依赖关系
- 参数值使用 "{{PREVIOUS}}" 表示需要使用上一步的结果
- 也可以用 "{{step_0}}" 引用第0步的结果,或 "{{read_file}}" 引用该工具的结果
- 如果用户只是闲聊或询问能力,不需要调用工具,直接回复即可

**实时数据/金融/股市类强制规则（非常重要）:**
- 任何涉及“股价”、“收盘价”、“开盘价”、“指数”、“道琼斯”、“Dow”、“标普500”、“S&P 500”、“纳斯达克”、“Nasdaq”、“美股”、“纽约股市”、“港股”、“A股”、“比特币”、“加密货币”、“汇率”、“外汇”、“黄金价格”、“原油价格”、“期货”等关键词的查询，**一律优先且必须先尝试使用 web_search 工具**，不要直接回复“无法查询”或“数据接口受限”。
- 搜索关键词要写得专业、具体、带时间，例如：
  - "Dow Jones closing price yesterday"
  - "S&P 500 close [昨天日期]"
  - "Nasdaq Composite closing value [日期]"
  - "美股三大指数 [昨天日期] 收盘"
  - site:finance.yahoo.com OR site:cnbc.com OR site:marketwatch.com "Dow Jones" close [日期]
- 可以一次调用多个 web_search（不同关键词组合）来交叉验证数据准确性。
- 优先使用英文查询 + 知名财经站点限制（如 site:finance.yahoo.com、site:cnbc.com、site:investing.com、site:marketwatch.com），因为数据更可靠。
- **绝对不要**在第一次就声称“无法直接查询”或建议用户自己去网站查，而要先调用工具获取信息。
- 如果 web_search 结果相互矛盾或明显不足，再在最终总结时说明“数据来源于多家财经媒体，建议以 Yahoo Finance / CNBC 为准”。
- 当前日期是 ${today}，查询“昨天”时要计算为前一天。

**GitHub 相关强制规则（必须严格遵守）：**
- github_search_repos 工具**已被完全禁用**，**永远不要**尝试调用它。
- 任何涉及 GitHub、仓库、star 数、trending、热门项目等查询，**一律且只能使用 web_search 工具**。
- 搜索示例："github [关键词] stars" "most starred [语言] repository on github" site:github.com [关键词] "github trending [日期]"
- 如果用户要求 JSON 格式的 star 排序列表或 API 数据，直接回复：“当前系统已禁用 GitHub API 工具，无法提供精确的 JSON 数据，以下是网页搜索到的最新信息：”
- 不要出现任何与 GitHub API 限额相关的内容。

**输出格式(JSON):**

不需要工具时:
{
  "needsTools": false,
  "response": "你的回复内容"
}

需要单个工具时:
{
  "needsTools": true,
  "thinking": "我的思考过程",
  "toolCalls": [
    {
      "tool": "工具名",
      "params": {"参数": "值"},
      "reason": "为什么使用这个工具"
    }
  ]
}

需要多个工具时:
{
  "needsTools": true,
  "thinking": "我的思考过程",
  "toolCalls": [
    {
      "tool": "read_file",
      "params": {"path": "demo.txt"},
      "reason": "先读取文件内容"
    },
    {
      "tool": "count_words",
      "params": {"text": "{{PREVIOUS}}"},
      "reason": "对读取的内容进行字数统计"
    }
  ]
}

${toolResultsContext}`;

        try {
            const response = await fetch(`${this.baseUrl}/api/deepseek`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...this.conversationHistory.slice(-6),
                        { role: 'user', content: userQuery }
                    ],
                    temperature: 0.5,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            let content = data.choices[0].message.content;

            content = content.replace(/```json\s*|\s*```/g, '');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const decision = JSON.parse(jsonMatch ? jsonMatch[0] : content);

            return decision;

        } catch (error) {
            console.error('❌ AI 决策失败:', error);
            throw new Error(`AI 服务调用失败: ${error.message}`);
        }
    }

    async executeToolCalls(aiDecision) {
        const toolCalls = aiDecision.toolCalls;

        if (aiDecision.thinking) {
            this.addMessage('assistant', `💭 **AI 分析:** ${aiDecision.thinking}`);
        }

        if (toolCalls.length > 1) {
            const planText = `📋 **执行计划**(共 ${toolCalls.length} 步):\n\n` +
                toolCalls.map((call, i) => 
                    `${i + 1}. **${call.tool}** - ${call.reason}`
                ).join('\n');
            this.addMessage('assistant', planText);
        } else {
            this.addMessage('assistant', 
                `🔧 **准备执行:** ${toolCalls[0].tool}\n📝 ${toolCalls[0].reason}`
            );
        }

        const resultsContext = {};
        const allResults = [];

        for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const stepNum = i + 1;

            const executingId = this.addLoadingMessage(
                `⚙️ 执行步骤 ${stepNum}/${toolCalls.length}: ${call.tool}...`
            );

            try {
                const params = this.resolveParams(call.params, resultsContext, i);

                const result = await this.callTool(call.tool, params);
                this.removeLoadingMessage(executingId);

                resultsContext[`step_${i}`] = result;
                resultsContext[call.tool] = result;
                
                allResults.push({ 
                    tool: call.tool, 
                    result, 
                    params,
                    stepIndex: i 
                });
                
                this.toolResults.push({ tool: call.tool, result });
                if (this.toolResults.length > 10) {
                    this.toolResults.shift();
                }

                const preview = result.length > 300 
                    ? result.substring(0, 300) + '...' 
                    : result;
                
                this.addMessage('assistant', 
                    `✅ **步骤 ${stepNum} 完成**\n\n` +
                    `\`\`\`\n${preview}\n\`\`\``,
                    null,
                    false
                );

            } catch (error) {
                this.removeLoadingMessage(executingId);
                this.addMessage('assistant', 
                    `❌ 步骤 ${stepNum} 失败: ${error.message}`,
                    null,
                    true
                );
                return;
            }
        }

        await this.summarizeResults(aiDecision, allResults);
    }

    resolveParams(params, resultsContext, currentStepIndex) {
        if (!params || typeof params !== 'object') {
            return params;
        }

        const resolved = {};
        
        for (const [key, value] of Object.entries(params)) {
            resolved[key] = this.resolveValue(value, resultsContext, currentStepIndex);
        }
        
        return resolved;
    }

    resolveValue(value, resultsContext, currentStepIndex) {
        if (typeof value !== 'string') {
            return value;
        }

        if (value.includes('{{PREVIOUS}}')) {
            const previousKey = `step_${currentStepIndex - 1}`;
            if (resultsContext[previousKey] !== undefined) {
                return value.replace(/\{\{PREVIOUS\}\}/g, String(resultsContext[previousKey]));
            }
        }

        const stepRefPattern = /\{\{step_(\d+)\}\}/g;
        value = value.replace(stepRefPattern, (match, stepIndex) => {
            const key = `step_${stepIndex}`;
            return resultsContext[key] !== undefined ? String(resultsContext[key]) : match;
        });

        const toolRefPattern = /\{\{(\w+)\}\}/g;
        value = value.replace(toolRefPattern, (match, toolName) => {
            return resultsContext[toolName] !== undefined ? String(resultsContext[toolName]) : match;
        });

        return value;
    }

    async summarizeResults(aiDecision, results) {
        const summaryLoadingId = this.addLoadingMessage('✨ AI 正在总结结果...');

        try {
            const resultsText = results.map(r => 
                `**${r.tool}**: ${r.result.substring(0, 500)}`
            ).join('\n\n');

            const summaryPrompt = `用户的原始请求已经通过工具执行完成。

**执行的工具和结果:**
${resultsText}

请用自然、友好的语言向用户总结执行结果。要求:
1. 突出关键信息
2. 使用用户容易理解的语言
3. 如果有具体数据,要清晰呈现
4. 简洁但完整

直接输出总结内容,不要包含任何格式标记。`;

            const response = await fetch(`${this.baseUrl}/api/deepseek`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        ...this.conversationHistory.slice(-4),
                        { role: 'user', content: summaryPrompt }
                    ],
                    temperature: 0.7
                })
            });

            const data = await response.json();
            const summary = data.choices[0].message.content;

            this.removeLoadingMessage(summaryLoadingId);
            
            this.addMessage('assistant', `🎉 **任务完成!**\n\n${summary}`, null, true);
            
            this.conversationHistory.push({
                role: 'assistant',
                content: summary
            });

        } catch (error) {
            this.removeLoadingMessage(summaryLoadingId);
            console.error('AI 总结失败:', error);
            this.addMessage('assistant', 
                `✅ **任务完成!**\n\n最终结果:\n\n${results[results.length - 1].result}`,
                null,
                true
            );
        }
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
        formattedContent = formattedContent.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
        formattedContent = formattedContent.replace(/\n/g, '<br>');

        messageDiv.innerHTML = `
            <div class="message-content">
                ${formattedContent}
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