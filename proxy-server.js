require('dotenv').config();

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 从环境变量或配置文件读取 API 密钥
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-';

let mcpServer = null;
let mcpBuffer = '';
let responseCallbacks = new Map();
let requestId = 1;

// 启动MCP服务器
function startMCPServer() {
  mcpServer = spawn('node', ['mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  mcpServer.stdout.on('data', (data) => {
    mcpBuffer += data.toString();
    
    let startIndex = 0;
    while (true) {
      const jsonStart = mcpBuffer.indexOf('{', startIndex);
      if (jsonStart === -1) break;
      
      let braceCount = 0;
      let jsonEnd = -1;
      
      for (let i = jsonStart; i < mcpBuffer.length; i++) {
        if (mcpBuffer[i] === '{') braceCount++;
        if (mcpBuffer[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
      
      if (jsonEnd === -1) break;
      
      try {
        const jsonStr = mcpBuffer.substring(jsonStart, jsonEnd + 1);
        const response = JSON.parse(jsonStr);
        
        if (response.id && responseCallbacks.has(response.id)) {
          const callback = responseCallbacks.get(response.id);
          responseCallbacks.delete(response.id);
          callback(null, response);
        }
        
        mcpBuffer = mcpBuffer.substring(jsonEnd + 1);
        startIndex = 0;
      } catch (error) {
        startIndex = jsonEnd + 1;
      }
    }
  });

  mcpServer.stderr.on('data', (data) => {
    console.log('[MCP]', data.toString().trim());
  });

  mcpServer.on('close', (code) => {
    console.log(`MCP服务器退出，代码: ${code}`);
    responseCallbacks.forEach(callback => {
      callback(new Error('MCP服务器已关闭'));
    });
    responseCallbacks.clear();
  });
}

// 发送到MCP服务器
function sendToMCP(request) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    request.id = id;
    
    const timeout = setTimeout(() => {
      responseCallbacks.delete(id);
      reject(new Error('请求超时'));
    }, 10000);
    
    responseCallbacks.set(id, (error, response) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(response);
    });
    
    mcpServer.stdin.write(JSON.stringify(request) + '\n');
  });
}

// DeepSeek API 代理
function proxyDeepSeekAPI(req, res) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const requestData = JSON.parse(body);
      
      // 构建发送给 DeepSeek 的请求
      const deepseekRequest = JSON.stringify(requestData);
      
      const options = {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Length': Buffer.byteLength(deepseekRequest)
        }
      };
      
      const proxyReq = https.request(options, (proxyRes) => {
        let responseData = '';
        
        proxyRes.on('data', (chunk) => {
          responseData += chunk;
        });
        
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(responseData);
        });
      });
      
      proxyReq.on('error', (error) => {
        console.error('DeepSeek API 请求失败:', error);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
          error: `API 请求失败: ${error.message}` 
        }));
      });
      
      proxyReq.write(deepseekRequest);
      proxyReq.end();
      
    } catch (error) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ 
        error: `无效的请求: ${error.message}` 
      }));
    }
  });
}

// 创建HTTP服务器
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const pathname = req.url.split('?')[0];
  
  // DeepSeek API 代理路由
  if (pathname === '/api/deepseek') {
    if (req.method === 'POST') {
      proxyDeepSeekAPI(req, res);
      return;
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '只支持 POST 请求' }));
      return;
    }
  }
  
  // MCP 工具 API 路由
  if (pathname === '/api/tools') {
    if (req.method === 'GET') {
      try {
        const response = await sendToMCP({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {}
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          const response = await sendToMCP(request);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    }
    return;
  }
  
  // 静态文件服务
  let filePath = pathname === '/' ? './index.html' : '.' + pathname;
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };
  
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('文件未找到');
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(content);
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 服务器运行在 http://localhost:${PORT}`);
  console.log('📁 打开浏览器访问上述地址开始使用');
  console.log('🔑 DeepSeek API Key:', DEEPSEEK_API_KEY.substring(0, 10) + '...\n');
  startMCPServer();
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  if (mcpServer) mcpServer.kill();
  server.close();
  process.exit(0);
});