/**
 * Example client for using the image generation tools
 */
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const BASE_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

// Sample queries to demonstrate image generation tools
async function testImageTools() {
  console.log('Testing Image Generation Tools...');
  
  // First, let's test direct image generation
  console.log('\n--- Testing Direct Image Generation ---');
  
  try {
    const imageResponse = await fetch(`${BASE_URL}/tools/image/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'A scenic mountain landscape with a waterfall and a rainbow',
        provider: 'openai',
        options: {
          model: 'dall-e-3',
          size: '1024x1024'
        }
      }),
    });
    
    if (!imageResponse.ok) {
      const errorData = await imageResponse.json();
      console.error('Error generating image:', errorData.error);
      console.log('You may need to set the OPENAI_API_KEY in your .env file');
    } else {
      const imageData = await imageResponse.json();
      console.log('Image Generation Result:');
      console.log(`Image URL: ${imageData.image_url}`);
      console.log(`File Path: ${imageData.file_path}`);
    }
  } catch (error) {
    console.error('Error calling image generation API:', error.message);
  }
  
  // Now let's test image generation via MCP with tools
  console.log('\n--- Testing MCP With Image Tools ---');
  
  try {
    const anthropicResponse = await fetch(`${BASE_URL}/mcp/anthropic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Generate an image of a cute robot taking a selfie in a national park' }
        ],
        model: 'claude-3-sonnet-20240229',
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
                },
                options: {
                  type: "object",
                  description: "Additional options for image generation"
                }
              },
              required: ["prompt"]
            }
          }
        ]
      }),
    });
    
    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.json();
      console.error('Error using MCP with image tools:', errorData.error);
    } else {
      const anthropicData = await anthropicResponse.json();
      console.log('Anthropic Response with Image Generation:');
      console.log(JSON.stringify(anthropicData, null, 2));
    }
  } catch (error) {
    console.error('Error calling MCP with image tools:', error.message);
  }
}

// Run the test
testImageTools().catch(console.error);