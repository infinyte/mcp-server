require('dotenv').config();
const OpenAI = require('openai');

// Check if OpenAI API key is available
console.log('OpenAI API Key available:', Boolean(process.env.OPENAI_API_KEY));
console.log('API Key prefix:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 12) : 'None');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // First test a simple chat completion to verify API key works
  try {
    console.log('\nTesting chat completion...');
    
    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hello world' }],
      model: 'gpt-3.5-turbo',
    });
    
    console.log('Chat response:', chatCompletion.choices[0].message.content);
    console.log('API works for chat completions!');
  } catch (error) {
    console.error('Error with chat completion:', error.message);
    if (error.response) {
      console.error(error.response.data);
    }
  }
  
  // Then test image generation
  try {
    console.log('\nTesting image generation...');
    
    const response = await openai.images.generate({
      prompt: 'A cute dog',
      n: 1,
      size: '256x256',
    });
    
    console.log('Image URL:', response.data[0].url);
    console.log('API works for image generation!');
  } catch (error) {
    console.error('Error with image generation:', error.message);
    if (error.response) {
      console.error(error.response.data);
    }
  }
}

main();