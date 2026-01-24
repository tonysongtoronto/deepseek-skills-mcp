require('dotenv').config();

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-';

let mcpServer = null;
let mcpBuffer = '';
let responseCallbacks = new Map();
let requestId = 1;
let mcpReady = false;

function startMCPServer() {
  console.log('🚀 正在启动 MCP 服务器...');
  
  mcpServer = spawn('node', ['mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // 给服务器 2 秒启动时间
  setTimeout(() => {
    if (!mcpReady) {
      console.log('⚠️ MCP 未检测到就绪信号，但假设已启动');
      mcpReady = true;
    }
  }, 2000);

  mcpServer.stdout.on('data', (data) => {
    mcpBuffer += data.toString();
    
    // 检测 MCP 服务器就绪
    if (!mcpReady && mcpBuffer.includes('"jsonrpc"')) {
      mcpReady = true;
      console.log('✅ MCP 服务器已就绪');
    }
    
    // 尝试解析所有完整的 JSON 对象
    while (true) {
      // 跳过空白字符
      mcpBuffer = mcpBuffer.trimStart();
      
      if (mcpBuffer.length === 0) break;
      
      // 查找 JSON 对象的开始
      const jsonStart = mcpBuffer.indexOf('{');
      if (jsonStart === -1) break;
      
      // 如果开头有非 JSON 字符，移除它们
      if (jsonStart > 0) {
        mcpBuffer = mcpBuffer.substring(jsonStart);
      }
      
      // 找到完整的 JSON 对象
      let braceCount = 0;
      let jsonEnd = -1;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < mcpBuffer.length; i++) {
        const char = mcpBuffer[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i;
              break;
            }
          }
        }
      }
      
      // 如果找到完整的 JSON 对象
      if (jsonEnd !== -1) {
        const jsonStr = mcpBuffer.substring(0, jsonEnd + 1);
        
        try {
          const response = JSON.parse(jsonStr);
          console.log('📩 MCP 响应 ID:', response.id || 'unknown');
          
          if (response.id && responseCallbacks.has(response.id)) {
            const callback = responseCallbacks.get(response.id);
            responseCallbacks.delete(response.id);
            callback(response);
          }
        } catch (e) {
          console.error('❌ JSON 解析失败:', e.message);
          console.error('问题 JSON (前200字符):', jsonStr.substring(0, 200));
        }
        
        // 移除已解析的部分
        mcpBuffer = mcpBuffer.substring(jsonEnd + 1);
      } else {
        // 没有完整的 JSON，等待更多数据
        break;
      }
    }
  });

  mcpServer.stderr.on('data', (data) => {
    const message = data.toString().trim();
    console.error(`[MCP Log] ${message}`);
    
    // 检测 MCP 服务器就绪 - 改进检测逻辑
    if (!mcpReady && (
      message.includes('服务器已启动') || 
      message.includes('服务器就绪') ||
      message.includes('等待请求')
    )) {
      mcpReady = true;
      console.log('✅ MCP 服务器已就绪 (通过 stderr 检测)');
    }
  });

  mcpServer.on('error', (error) => {
    console.error('❌ MCP 服务器启动失败:', error);
  });

  mcpServer.on('exit', (code) => {
    console.error(`⚠️ MCP 服务器退出，代码: ${code}`);
    mcpReady = false;
  });
}

startMCPServer();

