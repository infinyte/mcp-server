require('dotenv').config();
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Check if OpenAI API key is available
console.log('OpenAI API Key available:', Boolean(process.env.OPENAI_API_KEY));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateImage() {
  try {
    console.log('Generating image with DALL-E...');
    console.log('Using API key:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'None');
    
    // Try with DALL-E 2 which might have different requirements
    const response = await openai.images.generate({
      model: 'dall-e-2',
      prompt: 'A cute golden retriever puppy playing in a park on a sunny day',
      n: 1,
      size: '1024x1024'
    });
    
    console.log('Image generated successfully');
    console.log('Image URL:', response.data[0].url);
    
    // Download the image
    const imageUrl = response.data[0].url;
    const imageResponse = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    
    // Save the image
    const imageDir = path.join(__dirname, 'public/images');
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const fileName = `direct_test_${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(imageResponse.data));
    
    console.log('Image saved to:', filePath);
    
    return {
      success: true,
      image_url: `/images/${fileName}`,
      file_path: filePath
    };
  } catch (error) {
    console.error('Error generating image:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
generateImage();