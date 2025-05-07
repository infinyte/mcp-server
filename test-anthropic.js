require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

// Check if Anthropic API key is available
console.log('Anthropic API Key available:', Boolean(process.env.ANTHROPIC_API_KEY));
console.log('API Key prefix:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 15) : 'None');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function main() {
  try {
    console.log('\nTesting Anthropic API...');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [
        { role: 'user', content: 'Say hello world' }
      ]
    });
    
    console.log('Response:', JSON.stringify(response, null, 2));
    console.log('Content:', response.content[0].text);
  } catch (error) {
    console.error('Error calling Anthropic API:', error.message);
    console.error('Details:', error);
  }
}

main();