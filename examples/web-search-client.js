/**
 * Example client for using the web search tool
 */
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const BASE_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

// Sample query to demonstrate tool usage
async function testWebSearchTool() {
  console.log('Testing Web Search Tool...');
  
  // Get available tools
  console.log('\n--- Getting Available Tools ---');
  
  const toolsResponse = await fetch(`${BASE_URL}/tools`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  const toolsData = await toolsResponse.json();
  console.log('Available Tools:');
  console.log(JSON.stringify(toolsData, null, 2));
  
  // Direct tool usage example
  console.log('\n--- Testing Direct Tool Usage ---');
  
  const webContentResponse = await fetch(`${BASE_URL}/tools/web/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://www.anthropic.com',
    }),
  });
  
  const webContentData = await webContentResponse.json();
  console.log('Web Content Result:');
  console.log(`Title: ${webContentData.title}`);
  console.log(`Description: ${webContentData.description}`);
  console.log(`Content Length: ${webContentData.content.length} characters`);
  
  // Using the MCP with tools
  console.log('\n--- Testing MCP With Tools ---');
  
  const anthropicResponse = await fetch(`${BASE_URL}/mcp/anthropic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'What is the current weather in New York City?' }
      ],
      model: 'claude-3-haiku-20240307',
      tools: [
        {
          name: "web_search",
          description: "Search the web for information on a given query",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query"
              },
              limit: {
                type: "integer",
                description: "Maximum number of results to return",
                default: 5
              }
            },
            required: ["query"]
          }
        },
        {
          name: "web_content",
          description: "Retrieve and extract content from a specific URL",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL to retrieve content from"
              },
              useCache: {
                type: "boolean",
                description: "Whether to use cached content if available",
                default: true
              }
            },
            required: ["url"]
          }
        }
      ]
    }),
  });
  
  const anthropicData = await anthropicResponse.json();
  console.log('Anthropic Response With Tools:');
  console.log(JSON.stringify(anthropicData, null, 2));
}

// Run the test
testWebSearchTool().catch(console.error);