function callMCP(method, params, id) {
  return new Promise((resolve, reject) => {
    if (!mcpServer || mcpServer.killed) {
      return reject(new Error('MCP 服务器未运行'));
    }

    const request = { jsonrpc: '2.0', method, params, id };
    console.log(`📤 发送 MCP 请求: ${method} (ID: ${id})`);
    
    const timeout = setTimeout(() => {
      if (responseCallbacks.has(id)) {
        responseCallbacks.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }
    }, 60000);

    responseCallbacks.set(id, (response) => {
      clearTimeout(timeout);
      
      if (response.error) {
        console.error(`❌ MCP 错误响应:`, response.error);
        reject(new Error(response.error.message || JSON.stringify(response.error)));
      } else {
        console.log(`✅ MCP 响应成功: ${method} (ID: ${id})`);
        resolve(response);
      }
    });
    
    try {
      mcpServer.stdin.write(JSON.stringify(request) + '\n');
    } catch (error) {
      clearTimeout(timeout);
      responseCallbacks.delete(id);
      reject(error);
    }
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); 
    res.end(); 
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  console.log(`📥 ${req.method} ${pathname}`);

  // AI 聊天转发
  if ((pathname === '/api/chat' || pathname === '/api/deepseek') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log('🤖 转发到 DeepSeek API...');
      
      const options = {
        hostname: 'api.deepseek.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY.trim()}`
        },
        timeout: 60000
      };

      const proxyReq = https.request(options, (proxyRes) => {
        console.log(`✅ DeepSeek 响应: ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (e) => {
        console.error('❌ DeepSeek API 错误:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: `API 请求失败: ${e.message}` }));
      });

      proxyReq.on('timeout', () => {
        console.error('⏱️ DeepSeek API 超时');
        proxyReq.destroy();
        res.writeHead(504);
        res.end(JSON.stringify({ error: 'API 请求超时' }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // 工具处理
  if (pathname === '/api/tools') {
    if (req.method === 'GET') {
      console.log('🔧 获取工具列表...');
      
      try {
        // 等待 MCP 就绪，最多等待 10 秒
        let retries = 0;
        while (!mcpReady && retries < 20) {
          if (retries === 0) {
            console.log('⏳ 等待 MCP 服务器就绪...');
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
        
        if (!mcpReady) {
          console.error('❌ MCP 服务器可能未正常启动');
          console.error('💡 建议：检查 mcp-server.js 是否有错误');
        }
        
        console.log(`📤 尝试调用 tools/list (就绪状态: ${mcpReady})...`);
        
        const currentRequestId = requestId++;
        const response = await callMCP('tools/list', {}, currentRequestId);
        
        console.log(`✅ 工具列表获取成功，共 ${response.result?.tools?.length || 0} 个工具`);
        
        // 返回标准格式
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          result: response.result,
          id: currentRequestId
        }));
        
      } catch (error) {
        console.error('❌ 获取工具列表失败:', error.message);
        console.error('💡 完整错误:', error);
        res.writeHead(500); 
        res.end(JSON.stringify({ 
          jsonrpc: '2.0',
          error: { 
            code: -32603,
            message: error.message 
          },
          result: { tools: [] }
        }));
      }
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        console.log('🔨 调用工具...');
        
        try {
          const args = JSON.parse(body);
          console.log('工具参数:', JSON.stringify(args).substring(0, 200));
          
          const currentRequestId = requestId++;
          const response = await callMCP('tools/call', args.params, currentRequestId);
          
          console.log('✅ 工具调用成功');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          console.error('❌ 调用工具失败:', error.message);
          res.writeHead(500); 
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    }
    return;
  }

  // 静态文件
  let filePath = pathname === '/' ? './index.html' : '.' + pathname;
  const ext = path.extname(filePath);
  const types = { 
    '.html': 'text/html', 
    '.js': 'text/javascript', 
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };
  
  fs.readFile(filePath, (err, content) => {
    if (err) { 
      console.error(`❌ 文件未找到: ${filePath}`);
      res.writeHead(404); 
      res.end('Not Found'); 
    } else { 
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' }); 
      res.end(content); 
    }
  });
});

server.listen(3001, () => {
  console.log('\n' + '='.repeat(50));
  console.log('✅ 代理服务器运行在 http://localhost:3001');
  console.log('📌 支持的路由:');
  console.log('   - POST /api/chat 或 /api/deepseek (DeepSeek AI)');
  console.log('   - GET  /api/tools (获取工具列表)');
  console.log('   - POST /api/tools (调用工具)');
  console.log('='.repeat(50) + '\n');
});