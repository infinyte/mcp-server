const express = require('express');
const cors = require('cors');
const asyncHandler = require('express-async-handler');
const dotenv = require('dotenv');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const tools = require('./tools');
const databaseService = require('./services/database');
const stateManager = require('./services/stateManager');
const persistenceService = require('./services/persistence');
const routes = require('./routes');
const toolsAvailableHandler = require('./tools-available');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  // Skip logging for static files
  if (req.path.startsWith('/images/') || req.path.startsWith('/static/')) {
    return next();
  }
  
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Log response time on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    
    // Log tool execution (for POST requests to tool endpoints)
    if (req.method === 'POST' && req.path.startsWith('/tools/') && res.statusCode < 500) {
      try {
        const toolName = req.path.split('/')[2];
        
        stateManager.logExecution({
          toolName,
          provider: 'direct',
          inputs: req.body,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }).then(logger => {
          logger.complete({ statusCode: res.statusCode, duration });
        });
      } catch (error) {
        console.warn('Failed to log tool execution:', error.message);
      }
    }
  });
  
  next();
});

// API routes
app.use('/api', routes);

// Initialize AI clients with optional API keys
let anthropic = null;
let openai = null;

// Initialize Anthropic client if API key exists
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('Anthropic client initialized');
} else {
  console.log('Warning: ANTHROPIC_API_KEY not set, Anthropic features will be unavailable');
}

// Initialize OpenAI client if API key exists
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI client initialized');
} else {
  console.log('Warning: OPENAI_API_KEY not set, OpenAI features will be unavailable');
}

