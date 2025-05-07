/**
 * Anthropic API Test
 * 
 * Tests the connection to Anthropic's API and basic functionality.
 */
require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

async function main() {
  // Check if Anthropic API key is available
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ Anthropic API Key not found in environment variables');
    console.log('Skipping Anthropic API test');
    return true; // Don't fail the test suite if API key isn't available
  }

  console.log('✅ Anthropic API Key available');
  
  try {
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    console.log('Testing Anthropic API connection...');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Say hello' }
      ]
    });
    
    console.log('✅ Response received from Anthropic API');
    console.log(`Content: "${response.content[0].text.trim().substring(0, 50)}..."`);
    
    return true;
  } catch (error) {
    console.error('❌ Error calling Anthropic API:', error.message);
    return false;
  }
}

// Run the test
main()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error in Anthropic test:', error);
    process.exit(1);
  });