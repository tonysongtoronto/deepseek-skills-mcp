require('dotenv').config();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 1. 初始化服务器
const server = new Server(
  { name: 'deepseek-skills-server', version: '1.3.1' },
  { capabilities: { tools: {} } }
);

// 2. 声明所有工具（已移除 github_search_repos）
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'calculate',
        description: '数学计算',
        inputSchema: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression']
        }
      },
      {
        name: 'read_file',
        description: '读文件',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: '写文件',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'list_files',
        description: '列出文件',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      },
      {
        name: 'execute_command',
        description: '执行命令',
        inputSchema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command']
        }
      },
      {
        name: 'current_time',
        description: '当前时间',
        inputSchema: {
          type: 'object',
          properties: { timezone: { type: 'string' } }
        }
      },
      {
        name: 'count_words',
        description: '字数统计',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        }
      },
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
      }
    ]
  };
});

// 3. 处理工具逻辑（已移除 github_search_repos 相关代码）
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    async function translateToEnglish(query) {
      const axios = require('axios');
      try {
        const response = await axios.post('http://localhost:3001/api/deepseek', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a translator. Translate the following text to English accurately.' },
            { role: 'user', content: query }
          ],
          temperature: 0.1
        });
        return response.data.choices[0].message.content.trim();
      } catch (error) {
        console.error('Translation failed:', error);
        return query; // Fallback to original
      }
    }

    switch (name) {
      case 'web_search': {
        const axios = require('axios');

        let query = args.query?.trim();
        const limit = Math.min(args.limit || 10, 20);
        let halfLimit = Math.floor(limit / 2);

        if (!query) {
          return { content: [{ type: 'text', text: "搜索失败：查询词不能为空" }], isError: true };
        }

        const braveKey = process.env.BRAVE_SUBSCRIPTION_TOKEN;
        if (!braveKey) {
          return {
            content: [{ type: 'text', text: "搜索失败：缺少 BRAVE_SUBSCRIPTION_TOKEN 环境变量" }],
            isError: true
          };
        }

        const hasChinese = /[\u4e00-\u9fff]/.test(query);
        let queries = [query];
        if (hasChinese) {
          const englishQuery = await translateToEnglish(query);
          queries.push(englishQuery);
        }

        let allResults = [];

        for (const q of queries) {
          const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
            params: {
              q: q,
              count: hasChinese ? halfLimit : limit,
              safesearch: 'off'
            },
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'identity',
              'X-Subscription-Token': braveKey
            },
            timeout: 12000
          });

          const data = response.data;
          const results = data.web?.results || [];
          allResults = allResults.concat(results);
        }

        const uniqueResults = [];
        const seenUrls = new Set();
        for (const item of allResults) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            uniqueResults.push(item);
          }
        }

        uniqueResults.splice(limit);

        if (uniqueResults.length === 0) {
          return {
            content: [{ type: 'text', text: "搜索完成但没有结果" }],
            isError: true
          };
        }

        const formatted = uniqueResults.map(item => ({
          title: item.title || '无标题',
          url: item.url || '#',
          description: item.description || item.snippet || '无描述',
          age: item.age || ''
        }));

        return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
      }

      case 'calculate': {
        const math = require('mathjs');
        const result = math.evaluate(args.expression);
        return { content: [{ type: 'text', text: `计算结果: ${result}` }] };
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
        const time = args.timezone
          ? new Date().toLocaleString('zh-CN', { timeZone: args.timezone })
          : new Date().toLocaleString('zh-CN');
        return { content: [{ type: 'text', text: `当前时间: ${time}` }] };
      }

      case 'count_words': {
        const text = args.text || "";
        const lines = text.split('\n').length;
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        return {
          content: [{
            type: 'text',
            text: `文本分析: ${lines}行, 总计${text.length}字符, 其中中文${chineseChars}字。`
          }]
        };
      }

      default:
        throw new Error(`工具 ${name} 不存在或未实现`);
    }
  } catch (error) {
    console.error(`工具执行错误 [${name}]:`, error);

    let msg = error.message || '未知错误';

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      msg = '网络连接问题，请检查网络或稍后重试';
    }

    return {
      content: [{ type: 'text', text: `运行错误: ${msg}` }],
      isError: true
    };
  }
});

// 4. 运行
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DeepSeek 终极技能服务器已就绪 (v1.3.1)');
}

main().catch(console.error);