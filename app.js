// MCP 客户端类 - 安全版本(API密钥在服务器端) - 增强调试版
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
            'count_words': '📊',
            'fetch_url': '🌐'
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
- 对于需要多步骤的任务,必须规划多个工具调用
- 工具调用要有明确的顺序和依赖关系
- 如果用户只是闲聊或询问能力,不需要调用工具,直接回复即可

**🚨 web_search 速率限制 - 非常重要!**
- web_search 工具有严格的速率限制: **每分钟最多4次,每月2000次**
- **务必优化搜索策略,减少搜索次数!**
- 推荐策略:
  1. 单个主题: 只用1次 web_search,limit设为5-10
  2. 多个主题: 每个主题1次搜索,避免重复
  3. 搜索后用 fetch_url 获取详情(无限制)

**参数引用规则:**
- 引用搜索结果URL: "{{search_result_0}}", "{{search_result_1}}" 等
- 引用上一步结果: "{{PREVIOUS}}"
- 引用特定步骤: "{{step_0}}", "{{step_1}}" 等

**正确示例:**
{
  "needsTools": true,
  "thinking": "搜索React性能优化,然后获取前3个结果的详细内容",
  "toolCalls": [
    {
      "tool": "web_search",
      "params": {"query": "React performance optimization 2026", "limit": 5},
      "reason": "搜索React性能优化文章"
    },
    {
      "tool": "fetch_url",
      "params": {"url": "{{search_result_0}}"},
      "reason": "获取第1篇文章详情"
    },
    {
      "tool": "fetch_url",
      "params": {"url": "{{search_result_1}}"},
      "reason": "获取第2篇文章详情"
    },
    {
      "tool": "fetch_url",
      "params": {"url": "{{search_result_2}}"},
      "reason": "获取第3篇文章详情"
    }
  ]
}

**输出格式(JSON):**
不需要工具时:
{
  "needsTools": false,
  "response": "你的回复内容"
}

需要工具时:
{
  "needsTools": true,
  "thinking": "我的思考过程",
  "toolCalls": [工具调用数组]
}

