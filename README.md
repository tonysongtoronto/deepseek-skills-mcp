# DeepSeek Skills MCP - 智能工具选择系统

## 项目概述

DeepSeek Skills MCP 是一个集成DeepSeek大模型的智能工具选择与任务规划系统。该系统通过MCP（Model Context Protocol）提供8个免费工具，并利用DeepSeek大模型进行智能分析，自动推荐最合适的工具来执行用户任务。

### 核心特性
- 🤖 **智能对话模式**：输入自然语言任务，DeepSeek大模型自动分析并推荐工具
- 🛠️ **手动工具模式**：传统工具选择方式，直接选择工具并填写参数
- 🧠 **思考过程可视化**：显示大模型的完整推理过程和决策依据
- 🔧 **8个免费工具**：无需额外API，开箱即用
- 🌐 **现代化Web界面**：直观的用户界面，实时交互体验

## 功能特性

### 可用工具列表

| 工具名称 | 功能描述 | 主要用途 |
|---------|---------|---------|
| `calculate` | 执行数学计算 | 支持基本运算、复杂表达式、科学计算和统计函数 |
| `read_file` | 读取本地文件内容 | 获取文本文件内容供其他工具处理 |
| `write_file` | 写入内容到文件 | 保存处理结果、生成报告或创建配置文件 |
| `list_files` | 列出目录内容 | 文件系统导航和内容查看 |
| `execute_command` | 执行系统命令 | 系统操作、软件安装、进程管理 |
| `current_time` | 获取当前时间 | 时间戳记录、定时任务或时间相关计算 |
| `web_search_mock` | 模拟网络搜索 | 信息查询和知识获取（演示用途） |
| `count_words` | 统计文本字数 | 智能统计中英文混合文本的字数、行数和字符数 |

### 智能分析功能
- **自然语言理解**：理解用户查询意图
- **多工具识别**：自动识别复杂任务，规划多工具工作流
- **参数自动提取**：从查询中智能提取工具所需参数
- **置信度评估**：提供分析结果的置信度评分
- **备选方案**：提供多个备选工具建议

## 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端Web界面    │◄──►│ HTTP代理服务器   │◄──►│   MCP服务器      │
│  (index.html)   │    │ (proxy-server.js)│    │ (mcp-server.js) │
│  + app.js       │    │  端口: 3001      │    │                 │
│  + style.css    │    └─────────────────┘    └─────────────────┘
└─────────────────┘           │
                              ▼
                     ┌─────────────────┐
                     │  DeepSeek API   │
                     │   (可选集成)     │
                     └─────────────────┘
```

## 环境要求

### 必需软件
- **Node.js** 16.x 或更高版本
- **npm** 8.x 或更高版本
- **现代浏览器**（Chrome 90+、Firefox 88+、Edge 90+）

### 可选配置
- **DeepSeek API密钥**：用于智能分析功能（非必需，有回退方案）

## 安装步骤

### 1. 克隆项目
```bash
git clone <项目仓库地址>
cd deepseek-skills-mcp
```

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置（推荐）
为了安全地使用DeepSeek大模型的智能分析功能，建议使用环境变量配置API密钥：

#### 方法一：使用环境变量（推荐）
1. 复制环境变量模板文件：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，填入您的DeepSeek API密钥：
   ```
   DEEPSEEK_API_KEY=your_api_key_here
   ```

3. 系统会自动从环境变量读取API密钥

#### 方法二：直接配置（仅限开发环境）
如果没有配置环境变量，系统会使用开发密钥，但会显示警告信息。

#### 安全提示
- **不要将 `.env` 文件提交到版本控制系统**（已在 `.gitignore` 中排除）
- **生产环境建议使用后端代理**来保护API密钥
- 定期轮换API密钥以提高安全性

如果没有DeepSeek API密钥，系统将自动使用规则引擎作为回退方案。

## 运行方法

### 方法一：完整启动（推荐）
```bash
# 启动HTTP代理服务器（自动启动MCP服务器）
node proxy-server.js
```

### 方法二：分别启动
```bash
# 终端1：启动MCP服务器
node mcp-server.js

# 终端2：启动HTTP代理服务器
node proxy-server.js
```

### 方法三：使用npm脚本
```bash
# 查看package.json中的可用脚本
npm start
```

## 访问应用

1. 启动服务器后，打开浏览器
2. 访问地址：`http://localhost:3001`
3. 系统界面将自动加载

## 使用指南

### 智能对话模式
1. **输入任务描述**：在文本框中输入自然语言任务，如"计算2+2的结果"
2. **点击分析**：点击"大模型分析"按钮
3. **查看分析结果**：系统显示大模型的思考过程和工具推荐
4. **执行工具**：点击"发送请求"执行推荐的工具

### 手动工具模式
1. **切换模式**：点击"手动工具模式"标签
2. **选择工具**：从下拉菜单中选择需要的工具
3. **填写参数**：根据提示填写工具参数
4. **执行工具**：点击"发送请求"执行

### 工具使用示例

