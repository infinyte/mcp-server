// For Node.js v18+ which has fetch built-in
// If using an older version, you'll need to use node-fetch v2 or switch to ESM
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

async function testMCPServer() {
  console.log('Testing MCP server...');
  
  // Test Anthropic provider
  console.log('\n--- Testing Anthropic Provider ---');
  
  const anthropicResponse = await fetch(`${BASE_URL}/mcp/anthropic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'What is the capital of France?' }
      ],
      model: 'claude-3-haiku-20240307',
    }),
  });
  
  const anthropicData = await anthropicResponse.json();
  console.log('Anthropic Response:');
  console.log(JSON.stringify(anthropicData, null, 2));
  
  // Test OpenAI provider
  console.log('\n--- Testing OpenAI Provider ---');
  
  const openaiResponse = await fetch(`${BASE_URL}/mcp/openai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'What is the capital of France?' }
      ],
      model: 'gpt-3.5-turbo',
    }),
  });
  
  const openaiData = await openaiResponse.json();
  console.log('OpenAI Response:');
  console.log(JSON.stringify(openaiData, null, 2));
  
  // Test with tools
  console.log('\n--- Testing with Tools ---');
  
  const toolsResponse = await fetch(`${BASE_URL}/mcp/anthropic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'What is the weather in New York?' }
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a location',
          input_schema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'The unit of temperature to use',
              },
            },
            required: ['location'],
          },
        },
      ],
      model: 'claude-3-sonnet-20240229',
    }),
  });
  
  const toolsData = await toolsResponse.json();
  console.log('Tools Response:');
  console.log(JSON.stringify(toolsData, null, 2));
}

// Run the test
testMCPServer().catch(console.error);