当前日期: ${today}

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

            // ✅ 在 try 外部声明 params
            let params;

            try {
                console.log(`\n${'='.repeat(70)}`);
                console.log(`[步骤 ${i}] 工具: ${call.tool}`);
                console.log(`[步骤 ${i}] 原始参数:`, JSON.stringify(call.params, null, 2));
                console.log(`[步骤 ${i}] 当前 allResults 数量: ${allResults.length}`);
                
                if (allResults.length > 0) {
                    console.log(`[步骤 ${i}] allResults 内容:`);
                    allResults.forEach((r, idx) => {
                        console.log(`  [${idx}] tool=${r.tool}, resultLength=${r.result.length}`);
                        if (r.tool === 'web_search') {
                            console.log(`  [${idx}] web_search 结果预览:`, r.result.substring(0, 200));
                        }
                    });
                }

                // ✅ 赋值 params
                params = this.resolveParams(call.params, resultsContext, i, allResults);

                console.log(`[步骤 ${i}] 解析后参数:`, JSON.stringify(params, null, 2));
                console.log(`${'='.repeat(70)}\n`);

                const result = await this.callTool(call.tool, params);
                this.removeLoadingMessage(executingId);

                console.log(`✅ [步骤 ${i}] 工具 ${call.tool} 返回成功, 结果长度: ${result.length}`);
                console.log(`   结果预览: ${result.substring(0, 150)}...`);

                // ✅ 检查 web_search 结果是否为空
                if (call.tool === 'web_search') {
                    try {
                        const searchResults = JSON.parse(result);
                        if (!Array.isArray(searchResults) || searchResults.length === 0) {
                            console.error(`❌ web_search 返回空结果，终止执行`);
                            this.removeLoadingMessage(executingId);
                            this.addMessage('assistant', 
                                `⚠️ **搜索未找到结果**\n\n请尝试更换关键词或稍后重试。`,
                                null,
                                true
                            );
                            return;
                        }
                    } catch (e) {
                        console.error(`❌ web_search 结果解析失败:`, e);
                        this.removeLoadingMessage(executingId);
                        this.addMessage('assistant', 
                            `❌ **搜索结果格式错误**\n\n${e.message}`,
                            null,
                            true
                        );
                        return;
                    }
                }

                resultsContext[`step_${i}`] = result;
                resultsContext[call.tool] = result;
                
                const resultEntry = { 
                    tool: call.tool, 
                    result, 
                    params,
                    stepIndex: i,
                    failed: false
                };
                
                allResults.push(resultEntry);
                
                console.log(`✅ [步骤 ${i}] 完成并已添加到 allResults`);
                console.log(`   allResults 当前长度: ${allResults.length}`);
                
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
                
                let errorDetails = error.message;
                if (error.stack) {
                    console.error('完整错误堆栈:', error.stack);
                }
                
                // ✅ 现在 params 可以正常使用了
                allResults.push({ 
                    tool: call.tool, 
                    result: '', 
                    params: params || call.params, // 如果 resolveParams 失败，用原始参数
                    stepIndex: i,
                    failed: true,
                    error: errorDetails
                });
                
                console.error(`❌ [步骤 ${i}] 失败: ${call.tool}, 错误: ${errorDetails}`);
                console.error(`⚠️  allResults 已更新 (包含失败记录), 当前长度: ${allResults.length}`);
                
                this.addMessage('assistant', 
                    `❌ 步骤 ${stepNum} 失败\n\n` +
                    `**工具:** ${call.tool}\n` +
                    `**错误:** ${errorDetails}\n\n` +
                    `**参数:** \`${JSON.stringify(params || call.params)}\``,
                    null,
                    true
                );
                
                // 如果是搜索步骤失败，后续依赖搜索结果的步骤都会失败，应该直接停止
                if (call.tool === 'web_search') {
                    console.error(`❌ web_search 失败，终止执行`);
                    this.addMessage('assistant', 
                        `⚠️ **搜索失败，无法继续执行后续步骤**\n\n请稍后重试或更换搜索关键词。`,
                        null,
                        true
                    );
                    return;
                }
                
                console.warn(`步骤 ${stepNum} 失败，继续执行...`);
                continue;
            }
        }

        await this.summarizeResults(aiDecision, allResults);
    }

    resolveParams(params, resultsContext, currentStepIndex, allResults) {
        if (!params || typeof params !== 'object') {
            return params;
        }

        const resolved = {};
        
        for (const [key, value] of Object.entries(params)) {
            resolved[key] = this.resolveValue(value, resultsContext, currentStepIndex, allResults);
        }
        
        return resolved;
    }

    resolveValue(value, resultsContext, currentStepIndex, allResults) {
        if (typeof value !== 'string') {
            return value;
        }

        console.log(`  [参数解析] 原始值: "${value}"`);

        // 处理 {{search_result_N}}
        const searchResultPattern = /\{\{search_result_(\d+)\}\}/g;
        let hasMatch = false;
        
        value = value.replace(searchResultPattern, (match, index) => {
            hasMatch = true;
            console.log(`  [参数解析] 检测到占位符: ${match}`);
            
            // 从后往前找最近的 web_search 结果
            for (let i = allResults.length - 1; i >= 0; i--) {
                console.log(`  [参数解析] 检查 allResults[${i}], tool=${allResults[i].tool}`);
                
                if (allResults[i].tool === 'web_search') {
                    console.log(`  [参数解析] ✓ 找到 web_search (步骤 ${i})`);
                    console.log(`  [参数解析] result 类型:`, typeof allResults[i].result);
                    console.log(`  [参数解析] result 前100字符:`, allResults[i].result.substring(0, 100));
                    
                    try {
                        const searchResults = JSON.parse(allResults[i].result);
                        console.log(`  [参数解析] JSON解析成功, 数组长度: ${searchResults.length}`);
                        
                        const idx = parseInt(index);
                        console.log(`  [参数解析] 请求索引: ${idx}`);
                        
                        if (Array.isArray(searchResults) && idx < searchResults.length && searchResults[idx]) {
                            const url = searchResults[idx].url;
                            console.log(`  [参数解析] ✅ 成功! ${match} => ${url}`);
                            return url;
                        } else {
                            console.warn(`  [参数解析] ❌ 索引 ${idx} 超出范围或无效 (数组长度: ${searchResults.length})`);
                            if (searchResults[idx]) {
                                console.warn(`  [参数解析] 元素内容:`, searchResults[idx]);
                            }
                        }
                    } catch (e) {
                        console.error(`  [参数解析] ❌ JSON解析失败:`, e.message);
                        console.error(`  [参数解析] 原始数据:`, allResults[i].result);
                    }
                    break;
                }
            }
            
            console.warn(`  [参数解析] ❌ 未能解析 ${match}, 保留原值`);
            return match;
        });

        if (hasMatch) {
            console.log(`  [参数解析] 最终值: "${value}"`);
        }

        // 处理 {{PREVIOUS}}
        if (value.includes('{{PREVIOUS}}')) {
            const previousKey = `step_${currentStepIndex - 1}`;
            if (resultsContext[previousKey] !== undefined) {
                value = value.replace(/\{\{PREVIOUS\}\}/g, String(resultsContext[previousKey]));
                console.log(`  [参数解析] {{PREVIOUS}} => step_${currentStepIndex - 1}`);
            }
        }

        // 处理 {{step_N}}
        const stepRefPattern = /\{\{step_(\d+)\}\}/g;
        value = value.replace(stepRefPattern, (match, stepIndex) => {
            const key = `step_${stepIndex}`;
            if (resultsContext[key] !== undefined) {
                console.log(`  [参数解析] ${match} => step_${stepIndex}`);
                return String(resultsContext[key]);
            }
            return match;
        });

        return value;
    }

