const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'deepseek-skills-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 定义免费工具（不需要额外 API）
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'calculate',
        description: '执行数学计算，包括基本运算、复杂表达式、科学计算和统计函数。适用于数值计算、公式求解、数据分析等场景。',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '数学表达式，例如：2+2, sqrt(16), sin(45 deg), log(100, 10), (3+4)*5/2, pi*2^2。支持常用数学函数：sin, cos, tan, sqrt, log, ln, exp, abs, round, ceil, floor, min, max, sum, mean, median, std, var。',
            },
          },
          required: ['expression'],
        },
      },
      {
        name: 'read_file',
        description: '读取本地文件内容，获取文本数据供其他工具处理。支持文本文件（txt, json, js, html, css, py, md等）。通常作为数据处理流程的第一步，为后续分析提供原始数据。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件的相对或绝对路径。例如：./demo.txt, ../data.json, /home/user/file.js。支持相对路径（相对于当前工作目录）和绝对路径。',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: '写入内容到文件，用于保存处理结果、生成报告或创建配置文件。如果文件不存在则创建，如果存在则覆盖。支持文本文件格式，自动使用UTF-8编码。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径。例如：./output.txt, ../results.json, /tmp/log.txt。可以指定相对或绝对路径。',
            },
            content: {
              type: 'string',
              description: '要写入的内容。可以是纯文本、JSON、HTML、代码等任何文本内容。',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: '列出指定目录中的所有文件和子目录，用于文件系统导航和内容查看。返回文件名列表，每行一个。支持递归和非递归模式（当前仅非递归）。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '目录路径。例如：., ./src, ../, /home/user/documents。使用"."表示当前目录，".."表示上级目录。',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'execute_command',
        description: '执行系统命令（Shell命令），用于系统操作、软件安装、进程管理等。支持Windows和Linux/macOS命令。注意：执行系统命令有安全风险，请确保命令来源可信。命令执行超时时间为5秒。',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的系统命令。例如：dir（Windows）或ls（Linux/macOS）, echo "Hello", python --version, node -v, git status, npm list。',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'current_time',
        description: '获取当前日期和时间，用于时间戳记录、定时任务或时间相关计算。支持指定时区，如果不指定时区则使用系统默认时区。返回格式化的本地时间字符串。',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: '时区（可选）。例如：Asia/Shanghai（中国标准时间）, America/New_York（美国东部时间）, Europe/London（伦敦时间）, UTC（协调世界时）。支持的时区列表：https://en.wikipedia.org/wiki/List_of_tz_database_time_zones',
            },
          },
        },
      },
      {
        name: 'web_search_mock',
        description: '模拟网络搜索功能（演示用途），用于信息查询和知识获取。返回模拟的搜索结果，用于测试和演示搜索功能。实际使用时需要接入真实搜索API（如Google Search API、Bing Search API等）。',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询关键词。例如：人工智能最新进展, Python教程, 天气预报, 新闻头条。',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'count_words',
        description: '智能统计文本中的字数、行数和字符数，特别支持中英文混合文本分析。需要先使用read_file获取文本内容。返回详细的文本统计信息，包括行数、中文字符数、英文字符数等。对于中文文本，自动识别"字数"通常指中文字符数。',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要统计的文本内容，支持中英文混合文本。可以是任意长度的文本，支持多行文本。例如：中文文章、英文文档、中英文混合内容、代码文件等。',
            },
          },
          required: ['text'],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'calculate': {
        const math = require('mathjs');
        const result = math.evaluate(args.expression);
        return {
          content: [
            {
              type: 'text',
              text: `计算结果: ${result}`,
            },
          ],
        };
      }

      case 'read_file': {
        const fs = require('fs').promises;
        const content = await fs.readFile(args.path, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      case 'write_file': {
        const fs = require('fs').promises;
        await fs.writeFile(args.path, args.content, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: `文件已写入: ${args.path}`,
            },
          ],
        };
      }

      case 'list_files': {
        const fs = require('fs').promises;
        const files = await fs.readdir(args.path);
        return {
          content: [
            {
              type: 'text',
              text: `目录内容:\n${files.join('\n')}`,
            },
          ],
        };
      }

      case 'execute_command': {
        const { execSync } = require('child_process');
        const output = execSync(args.command, { 
          encoding: 'utf-8',
          timeout: 5000 // 5 秒超时
        });
        return {
          content: [
            {
              type: 'text',
              text: output,
            },
          ],
        };
      }

      case 'current_time': {
        const now = new Date();
        const timeString = args.timezone 
          ? now.toLocaleString('zh-CN', { timeZone: args.timezone })
          : now.toLocaleString('zh-CN');
        return {
          content: [
            {
              type: 'text',
              text: `当前时间: ${timeString}`,
            },
          ],
        };
      }

      case 'web_search_mock': {
        // 模拟搜索结果（用于演示）
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: args.query,
                note: '这是模拟结果，实际使用需要接入真实搜索 API',
                results: [
                  {
                    title: `关于 "${args.query}" 的结果 1`,
                    snippet: '这是搜索结果摘要...',
                    url: 'https://example.com/1',
                  },
                  {
                    title: `关于 "${args.query}" 的结果 2`,
                    snippet: '另一个相关结果...',
                    url: 'https://example.com/2',
                  },
                ],
              }, null, 2),
            },
          ],
        };
      }

      case 'count_words': {
        const text = args.text;
        
        // 行数统计
        const lines = text.split('\n').length;
        
        // 字符数统计
        const totalChars = text.length;
        const charsWithoutSpaces = text.replace(/\s/g, '').length;
        
        // 单词数统计（按空格分隔，适用于英文）
        const words = text.split(/\s+/).filter(w => w.length > 0).length;
        
        // 中文字符统计
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const chinesePunctuation = (text.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).length;
        const totalChineseChars = chineseChars + chinesePunctuation;
        
        // 非中文字符统计（英文、数字、符号等）
        const nonChineseChars = totalChars - totalChineseChars - (text.match(/\s/g) || []).length;
        
        // 构建统计结果
        let result = `文本统计结果:\n`;
        result += `====================\n`;
        result += `行数: ${lines}\n`;
        result += `单词数（按空格分隔）: ${words}\n`;
        result += `总字符数（包括空格和换行）: ${totalChars}\n`;
        result += `字符数（不包括空格）: ${charsWithoutSpaces}\n`;
        result += `====================\n`;
        result += `中文字符统计:\n`;
        result += `  中文字符数: ${chineseChars}\n`;
        result += `  中文标点数: ${chinesePunctuation}\n`;
        result += `  总中文字符（包括标点）: ${totalChineseChars}\n`;
        result += `非中文字符数（英文、数字、符号等）: ${nonChineseChars}\n`;
        result += `====================\n`;
        result += `说明:\n`;
        result += `1. "字数"通常指中文字符数，这里为: ${totalChineseChars}\n`;
        result += `2. "行数"指文本行数: ${lines}\n`;
        result += `3. 对于中文文本，"单词数"可能不适用，仅供参考\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DeepSeek Skills MCP 服务器已启动');
}

main().catch(console.error);
