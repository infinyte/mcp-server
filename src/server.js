const express = require('express');
const cors = require('cors');
const asyncHandler = require('express-async-handler');
const dotenv = require('dotenv');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');

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
  const { prompt, messages, tools, context, model } = req.body;
  
  let response;
  
  try {
    if (provider === 'anthropic') {
      response = await handleAnthropicRequest({ prompt, messages, tools, context, model });
    } else if (provider === 'openai') {
      response = await handleOpenAIRequest({ prompt, messages, tools, context, model });
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
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

// Start server
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
});

module.exports = app;