// (前面的代码保持不变...)

async summarizeResults(aiDecision, results) {
    const summaryLoadingId = this.addLoadingMessage('✨ AI 正在总结结果...');

    try {
        // 检查是否有失败的步骤
        const failedSteps = results.filter(r => r.failed);
        const successSteps = results.filter(r => !r.failed);
        
        let contextInfo = '';
        
        if (failedSteps.length > 0) {
            contextInfo = '\n\n**执行情况说明:**\n';
            contextInfo += `- 成功: ${successSteps.length} 步\n`;
            contextInfo += `- 失败: ${failedSteps.length} 步\n\n`;
            
            failedSteps.forEach(step => {
                if (step.error && step.error.includes('403')) {
                    contextInfo += `⚠️ ${step.tool} 遇到访问限制（网站反爬保护）\n`;
                } else {
                    contextInfo += `⚠️ ${step.tool} 失败: ${step.error}\n`;
                }
            });
            
            contextInfo += '\n**请基于成功获取的信息给出回答，并说明哪些资源无法访问。**\n';
        }

        const resultsText = successSteps.map(r => 
            `**${r.tool}**: ${r.result.substring(0, 1500)}`
        ).join('\n\n');

        const summaryPrompt = `用户的原始请求已经通过工具执行。

**执行的工具和结果:**
${resultsText}

${contextInfo}

请用自然、友好的语言向用户总结执行结果。要求:
1. 突出关键信息
2. 使用用户容易理解的语言
3. 如果有具体数据,要清晰呈现
4. 如果某些资源无法访问（如 Medium 403 错误），说明原因并基于其他可用资源给出回答
5. 简洁但完整

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
        
        // 根据成功率选择不同的图标
        let statusIcon = '🎉';
        if (failedSteps.length > 0 && successSteps.length === 0) {
            statusIcon = '❌';
        } else if (failedSteps.length > 0) {
            statusIcon = '⚠️';
        }
        
        this.addMessage('assistant', `${statusIcon} **任务完成!**\n\n${summary}`, null, true);
        
        this.conversationHistory.push({
            role: 'assistant',
            content: summary
        });

    } catch (error) {
        this.removeLoadingMessage(summaryLoadingId);
        console.error('AI 总结失败:', error);
        
        // 即使 AI 总结失败，也要给用户看到结果
        const successResults = results.filter(r => !r.failed);
        if (successResults.length > 0) {
            const lastResult = successResults[successResults.length - 1];
            this.addMessage('assistant', 
                `✅ **任务完成!**\n\n最终结果:\n\n${lastResult.result.substring(0, 1000)}`,
                null,
                true
            );
        } else {
            this.addMessage('assistant', 
                `❌ **所有步骤都失败了**\n\n可能原因:\n- 网站有反爬保护\n- 网络连接问题\n- API 限制\n\n建议尝试其他搜索关键词或稍后重试。`,
                null,
                true
            );
        }
    }
}
    async callTool(toolName, params) {
        try {
            console.log(`[调用工具] ${toolName}`, params);
            
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
            console.log(`[工具响应] ${toolName}`, data);

            if (data.error) {
                const errorMsg = data.error.message || JSON.stringify(data.error);
                console.error(`[工具错误] ${toolName}:`, errorMsg);
                throw new Error(errorMsg);
            }

            if (!data.result || !data.result.content || !data.result.content[0]) {
                console.error(`[工具错误] ${toolName}: 响应格式异常`, data);
                throw new Error('工具返回了无效的响应格式');
            }

            const resultText = data.result.content[0].text;
            console.log(`[工具成功] ${toolName}: ${resultText.substring(0, 100)}...`);
            
            return resultText;

        } catch (error) {
            console.error(`[callTool 异常] ${toolName}:`, error);
            
            let errorMessage = '工具调用失败';
            
            if (error.message) {
                errorMessage += `: ${error.message}`;
            } else {
                errorMessage += ': 未知错误';
            }
            
            if (error instanceof TypeError && error.message.includes('fetch')) {
                errorMessage = '网络请求失败，请检查服务器是否正常运行';
            }
            
            throw new Error(errorMessage);
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