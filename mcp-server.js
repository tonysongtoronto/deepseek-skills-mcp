require('dotenv').config();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 1. 初始化服务器
const server = new Server(
  { name: 'deepseek-skills-server', version: '1.3.0' },
  { capabilities: { tools: {} } }
);

// 2. 声明所有工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: 'calculate', description: '数学计算', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
      { name: 'read_file', description: '读文件', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'write_file', description: '写文件', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'list_files', description: '列出文件', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'execute_command', description: '执行命令', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
      { name: 'current_time', description: '当前时间', inputSchema: { type: 'object', properties: { timezone: { type: 'string' } } } },
      { name: 'count_words', description: '字数统计', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
      {
        name: 'web_search',
        description: '全能联网搜索（自动切换引擎）',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '关键词' },
            limit: { type: 'number', description: '结果数' }
          },
          required: ['query']
        }
      },
    ],
  };
});

// 3. 处理工具逻辑
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'web_search': {
        const axios = require('axios');

        const query = args.query?.trim();
        const limit = Math.min(args.limit || 10, 20);  // Brave 建议单次别超 20

        if (!query) {
          console.error('[Brave追踪] 错误: query 参数为空');
          return { content: [{ type: 'text', text: "搜索失败：查询词不能为空" }], isError: true };
        }

        console.error(`[Brave追踪] 开始搜索: "${query}" | 目标条数: ${limit}`);

        const braveKey = process.env.BRAVE_SUBSCRIPTION_TOKEN;
           console.error('======================');
            console.error(braveKey);
            console.error('======================');
        if (!braveKey) {
          console.error('[Brave追踪] CRITICAL: BRAVE_SUBSCRIPTION_TOKEN 环境变量未设置或为空');
          return {
            content: [{ type: 'text', text: "搜索失败：缺少 BRAVE_SUBSCRIPTION_TOKEN 环境变量。请在服务器启动前设置 export BRAVE_SUBSCRIPTION_TOKEN='bs_xxx...'" }],
            isError: true
          };
        }

        console.error(`[Brave追踪] Token 前4位预览: ${braveKey.substring(0, 4)}... (长度:${braveKey.length})`);

        try {
          console.error(`[Brave追踪] 准备发送请求 → https://api.search.brave.com/res/v1/web/search`);
          console.error(`[Brave追踪] 请求参数: q=${query}, count=${limit}, search_lang=zh, safesearch=strict`);

          const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
            params: {
              q: query,
              count: limit,
              //search_lang: 'zh',          // 优先中文结果，可改成 'en' 或移除
              safesearch: 'off',       // 可改为 'moderate' 或 'off'
              //freshness: 'py',         // 可选：过去一周结果，取消注释启用
            },
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'identity',
              'X-Subscription-Token': braveKey
            },
            timeout: 12000,               // 12秒超时，Brave 有时稍慢
          });

          console.error(`[Brave追踪] 请求成功 - HTTP 状态码: ${response.status}`);
          console.error(`[Brave追踪] 响应头关键信息: content-length=${response.headers['content-length'] || '未知'}, date=${response.headers.date || '未知'}`);

          const data = response.data;

          // 打印响应结构关键信息，便于调试
          console.error(`[Brave追踪] 响应类型: ${data.type || '未知'}`);
          console.error(`[Brave追踪] web.results 存在? ${!!data.web?.results}`);
          if (data.web?.results) {
            console.error(`[Brave追踪] 实际返回条数: ${data.web.results.length}`);
            console.error(`[Brave追踪] 第一条标题预览: ${data.web.results[0]?.title?.substring(0, 60) || '无'}...`);
          } else {
            console.error('[Brave追踪] web.results 为空或不存在');
            if (data.query) {
              console.error(`[Brave追踪] query 元信息: ${JSON.stringify(data.query, null, 2).substring(0, 200)}...`);
            }
          }

          if (data.web?.results?.length > 0) {
            // 格式化输出，保持兼容性
            const formatted = data.web.results.map(item => ({
              title: item.title || '无标题',
              url: item.url || '#',
              description: item.description || item.snippet || '无描述',
              age: item.age || ''
            }));

            let extra = '';
            if (data.query?.answer_box?.answer) {
              extra = `\n\n[Brave AI 快速回答]: ${data.query.answer_box.answer}`;
            }

            const outputText = JSON.stringify(formatted.slice(0, limit), null, 2) + extra;
            console.error(`[Brave追踪] 返回成功 - 最终输出长度约 ${outputText.length} 字符`);

            return { content: [{ type: 'text', text: outputText }] };
          } else {
            console.error('[Brave追踪] 成功响应，但 web.results 为空');
            return {
              content: [{ type: 'text', text: `搜索完成但无结果（Brave 返回了 0 条有效网页）。可能原因：查询太新/太偏门/地区限制，或 Brave 索引未覆盖。建议稍后重试或换个表述。` }],
              isError: true
            };
          }

        } catch (e) {
          const errMsg = e.message || '未知错误';
          console.error(`[Brave追踪] 请求失败: ${errMsg}`);

          if (e.response) {
            const status = e.response.status;
            console.error(`[Brave追踪] HTTP 错误码: ${status}`);
            console.error(`[Brave追踪] 错误响应预览: ${JSON.stringify(e.response.data || {}, null, 2).substring(0, 300)}...`);

            let userMsg = `搜索失败（HTTP ${status}）`;

            if (status === 401 || status === 403 || status === 422) {
              userMsg += " - Token 无效或已过期。请检查 BRAVE_SUBSCRIPTION_TOKEN 是否正确、是否针对 Web Search 端点生成、在 dashboard 重新生成/确认。";
            } else if (status === 429) {
              userMsg += " - 超出配额（429 Too Many Requests）。免费 tier 每月 2000 次，已用完或速率过高。请等待重置或查看 https://api-dashboard.search.brave.com/app/ 用量。";
            } else if (status === 400) {
              userMsg += " - 请求参数错误。请检查 query 是否合法。";
            } else {
              userMsg += ` - 服务器端问题：${errMsg}`;
            }

            return { content: [{ type: 'text', text: userMsg }], isError: true };
          } else {
            // 网络超时等非 HTTP 错误
            console.error(`[Brave追踪] 非 HTTP 错误: ${e.code || '未知'} - ${errMsg}`);
            return {
              content: [{ type: 'text', text: `搜索失败：网络问题或超时（${errMsg}）。请检查服务器网络、Brave API 是否可达，或稍后重试。` }],
              isError: true
            };
          }
        }
      }

      case 'calculate': {
        const math = require('mathjs');
        return { content: [{ type: 'text', text: `计算结果: ${math.evaluate(args.expression)}` }] };
      }

      case 'read_file': {
        const fs = require('fs').promises;
        const content = await fs.readFile(args.path, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      }

      case 'write_file': {
        const fs = require('fs').promises;
        await fs.writeFile(args.path, args.content, 'utf-8');
        return { content: [{ type: 'text', text: `已成功保存到: ${args.path}` }] };
      }

      case 'list_files': {
        const fs = require('fs').promises;
        const files = await fs.readdir(args.path);
        return { content: [{ type: 'text', text: `目录列表: ${files.join(', ')}` }] };
      }

      case 'execute_command': {
        const { execSync } = require('child_process');
        const output = execSync(args.command, { encoding: 'utf-8', timeout: 5000 });
        return { content: [{ type: 'text', text: output }] };
      }

      case 'current_time': {
        const time = args.timezone ? new Date().toLocaleString('zh-CN', { timeZone: args.timezone }) : new Date().toLocaleString('zh-CN');
        return { content: [{ type: 'text', text: `当前时间: ${time}` }] };
      }

      case 'count_words': {
        const text = args.text || "";
        const lines = text.split('\n').length;
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        return { content: [{ type: 'text', text: `文本分析: ${lines}行, 总计${text.length}字符, 其中中文${chineseChars}字。` }] };
      }

      default:
        throw new Error(`工具 ${name} 尚未定义`);
    }
  } catch (error) {
    return { content: [{ type: 'text', text: `运行错误: ${error.message}` }], isError: true };
  }
});

// 4. 运行
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DeepSeek 终极技能服务器已就绪 (混合动力版)');
}
main().catch(console.error);