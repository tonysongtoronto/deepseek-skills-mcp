require('dotenv').config();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// 速率限制器
class RateLimiter {
  constructor(max, window) { 
    this.max = max; 
    this.window = window; 
    this.reqs = []; 
  }
  
  async waitIfNeeded() {
    const now = Date.now();
    this.reqs = this.reqs.filter(t => now - t < this.window);
    if (this.reqs.length >= this.max) {
      const waitTime = this.window - (now - this.reqs[0]) + 1000;
      console.error(`⏳ 速率限制：等待 ${waitTime}ms`);
      await new Promise(r => setTimeout(r, waitTime));
    }
    this.reqs.push(Date.now());
  }
}

const searchLimiter = new RateLimiter(5, 60000);

// 创建 MCP 服务器
const server = new Server(
  { 
    name: 'mcp-server-v1.4.9', 
    version: '1.4.9' 
  }, 
  { 
    capabilities: { 
      tools: {} 
    } 
  }
);

console.error('✅ MCP 服务器初始化完成');

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('📋 收到 tools/list 请求');
  
  const tools = [
    { 
      name: 'web_search', 
      description: '网络搜索 (Brave Search API)', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          query: { type: 'string', description: '搜索关键词' }, 
          limit: { type: 'number', description: '结果数量 (默认5)' } 
        }, 
        required: ['query'] 
      } 
    },
    { 
      name: 'fetch_url', 
      description: '抓取网页内容', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          url: { type: 'string', description: '网页 URL' } 
        }, 
        required: ['url'] 
      } 
    },
    { 
      name: 'calculate', 
      description: '数学计算 (支持复杂表达式)', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          expression: { type: 'string', description: '数学表达式' } 
        }, 
        required: ['expression'] 
      } 
    },
    { 
      name: 'read_file', 
      description: '读取文件内容', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          path: { type: 'string', description: '文件路径' } 
        }, 
        required: ['path'] 
      } 
    },
    { 
      name: 'write_file', 
      description: '写入文件', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          path: { type: 'string', description: '文件路径' }, 
          content: { type: 'string', description: '文件内容' } 
        }, 
        required: ['path', 'content'] 
      } 
    },
    { 
      name: 'list_files', 
      description: '列出目录内容', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          path: { type: 'string', description: '目录路径' } 
        }, 
        required: ['path'] 
      } 
    },
    { 
      name: 'execute_command', 
      description: '执行系统命令', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          command: { type: 'string', description: '命令' } 
        }, 
        required: ['command'] 
      } 
    },
    { 
      name: 'current_time', 
      description: '获取当前时间', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          timezone: { type: 'string', description: '时区 (可选)' } 
        } 
      } 
    },
    { 
      name: 'count_words', 
      description: '文本统计分析', 
      inputSchema: { 
        type: 'object', 
        properties: { 
          text: { type: 'string', description: '文本内容' } 
        }, 
        required: ['text'] 
      } 
    }
  ];

  console.error(`✅ 返回 ${tools.length} 个工具`);
  
  return { tools };
});