#### 示例1：数学计算
```
任务描述：计算圆的面积，半径为5
推荐工具：calculate
参数：{ "expression": "pi*5^2" }
```

#### 示例2：文件操作
```
任务描述：读取demo.txt文件并统计字数
推荐工具：read_file → count_words（多工具工作流）
```

#### 示例3：系统命令
```
任务描述：查看当前目录文件列表
推荐工具：list_files
参数：{ "path": "." }
```

## 测试方法

### 1. 功能测试
```bash
# 测试MCP服务器
node mcp-server.js
# 检查控制台输出，确认服务器启动成功

# 测试代理服务器
node proxy-server.js
# 访问 http://localhost:3001，确认界面正常加载
```

### 2. 工具测试
通过Web界面测试各个工具：

1. **计算工具测试**
   - 输入：`计算 2+3*4`
   - 预期：返回计算结果 `14`

2. **文件读取测试**
   - 输入：`读取 demo.txt 文件`
   - 预期：返回demo.txt文件内容

3. **字数统计测试**
   - 输入：`统计"Hello World"的字数`
   - 预期：返回详细的统计信息

### 3. 智能分析测试
1. **简单查询测试**
   - 输入：`现在几点`
   - 预期：推荐 `current_time` 工具

2. **复杂查询测试**
   - 输入：`读取文件并统计字数`
   - 预期：推荐多工具工作流 `read_file → count_words`

### 4. API接口测试
```bash
# 测试工具列表接口
curl http://localhost:3001/api/tools

# 测试工具调用接口
curl -X POST http://localhost:3001/api/tools \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "calculate",
      "arguments": {
        "expression": "2+2"
      }
    }
  }'
```

## 项目结构

```
deepseek-skills-mcp/
├── README.md                 # 项目说明文档（本文件）
├── package.json             # 项目配置和依赖
├── package-lock.json        # 依赖锁文件
├── index.html              # 前端主界面
├── style.css               # 样式文件
├── app.js                  # 前端逻辑，包含DeepSeek集成
├── mcp-server.js           # MCP服务器，工具实现
├── proxy-server.js         # HTTP代理服务器
├── demo.txt                # 示例文件，用于测试
├── scores.csv              # 示例数据文件
├── analysis_report.md      # 分析报告示例
├── tool_usage_demo.md      # 工具使用演示
└── Python/                 # Python示例代码
    ├── calculate_average.py
    └── myenv/
```

### 关键文件说明

- **mcp-server.js**：核心MCP服务器，实现所有工具的逻辑
- **proxy-server.js**：HTTP代理，连接前端和MCP服务器，提供REST API
- **app.js**：前端JavaScript，包含DeepSeek客户端和UI逻辑
- **index.html**：用户界面，支持两种使用模式
- **demo.txt**：示例文本文件，用于测试文件读取功能

## 常见问题

### Q1: 启动服务器时出现端口占用错误
**A**: 修改 `proxy-server.js` 中的端口号（默认3001），或关闭占用端口的进程。

### Q2: DeepSeek API密钥无效或未配置
**A**: 系统会自动使用规则引擎作为回退方案，智能分析功能仍可用但可能精度较低。

### Q3: 文件操作权限错误
**A**: 确保项目目录有读写权限，或使用相对路径而非绝对路径。

### Q4: 系统命令执行失败
**A**: 检查命令语法，确保在当前操作系统（Windows/Linux/macOS）中有效。

### Q5: 界面加载缓慢或样式异常
**A**: 检查网络连接，确保能访问CDN资源（Font Awesome、Google Fonts）。

## 技术栈

### 后端技术
- **Node.js**：运行时环境
- **MCP SDK** (@modelcontextprotocol/sdk)：MCP协议实现
- **mathjs**：数学计算库
- **axios**：HTTP客户端

### 前端技术
- **HTML5/CSS3**：页面结构和样式
- **JavaScript (ES6+)**：交互逻辑
- **Font Awesome**：图标库
- **Google Fonts**：字体服务

### 开发工具
- **npm**：包管理
- **Git**：版本控制

## 开发指南

### 添加新工具
1. 在 `mcp-server.js` 中添加工具定义
2. 实现工具处理逻辑
3. 在前端 `app.js` 中注册工具参数
4. 更新工具图标和描述

### 修改界面样式
1. 编辑 `style.css` 文件
2. 修改颜色、布局等样式
3. 刷新浏览器查看效果

### 调试技巧
1. 使用浏览器开发者工具（F12）查看控制台日志
2. 检查网络请求和响应
3. 查看服务器控制台输出

## 许可证

本项目仅供学习和演示使用。DeepSeek API使用需遵守相关服务条款。

## 贡献指南

欢迎提交Issue和Pull Request来改进本项目。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个Pull Request

## 更新日志

### v1.0.0 (2025-01-21)
- 初始版本发布
- 实现8个核心工具
- 集成DeepSeek大模型智能分析
- 提供两种使用模式
- 完整的Web界面

---

**提示**：首次使用时，建议从简单任务开始，逐步尝试复杂功能。系统支持中英文混合输入，智能识别用户意图。

如有问题，请查看控制台日志或联系开发者。
