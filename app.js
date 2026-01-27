// DeepSeek Skills MCP 客户端 - 升级版
// 整合了 Skills 功能，保留所有原有功能

class MCPClient {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.tools = [];
        this.conversationHistory = [];
        this.toolResults = [];
        this.currentSkill = 'general';  // 当前选择的技能
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

        // 输入框自动调整高度
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
            sendBtn.disabled = !input.value.trim();
        });

        // 发送按钮点击
        sendBtn.addEventListener('click', () => this.handleUserMessage());
        
        // Enter 发送，Shift+Enter 换行
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) this.handleUserMessage();
            }
        });

        // 示例查询按钮
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.query;
                input.dispatchEvent(new Event('input'));
                this.handleUserMessage();
            });
        });

        // 🆕 Skills 切换按钮
        document.querySelectorAll('.skill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 移除所有 active 类
                document.querySelectorAll('.skill-btn').forEach(b => {
                    b.classList.remove('active');
                });
                
                // 激活当前按钮
                e.target.classList.add('active');
                
                // 更新当前技能
                this.currentSkill = e.target.dataset.skill;
                
                // 获取技能信息
                const skillInfo = SKILLS[this.currentSkill];
                if (skillInfo) {
                    console.log(`✅ 切换技能: ${skillInfo.icon} ${skillInfo.name}`);
                    console.log(`📝 描述: ${skillInfo.description}`);
                } else {
                    console.log('✅ 切换到通用助手模式');
                }
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
            'fetch_url': '🌐',
            'query_database': '🗄️',
            'list_tables': '📋',
            'describe_table': '🔍'
        };

        // 显示前8个工具
        toolsList.innerHTML = this.tools.map(tool => `
            <div class="tool-tag" title="${tool.description}">
                ${toolIcons[tool.name] || '🔧'} ${tool.name}
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

        // 移除欢迎界面
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

        // 🆕 使用当前技能的 systemPrompt
        let baseSystemPrompt = '';
        if (this.currentSkill && SKILLS[this.currentSkill]) {
            baseSystemPrompt = SKILLS[this.currentSkill].systemPrompt;
            console.log(`🎯 使用技能: ${SKILLS[this.currentSkill].icon} ${SKILLS[this.currentSkill].name}`);
        } else {
            // 默认通用助手
            baseSystemPrompt = SKILLS['general']?.systemPrompt || `你是一个智能助手，可以调用工具来帮助用户完成任务。`;
        }

    const systemPrompt = `${baseSystemPrompt}

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

**🗄️ 数据库操作特别指导:**
- 如果遇到"字段不存在"或"表不存在"错误:
  1. 先用 list_tables 查看有哪些表
  2. 再用 describe_table 查看表的准确字段名
  3. 最后用正确的字段名重新执行 query_database

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

${toolResultsContext}

**当前日期:** ${today}

请根据用户需求，合理规划并执行任务。回复必须是有效的JSON格式。`;

        const response = await fetch(`${this.baseUrl}/api/deepseek`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...this.conversationHistory.slice(-4),
                    { 
                        role: 'user', 
                        content: `用户请求: ${userQuery}

请分析是否需要调用工具，并返回JSON格式的决策。

如果需要工具:
{
  "needsTools": true,
  "thinking": "你的思考过程",
  "toolCalls": [
    {
      "tool": "工具名",
      "params": {"参数": "值"},
      "reason": "为什么调用这个工具"
    }
  ]
}

如果不需要工具:
{
  "needsTools": false,
  "response": "你的直接回答"
}` 
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        const aiReply = data.choices[0].message.content;

        try {
            const jsonMatch = aiReply.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('无法解析 AI 响应');
        } catch (error) {
            console.error('❌ JSON 解析失败:', error);
            console.error('原始响应:', aiReply);
            return {
                needsTools: false,
                response: aiReply
            };
        }
    }

    async executeToolCalls(aiDecision) {
        console.log(`🔧 执行 ${aiDecision.toolCalls.length} 个工具调用...`);
        console.log('💭 AI 思考:', aiDecision.thinking);

        const results = [];
        const resultsContext = {};
        
        for (let i = 0; i < aiDecision.toolCalls.length; i++) {
            const toolCall = aiDecision.toolCalls[i];
            const stepLoadingId = this.addLoadingMessage(
                `🔨 步骤 ${i+1}/${aiDecision.toolCalls.length}: ${toolCall.tool} - ${toolCall.reason}`
            );

            try {
                console.log(`\n📍 步骤 ${i+1}: ${toolCall.tool}`);
                console.log(`📝 原因: ${toolCall.reason}`);
                console.log(`📦 原始参数:`, toolCall.params);

                const resolvedParams = this.resolveParams(toolCall.params, resultsContext, i);
                console.log(`✅ 解析后参数:`, resolvedParams);

                const result = await this.callTool(toolCall.tool, resolvedParams);
                
                resultsContext[`step_${i}`] = result;
                
                if (toolCall.tool === 'web_search') {
                    try {
                        const searchResults = JSON.parse(result);
                        searchResults.forEach((r, idx) => {
                            resultsContext[`search_result_${idx}`] = r.url;
                        });
                        console.log('🔗 搜索结果URL已保存:', Object.keys(resultsContext).filter(k => k.startsWith('search_result_')));
                    } catch (e) {
                        console.warn('⚠️ 无法解析搜索结果');
                    }
                }

                this.removeLoadingMessage(stepLoadingId);
                results.push({
                    step: i + 1,
                    tool: toolCall.tool,
                    reason: toolCall.reason,
                    result: result,
                    failed: false
                });

                this.toolResults.push({
                    tool: toolCall.tool,
                    result: result
                });

                console.log(`✅ 步骤 ${i+1} 完成`);

            } catch (error) {
                console.error(`❌ 步骤 ${i+1} 失败:`, error.message);
                this.removeLoadingMessage(stepLoadingId);
                
                results.push({
                    step: i + 1,
                    tool: toolCall.tool,
                    reason: toolCall.reason,
                    result: null,
                    error: error.message,
                    failed: true
                });
            }
        }

        await this.summarizeResults(aiDecision, results);
    }

    resolveParams(params, resultsContext, currentStepIndex) {
        const resolved = {};

        for (const [key, value] of Object.entries(params)) {
            if (typeof value !== 'string') {
                resolved[key] = value;
                continue;
            }

            let resolvedValue = value;
            const hasMatch = /\{\{.*?\}\}/.test(value);

            if (hasMatch) {
                console.log(`  [参数解析] 处理参数 "${key}": "${value}"`);
            }

            resolvedValue = value.replace(/\{\{(.*?)\}\}/g, (match, ref) => {
                const refTrimmed = ref.trim();

                if (refTrimmed.startsWith('search_result_')) {
                    if (resultsContext[refTrimmed]) {
                        console.log(`  [参数解析] ✅ ${match} => ${resultsContext[refTrimmed]}`);
                        return resultsContext[refTrimmed];
                    }
                }

                if (refTrimmed.startsWith('step_')) {
                    if (resultsContext[refTrimmed]) {
                        console.log(`  [参数解析] ✅ ${match} => step 结果`);
                        return resultsContext[refTrimmed];
                    }
                }

                if (refTrimmed === 'PREVIOUS') {
                    const previousKey = `step_${currentStepIndex - 1}`;
                    if (resultsContext[previousKey]) {
                        console.log(`  [参数解析] ✅ {{PREVIOUS}} => step_${currentStepIndex - 1}`);
                        return resultsContext[previousKey];
                    }
                }

                const stepMatch = refTrimmed.match(/^step_(\d+)$/);
                if (stepMatch) {
                    const idx = stepMatch[1];
                    const key = `step_${idx}`;
                    if (resultsContext[key]) {
                        console.log(`  [参数解析] ✅ ${match} => step_${idx}`);
                        return resultsContext[key];
                    }
                }

                for (const [ctxKey, ctxValue] of Object.entries(resultsContext)) {
                    if (ctxKey.includes(refTrimmed) || refTrimmed.includes(ctxKey)) {
                        console.log(`  [参数解析] ⚠️ 模糊匹配 ${match} => ${ctxKey}`);
                        return ctxValue;
                    }
                }

                console.warn(`  [参数解析] ❌ 未能解析 ${match}, 保留原值`);
                return match;
            });

            if (hasMatch) {
                console.log(`  [参数解析] 最终值: "${resolvedValue}"`);
            }

            resolved[key] = resolvedValue;
        }

        return resolved;
    }

    async summarizeResults(aiDecision, results) {
        const summaryLoadingId = this.addLoadingMessage('✨ AI 正在总结结果...');

        try {
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

        const avatar = role === 'user' ? '👤' : '🤖';

        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">${formattedContent}</div>
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
            <div class="message-avatar">🤖</div>
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
    // 检查 SKILLS 是否加载
    if (typeof SKILLS === 'undefined') {
        console.error('❌ Skills 配置未加载！请确保 skills-config.js 已正确引入。');
    } else {
        console.log('✅ Skills 配置已加载，共', Object.keys(SKILLS).length, '个技能');
    }
    
    window.mcpClient = new MCPClient();
});