// MCP routes
app.post('/mcp/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { prompt, messages, tools: requestTools, context, model } = req.body;
  
  // Create execution logger
  const executionLogger = await stateManager.logExecution({
    toolName: 'mcp',
    provider,
    sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
    inputs: { prompt, model, hasMessages: Boolean(messages), hasTools: Boolean(requestTools) },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    modelName: model
  });
  
  let response;
  
  try {
    if (provider === 'anthropic') {
      response = await handleAnthropicRequest({ 
        prompt, 
        messages, 
        tools: requestTools, 
        context, 
        model 
      });
    } else if (provider === 'openai') {
      response = await handleOpenAIRequest({ 
        prompt, 
        messages, 
        tools: requestTools, 
        context, 
        model 
      });
    } else {
      const error = new Error(`Unsupported provider: ${provider}`);
      await executionLogger.complete(null, error);
      return res.status(400).json({ error: error.message });
    }
    
    // Check if tool execution is needed
    if (provider === 'anthropic' && response.type === 'tool_use') {
      // Log the tool use
      const toolUses = response.content.filter(item => item.type === 'tool_use');
      for (const toolUse of toolUses) {
        await stateManager.logExecution({
          toolName: toolUse.name,
          provider: 'anthropic',
          sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
          inputs: toolUse.input,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          modelName: model
        });
      }
      
      // Execute tools
      const toolOutputs = await executeTools(response.content);
      
      // Call the model again with tool outputs
      const followupResponse = await handleAnthropicRequest({
        messages: [
          ...(messages || []),
          { role: 'assistant', content: response.content },
          { role: 'user', content: [{ type: 'tool_result', content: toolOutputs }] }
        ],
        model
      });
      
      // Complete the execution log
      await executionLogger.complete({
        usedTools: toolUses.map(t => t.name),
        followupResponse: true
      });
      
      return res.json(followupResponse);
    } else if (provider === 'openai' && response.choices[0]?.message?.tool_calls) {
      // Log the tool calls
      for (const toolCall of response.choices[0].message.tool_calls) {
        await stateManager.logExecution({
          toolName: toolCall.function.name,
          provider: 'openai',
          sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
          inputs: JSON.parse(toolCall.function.arguments),
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          modelName: model
        });
      }
      
      // Execute tools
      const toolOutputs = await executeOpenAITools(response.choices[0].message.tool_calls);
      
      // Call the model again with tool outputs
      const toolMessages = messages || [];
      toolMessages.push({ role: 'assistant', content: null, tool_calls: response.choices[0].message.tool_calls });
      
      // Add all tool outputs as separate messages
      toolOutputs.forEach(toolOutput => {
        toolMessages.push({ 
          role: 'tool', 
          content: toolOutput.output, 
          tool_call_id: toolOutput.id 
        });
      });
      
      const followupResponse = await handleOpenAIRequest({
        messages: toolMessages,
        model
      });
      
      // Complete the execution log
      await executionLogger.complete({
        usedTools: response.choices[0].message.tool_calls.map(t => t.function.name),
        followupResponse: true
      });
      
      return res.json(followupResponse);
    }
    
    // Complete the execution log for successful response without tool use
    await executionLogger.complete({
      usedTools: [],
      followupResponse: false
    });
    
    return res.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
    
    // Complete the execution log with error
    await executionLogger.complete(null, error);
    
    return res.status(500).json({ error: error.message });
  }
}));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Tool endpoints
// Web search tool endpoint
app.post('/tools/web/search', asyncHandler(async (req, res) => {
  const { query, limit = 5 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  // Create execution logger
  const executionLogger = await stateManager.logExecution({
    toolName: 'web_search',
    provider: 'direct',
    sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
    inputs: { query, limit },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  
  try {
    const results = await tools.webSearch.searchWeb(query, limit);
    
    // Complete the execution log
    await executionLogger.complete(results);
    
    return res.json(results);
  } catch (error) {
    console.error('Error using web search tool:', error);
    
    // Complete the execution log with error
    await executionLogger.complete(null, error);
    
    return res.status(500).json({ error: error.message });
  }
}));

// Webpage content retrieval tool endpoint
app.post('/tools/web/content', asyncHandler(async (req, res) => {
  const { url, useCache = true } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  // Create execution logger
  const executionLogger = await stateManager.logExecution({
    toolName: 'web_content',
    provider: 'direct',
    sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
    inputs: { url, useCache },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  
  try {
    const content = await tools.webSearch.getWebpageContent(url, useCache);
    
    // Complete the execution log
    await executionLogger.complete({
      url,
      title: content.title,
      contentLength: content.content?.length || 0
    });
    
    return res.json(content);
  } catch (error) {
    console.error('Error retrieving webpage content:', error);
    
    // Complete the execution log with error
    await executionLogger.complete(null, error);
    
    return res.status(500).json({ error: error.message });
  }
}));

// Multiple URLs retrieval tool endpoint
app.post('/tools/web/batch', asyncHandler(async (req, res) => {
  const { urls, useCache = true } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array parameter is required' });
  }
  
  // Create execution logger
  const executionLogger = await stateManager.logExecution({
    toolName: 'web_batch',
    provider: 'direct',
    sessionId: req.headers['x-session-id'] || `session_${Date.now()}`,
    inputs: { urls, useCache },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  
  try {
    const contents = await tools.webSearch.fetchMultipleUrls(urls, useCache);
    
    // Complete the execution log
    await executionLogger.complete({
      urlCount: urls.length,
      successCount: contents.filter(c => c.success).length
    });
    
    return res.json(contents);
  } catch (error) {
    console.error('Error retrieving multiple webpages:', error);
    
    // Complete the execution log with error
    await executionLogger.complete(null, error);
    
    return res.status(500).json({ error: error.message });
  }
}));

// Get available tools endpoint
app.get('/tools', asyncHandler(async (req, res) => {
  const { category, enabledOnly } = req.query;
  
  // Parse query params
  const options = {
    category: category || undefined,
    enabledOnly: enabledOnly === 'true'
  };
  
  try {
    // Try to get tools from database first
    const dbTools = await databaseService.getAllTools(options);
    
    // If we have tools in the database, return them
    if (dbTools && dbTools.length > 0) {
      return res.json(dbTools);
    }
    
    // Fall back to in-memory tools
    const availableTools = tools.getAllToolDefinitions();
    return res.json(availableTools);
  } catch (error) {
    console.error('Error getting tools:', error);
    
    // Fall back to in-memory tools on error
    const availableTools = tools.getAllToolDefinitions();
    return res.json(availableTools);
  }
}));

// Available tools endpoint with detailed information
app.get('/tools/available', toolsAvailableHandler(tools, databaseService));

// List tools endpoint (human-readable format)
app.get('/tools/list/all', asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;
  
  try {
    // Get tools from database or fall back to in-memory
    const allTools = await databaseService.getAllTools({ enabledOnly: true });
    
    // Group tools by category
    const toolsByCategory = {};
    
    allTools.forEach(tool => {
      const category = tool.category || 'other';
      
      if (!toolsByCategory[category]) {
        toolsByCategory[category] = [];
      }
      
      toolsByCategory[category].push({
        name: tool.name,
        description: tool.description,
        version: tool.version || '1.0.0'
      });
    });
    
    // Format response based on requested format
    if (format === 'html') {
      let html = '<html><head><title>Available MCP Tools</title>';
      html += '<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}h1{color:#333}' +
              'h2{color:#444;margin-top:20px}ul{margin-bottom:30px}li{margin:8px 0}' +
              '.tool-name{font-weight:bold;color:#0066cc}.tool-description{color:#444}</style>';
      html += '</head><body>';
      html += '<h1>Available MCP Tools</h1>';
      
      Object.entries(toolsByCategory).forEach(([category, categoryTools]) => {
        html += `<h2>${category.charAt(0).toUpperCase() + category.slice(1)} Tools</h2>`;
        html += '<ul>';
        
        categoryTools.forEach(tool => {
          html += `<li><span class="tool-name">${tool.name}</span> (v${tool.version}): ` + 
                  `<span class="tool-description">${tool.description}</span></li>`;
        });
        
        html += '</ul>';
      });
      
      html += '</body></html>';
      res.header('Content-Type', 'text/html');
      return res.send(html);
    } else {
      return res.json({
        count: allTools.length,
        categories: Object.keys(toolsByCategory),
        toolsByCategory
      });
    }
  } catch (error) {
    console.error('Error listing tools:', error);
    return res.status(500).json({ error: error.message });
  }
}));

// Image generation tool endpoints
app.post('/tools/image/generate', asyncHandler(async (req, res) => {
  const { prompt, provider = 'openai', options = {} } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt parameter is required' });
  }
  
  try {
    const result = await tools.imageGeneration.generateImage(prompt, provider, options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error generating image:', error);
    return res.status(500).json({ error: error.message });
  }
}));

app.post('/tools/image/edit', asyncHandler(async (req, res) => {
  const { imagePath, prompt, maskPath } = req.body;
  
  if (!imagePath || !prompt) {
    return res.status(400).json({ error: 'Both imagePath and prompt parameters are required' });
  }
  
  try {
    const result = await tools.imageGeneration.editImage(imagePath, prompt, maskPath);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error editing image:', error);
    return res.status(500).json({ error: error.message });
  }
}));

app.post('/tools/image/variation', asyncHandler(async (req, res) => {
  const { imagePath } = req.body;
  
  if (!imagePath) {
    return res.status(400).json({ error: 'ImagePath parameter is required' });
  }
  
  try {
    const result = await tools.imageGeneration.createImageVariation(imagePath);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error creating image variation:', error);
    return res.status(500).json({ error: error.message });
  }
}));

// Handler functions for different providers
async function handleAnthropicRequest({ prompt, messages, tools, context, model, max_tokens }) {
  if (!anthropic) {
    throw new Error('Anthropic client is not initialized. Please set ANTHROPIC_API_KEY in your .env file.');
  }

  const modelToUse = model || 'claude-3-opus-20240229';
  const maxTokens = max_tokens || 1000; // Default to 1000 tokens
  
  // Handle different request types
  if (messages) {
    // Messages API
    const response = await anthropic.messages.create({
      model: modelToUse,
      messages,
      max_tokens: maxTokens,
      ...(tools && { tools }),
      ...(context && { system: context }),
    });
    
    return response;
  } else if (prompt) {
    // Legacy completions API
    const response = await anthropic.completions.create({
      model: modelToUse,
      prompt,
      max_tokens: maxTokens,
      ...(context && { system: context }),
    });
    
    return response;
  } else {
    throw new Error('Either prompt or messages must be provided');
  }
}

async function handleOpenAIRequest({ prompt, messages, tools, context, model }) {
  if (!openai) {
    throw new Error('OpenAI client is not initialized. Please set OPENAI_API_KEY in your .env file.');
  }

  const modelToUse = model || 'gpt-4o';
  
  if (messages) {
    // Format messages properly for OpenAI
    const formattedMessages = messages.map(msg => {
      if (msg.role === 'user') return { role: 'user', content: msg.content };
      if (msg.role === 'assistant') return { role: 'assistant', content: msg.content };
      if (msg.role === 'system') return { role: 'system', content: msg.content };
      return msg;
    });
    
    // Add system message if context is provided
    if (context && !formattedMessages.some(m => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: context });
    }
    
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: formattedMessages,
      ...(tools && { tools }),
    });
    
    return response;
  } else if (prompt) {
    // For prompt-based requests, create a user message
    const messages = [
      ...(context ? [{ role: 'system', content: context }] : []),
      { role: 'user', content: prompt }
    ];
    
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages,
      ...(tools && { tools }),
    });
    
    return response;
  } else {
    throw new Error('Either prompt or messages must be provided');
  }
}

