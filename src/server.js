const express = require('express');
const cors = require('cors');
const asyncHandler = require('express-async-handler');
const dotenv = require('dotenv');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const tools = require('./tools');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize AI clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MCP routes
app.post('/mcp/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { prompt, messages, tools: requestTools, context, model } = req.body;
  
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
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }
    
    // Check if tool execution is needed
    if (provider === 'anthropic' && response.type === 'tool_use') {
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
      
      return res.json(followupResponse);
    } else if (provider === 'openai' && response.choices[0]?.message?.tool_calls) {
      const toolOutputs = await executeOpenAITools(response.choices[0].message.tool_calls);
      
      // Call the model again with tool outputs
      const toolMessages = messages || [];
      toolMessages.push({ role: 'assistant', content: null, tool_calls: response.choices[0].message.tool_calls });
      toolMessages.push({ role: 'tool', content: JSON.stringify(toolOutputs), tool_call_id: response.choices[0].message.tool_calls[0].id });
      
      const followupResponse = await handleOpenAIRequest({
        messages: toolMessages,
        model
      });
      
      return res.json(followupResponse);
    }
    
    return res.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
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
  
  try {
    const results = await tools.webSearch.searchWeb(query, limit);
    return res.json(results);
  } catch (error) {
    console.error('Error using web search tool:', error);
    return res.status(500).json({ error: error.message });
  }
}));

// Webpage content retrieval tool endpoint
app.post('/tools/web/content', asyncHandler(async (req, res) => {
  const { url, useCache = true } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  try {
    const content = await tools.webSearch.getWebpageContent(url, useCache);
    return res.json(content);
  } catch (error) {
    console.error('Error retrieving webpage content:', error);
    return res.status(500).json({ error: error.message });
  }
}));

// Multiple URLs retrieval tool endpoint
app.post('/tools/web/batch', asyncHandler(async (req, res) => {
  const { urls, useCache = true } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array parameter is required' });
  }
  
  try {
    const contents = await tools.webSearch.fetchMultipleUrls(urls, useCache);
    return res.json(contents);
  } catch (error) {
    console.error('Error retrieving multiple webpages:', error);
    return res.status(500).json({ error: error.message });
  }
}));

// Get available tools endpoint
app.get('/tools', (req, res) => {
  const availableTools = tools.getAllToolDefinitions();
  return res.json(availableTools);
});

// Get specific tool definition
app.get('/tools/:toolName', (req, res) => {
  const { toolName } = req.params;
  const toolDefinition = tools.getToolDefinition(toolName);
  
  if (!toolDefinition) {
    return res.status(404).json({ error: `Tool "${toolName}" not found` });
  }
  
  return res.json(toolDefinition);
});

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
async function handleAnthropicRequest({ prompt, messages, tools, context, model }) {
  const modelToUse = model || 'claude-3-opus-20240229';
  
  // Handle different request types
  if (messages) {
    // Messages API
    const response = await anthropic.messages.create({
      model: modelToUse,
      messages,
      ...(tools && { tools }),
      ...(context && { system: context }),
    });
    
    return response;
  } else if (prompt) {
    // Legacy completions API
    const response = await anthropic.completions.create({
      model: modelToUse,
      prompt,
      ...(context && { system: context }),
    });
    
    return response;
  } else {
    throw new Error('Either prompt or messages must be provided');
  }
}

async function handleOpenAIRequest({ prompt, messages, tools, context, model }) {
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

// Start server
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
});

module.exports = app;