// 实现工具调用
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  
  console.error(`🔧 调用工具: ${name}`);
  console.error(`📦 参数:`, JSON.stringify(args).substring(0, 200));
  
  const axios = require('axios');
  const cheerio = require('cheerio');
  const fs = require('fs').promises;

  try {
    switch (name) {
      case 'web_search': {
        await searchLimiter.waitIfNeeded();
        
        const token = process.env.BRAVE_SUBSCRIPTION_TOKEN?.trim();
        if (!token || token === 'your_brave_api_key_here') {
          throw new Error('请在 .env 文件中配置 BRAVE_SUBSCRIPTION_TOKEN');
        }
        
        console.error(`🔍 搜索: "${args.query}"`);
        
        const sRes = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          params: { 
            q: args.query, 
            count: args.limit || 5 
          },
          headers: { 
            'X-Subscription-Token': token,
            'Accept': 'application/json' 
          },
          timeout: 10000
        });
        
        const results = (sRes.data.web?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.description
        }));
        
        console.error(`✅ 搜索成功，返回 ${results.length} 个结果`);
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(results, null, 2) 
          }] 
        };
      }

      case 'fetch_url': {
        console.error(`🌐 抓取: ${args.url}`);
        
        // 检测 Medium 文章，尝试多种方式
        if (args.url.includes('medium.com')) {
          console.error('📰 检测到 Medium 文章，尝试特殊处理...');
          
          // 方式 1: 尝试 Scribe (Medium 的开源前端)
          try {
            const scribeUrl = args.url.replace('medium.com', 'scribe.rip');
            console.error(`🔄 尝试 Scribe 镜像: ${scribeUrl}`);
            
            const scribeRes = await axios.get(scribeUrl, {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
                'Accept': 'text/html'
              },
              timeout: 15000,
              validateStatus: (status) => status < 500
            });
            
            if (scribeRes.status === 200) {
              const $ = cheerio.load(scribeRes.data);
              $('script, style, nav, footer, header, .sidebar').remove();
              
              let content = $('article, main, .article-content').text() || $('body').text();
              content = content.replace(/\s+/g, ' ').trim().substring(0, 8000);
              
              if (content.length > 200) {
                console.error(`✅ 通过 Scribe 获取成功，长度: ${content.length}`);
                return { 
                  content: [{ 
                    type: 'text', 
                    text: content
                  }] 
                };
              }
            }
          } catch (scribeError) {
            console.error(`⚠️ Scribe 失败: ${scribeError.message}`);
          }
          
          // 方式 2: 尝试 Freedium
          try {
            const freediumUrl = `https://freedium.cfd/${args.url}`;
            console.error(`🔄 尝试 Freedium: ${freediumUrl}`);
            
            const freediumRes = await axios.get(freediumUrl, {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0'
              },
              timeout: 15000,
              validateStatus: (status) => status < 500
            });
            
            if (freediumRes.status === 200) {
              const $ = cheerio.load(freediumRes.data);
              $('script, style, nav, footer, header').remove();
              
              let content = $('article, main, #content').text() || $('body').text();
              content = content.replace(/\s+/g, ' ').trim().substring(0, 8000);
              
              if (content.length > 200) {
                console.error(`✅ 通过 Freedium 获取成功，长度: ${content.length}`);
                return { 
                  content: [{ 
                    type: 'text', 
                    text: content
                  }] 
                };
              }
            }
          } catch (freediumError) {
            console.error(`⚠️ Freedium 失败: ${freediumError.message}`);
          }
          
          // 如果所有 Medium 特殊方式都失败，抛出友好错误
          console.error(`❌ Medium 文章无法访问，所有方式均已尝试`);
          throw new Error(`Medium 文章受保护无法访问。建议：搜索该主题的其他资源或直接访问原文`);
        }
        
        // 常规网站抓取
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
        ];
        
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const fRes = await axios.get(args.url, {
          headers: { 
            'User-Agent': randomUA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.google.com/'
          },
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500
        });
        
        if (fRes.status === 403) {
          throw new Error(`网站拒绝访问 (403)。建议：跳过此链接，使用其他资源`);
        }
        
        if (fRes.status === 429) {
          throw new Error(`请求过于频繁 (429)。建议：稍后重试`);
        }
        
        if (fRes.status >= 400) {
          throw new Error(`HTTP ${fRes.status} 错误`);
        }
        
        const $ = cheerio.load(fRes.data);
        $('script, style, nav, footer, iframe, header, aside, .ad, .advertisement, .comments').remove();
        
        let body = '';
        const contentSelectors = [
          'article',
          'main',
          '[role="main"]',
          '.article-content',
          '.post-content',
          '.entry-content',
          '.content-body',
          '#content',
          '.content'
        ];
        
        for (const selector of contentSelectors) {
          const element = $(selector);
          if (element.length && element.text().trim().length > 100) {
            body = element.text();
            console.error(`✅ 使用选择器: ${selector}`);
            break;
          }
        }
        
        if (!body) {
          body = $('body').text();
          console.error(`⚠️ 回退到 body`);
        }
        
        body = body
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim()
          .substring(0, 8000);
        
        if (body.length < 100) {
          throw new Error(`内容太短 (${body.length} 字符)，可能是空页面`);
        }
        
        console.error(`✅ 抓取成功，内容长度: ${body.length}`);
        
        return { 
          content: [{ 
            type: 'text', 
            text: body 
          }] 
        };
      }

      case 'calculate': {
        const result = require('mathjs').evaluate(args.expression);
        console.error(`✅ 计算结果: ${result}`);
        return { 
          content: [{ 
            type: 'text', 
            text: String(result) 
          }] 
        };
      }

      case 'read_file': {
        const content = await fs.readFile(args.path, 'utf-8');
        console.error(`✅ 读取文件成功: ${args.path}`);
        return { 
          content: [{ 
            type: 'text', 
            text: content 
          }] 
        };
      }

      case 'write_file': {
        await fs.writeFile(args.path, args.content);
        console.error(`✅ 写入文件成功: ${args.path}`);
        return { 
          content: [{ 
            type: 'text', 
            text: '文件写入成功' 
          }] 
        };
      }

      case 'list_files': {
        const files = await fs.readdir(args.path);
        console.error(`✅ 列出目录成功: ${files.length} 个文件`);
        return { 
          content: [{ 
            type: 'text', 
            text: `文件列表: ${files.join(', ')}` 
          }] 
        };
      }

      case 'execute_command': {
        const out = require('child_process').execSync(args.command, { 
          encoding: 'utf-8', 
          timeout: 15000 
        });
        console.error(`✅ 命令执行成功`);
        return { 
          content: [{ 
            type: 'text', 
            text: out 
          }] 
        };
      }

      case 'current_time': {
        const time = new Date().toLocaleString('zh-CN', { timeZone: args.timezone });
        console.error(`✅ 当前时间: ${time}`);
        return { 
          content: [{ 
            type: 'text', 
            text: time 
          }] 
        };
      }

      case 'count_words': {
        const txt = args.text || "";
        const stats = `统计: ${txt.length} 字符, ${txt.split('\n').length} 行`;
        console.error(`✅ ${stats}`);
        return { 
          content: [{ 
            type: 'text', 
            text: stats 
          }] 
        };
      }

      default:
        console.error(`❌ 未知工具: ${name}`);
        return { 
          content: [{ 
            type: 'text', 
            text: '未知工具' 
          }], 
          isError: true 
        };
    }
  } catch (e) {
    console.error(`❌ 工具执行失败: ${e.message}`);
    return { 
      content: [{ 
        type: 'text', 
        text: `错误: ${e.message}` 
      }], 
      isError: true 
    };
  }
});

// 连接传输层
const transport = new StdioServerTransport();

console.error('🔌 正在连接传输层...');

server.connect(transport)
  .then(() => {
    console.error('✅ MCP 服务器已启动并监听 stdio');
    console.error('✅ 服务器就绪，等待请求...');
  })
  .catch((error) => {
    console.error('❌ MCP 服务器启动失败:', error);
    process.exit(1);
  });