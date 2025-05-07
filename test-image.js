const axios = require('axios');
const fs = require('fs');

async function testImageGeneration() {
  try {
    console.log('Testing image generation...');
    
    const response = await axios.post('http://localhost:3000/tools/image/generate', {
      prompt: 'A cute golden retriever puppy playing in a park on a sunny day',
      provider: 'openai',
      options: {
        model: 'dall-e-3',
        size: '1024x1024'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Image generation successful:', response.data.success);
    console.log('Image URL:', response.data.image_url);
    console.log('File path:', response.data.file_path);
    
    return response.data;
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Also test making a request to the MCP endpoint with Claude
async function testMCPWithClaude() {
  try {
    console.log('\nTesting MCP with Claude and image generation tool...');
    
    const response = await axios.post('http://localhost:3000/mcp/anthropic', {
      messages: [
        { role: 'user', content: 'Generate an image of a dog playing frisbee' }
      ],
      model: 'claude-3-haiku-20240307',
      tools: [
        {
          name: "generate_image",
          description: "Generate an image based on a text prompt",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Detailed description of the image to generate"
              },
              provider: {
                type: "string",
                description: "AI provider to use for image generation",
                enum: ["openai", "stability"],
                default: "openai"
              }
            },
            required: ["prompt"]
          }
        }
      ]
    });
    
    console.log('Response status:', response.status);
    console.log('Response content:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
    
    return response.data;
  } catch (error) {
    console.error('Error with MCP:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Run the tests
async function runTests() {
  // First test direct image generation
  await testImageGeneration();
  
  // Then test MCP with tools
  await testMCPWithClaude();
}

runTests();