// Function to execute tools based on model responses
async function executeTools(toolUseContent) {
  try {
    // For Claude models
    const toolUses = toolUseContent.filter(item => item.type === 'tool_use');
    
    const results = [];
    
    for (const toolUse of toolUses) {
      const { name, input } = toolUse;
      
      switch (name) {
        // Web tools
        case 'web_search':
          const searchResults = await tools.webSearch.searchWeb(input.query, input.limit);
          results.push({
            tool_name: name,
            input,
            output: searchResults
          });
          break;
        
        case 'web_content':
          const contentResults = await tools.webSearch.getWebpageContent(input.url, input.useCache);
          results.push({
            tool_name: name,
            input,
            output: contentResults
          });
          break;
        
        case 'web_batch':
          const batchResults = await tools.webSearch.fetchMultipleUrls(input.urls, input.useCache);
          results.push({
            tool_name: name,
            input,
            output: batchResults
          });
          break;
          
        // Image tools
        case 'generate_image':
          const imageResult = await tools.imageGeneration.generateImage(
            input.prompt, 
            input.provider || 'openai', 
            input.options || {}
          );
          results.push({
            tool_name: name,
            input,
            output: imageResult
          });
          break;
          
        case 'edit_image':
          const editResult = await tools.imageGeneration.editImage(
            input.imagePath,
            input.prompt,
            input.maskPath
          );
          results.push({
            tool_name: name,
            input,
            output: editResult
          });
          break;
          
        case 'create_image_variation':
          const variationResult = await tools.imageGeneration.createImageVariation(
            input.imagePath
          );
          results.push({
            tool_name: name,
            input,
            output: variationResult
          });
          break;
        
        default:
          results.push({
            tool_name: name,
            input,
            output: { error: `Unknown tool: ${name}` }
          });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error executing tools:', error);
    throw new Error(`Tool execution failed: ${error.message}`);
  }
}

// Function to execute tools for OpenAI
async function executeOpenAITools(toolCalls) {
  try {
    const results = [];
    
    for (const toolCall of toolCalls) {
      const { function: func, id } = toolCall;
      const { name } = func;
      const input = JSON.parse(func.arguments);
      
      switch (name) {
        // Web tools
        case 'web_search':
          const searchResults = await tools.webSearch.searchWeb(input.query, input.limit);
          results.push({
            id,
            output: JSON.stringify(searchResults)
          });
          break;
        
        case 'web_content':
          const contentResults = await tools.webSearch.getWebpageContent(input.url, input.useCache);
          results.push({
            id,
            output: JSON.stringify(contentResults)
          });
          break;
        
        case 'web_batch':
          const batchResults = await tools.webSearch.fetchMultipleUrls(input.urls, input.useCache);
          results.push({
            id,
            output: JSON.stringify(batchResults)
          });
          break;
          
        // Image tools
        case 'generate_image':
          const imageResult = await tools.imageGeneration.generateImage(
            input.prompt, 
            input.provider || 'openai', 
            input.options || {}
          );
          results.push({
            id,
            output: JSON.stringify(imageResult)
          });
          break;
          
        case 'edit_image':
          const editResult = await tools.imageGeneration.editImage(
            input.imagePath,
            input.prompt,
            input.maskPath
          );
          results.push({
            id,
            output: JSON.stringify(editResult)
          });
          break;
          
        case 'create_image_variation':
          const variationResult = await tools.imageGeneration.createImageVariation(
            input.imagePath
          );
          results.push({
            id,
            output: JSON.stringify(variationResult)
          });
          break;
        
        default:
          results.push({
            id,
            output: JSON.stringify({ error: `Unknown tool: ${name}` })
          });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error executing OpenAI tools:', error);
    throw new Error(`Tool execution failed: ${error.message}`);
  }
}

// Function to start the server
async function startServer() {
  try {
    console.log('Starting MCP server...');
    
    // Initialize database connection
    console.log('Initializing database connection...');
    
    // Get tool definitions from the toolDefinitions module
    const toolDefsArray = tools.getAllToolDefinitions();
    
    // Initialize database with existing tool definitions
    await databaseService.initialize({ tools: toolDefsArray })
      .then(success => {
        if (success) {
          console.log('✅ Database initialized successfully');
        } else {
          console.warn('⚠️  Database initialization completed with warnings');
        }
      })
      .catch(err => {
        console.error('❌ Database initialization failed:', err.message);
        console.log('Continuing with limited database functionality...');
      });
    
    // Initialize state manager
    console.log('Initializing state manager...');
    await stateManager.initialize()
      .then(success => {
        if (success) {
          console.log('✅ State manager initialized successfully');
        } else {
          console.warn('⚠️  State manager initialization completed with warnings');
        }
      })
      .catch(err => {
        console.error('❌ State manager initialization failed:', err);
        console.log('Continuing with limited state management...');
      });
    
    // Initialize persistence service
    console.log('Initializing persistence service...');
    await persistenceService.initialize()
      .catch(err => {
        console.error('❌ Persistence service initialization failed:', err);
        console.log('Continuing without persistence service...');
      });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`MCP server running on port ${PORT}`);
      
      // Log available features
      console.log('\n=== Available Features ===');
      console.log(`Anthropic API (Claude): ${anthropic ? 'Enabled ✅' : 'Disabled ❌'}`);
      console.log(`OpenAI API (GPT, DALL-E): ${openai ? 'Enabled ✅' : 'Disabled ❌'}`);
      
      if (databaseService.useFallback) {
        console.log(`Database: In-Memory Fallback ⚠️`);
      } else {
        console.log(`Database: ${databaseService.isConnected ? 'MongoDB Connected ✅' : 'Disconnected ❌'}`);
      }
      
      console.log(`State Management: ${stateManager.initialized ? 'Enabled ✅' : 'Disabled ❌'}`);
      console.log(`Persistence: Enabled ✅`);
      
      if (!anthropic && !openai) {
        console.log('\n⚠️  Neither Anthropic nor OpenAI APIs are configured.');
        console.log('The MCP server will run with limited functionality.');
        console.log('To enable more features, run: node src/setup.js');
      }
      
      if (databaseService.useFallback) {
        console.log('\n⚠️  Running with in-memory database (data will not persist between restarts)');
        console.log('To use MongoDB persistence, follow the instructions in MONGODB_SETUP.md');
      }
      
      console.log('\nServer is ready to accept connections!');
      console.log(`You can access the web UI at: http://localhost:${PORT}`);
    });
    
    // Log system info every 30 minutes
    setInterval(() => {
      const status = stateManager.getStatus();
      const memoryMB = Math.round(status.memoryUsage.heapUsed / 1024 / 1024);
      console.log(`[${new Date().toISOString()}] System status: ${status.toolCount} tools, ${memoryMB}MB memory used`);
    }, 30 * 60 * 1000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// If this file is being run directly, start the server
if (require.main === module) {
  // Check if the setup script exists
  try {
    const setup = require('./setup');
    
    // Check environment and start server if everything is configured
    if (process.env.SKIP_ENV_CHECK) {
      console.log('Environment check skipped via SKIP_ENV_CHECK flag.');
      startServer().catch(err => {
        console.error('Server startup failed:', err.message);
        process.exit(1);
      });
    } else {
      // Perform environment check without interactive prompt
      const envStatus = {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        stability: Boolean(process.env.STABILITY_API_KEY)
      };
      
      if (!envStatus.anthropic && !envStatus.openai && !envStatus.stability) {
        console.log('\n⚠️  Warning: No API keys detected in environment.');
        console.log('Would you like to set up API keys now? (Y/n)');
        
        // Create readline interface for input
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('> ', (answer) => {
          rl.close();
          if (answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no') {
            // Run setup and then start server when done
            setup.promptForEnvVars().then(() => {
              console.log('\nReloading environment variables...');
              // Reload environment variables
              Object.keys(require.cache).forEach(key => {
                if (key.includes('dotenv')) {
                  delete require.cache[key];
                }
              });
              require('dotenv').config();
              
              // Start server with the new environment variables
              startServer().catch(err => {
                console.error('Server startup failed:', err.message);
                process.exit(1);
              });
            });
          } else {
            console.log('Skipping setup. Starting server with limited functionality...');
            startServer().catch(err => {
              console.error('Server startup failed:', err.message);
              process.exit(1);
            });
          }
        });
      } else {
        startServer().catch(err => {
          console.error('Server startup failed:', err.message);
          process.exit(1);
        });
      }
    }
  } catch (error) {
    console.warn('Setup module not found, skipping environment check.');
    startServer().catch(err => {
      console.error('Server startup failed:', err.message);
      process.exit(1);
    });
  }
}

module.exports = app;