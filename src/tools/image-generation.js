const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const sharp = require('sharp');
const dotenv = require('dotenv');

dotenv.config();

// Image storage directory
const imageDir = path.join(__dirname, '../../public/images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

/**
 * Generate an image using OpenAI DALL-E
 * @param {string} prompt - Text description of the desired image
 * @param {string} model - DALL-E model to use
 * @param {string} size - Image size (1024x1024, 512x512, etc.)
 * @returns {Promise<Object>} - Generated image data
 */
async function generateImageWithDALLE(prompt, model = 'dall-e-3', size = '1024x1024') {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      console.warn('OPENAI_API_KEY is not set in environment variables');
      return {
        success: false,
        error: 'OPENAI_API_KEY is not set in environment variables',
        prompt,
        model,
        size
      };
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model,
        prompt,
        n: 1,
        size,
        response_format: 'url'
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    const imageUrl = response.data.data[0].url;
    
    // Download and save the image
    const imageResponse = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    
    const timestamp = Date.now();
    const fileName = `dalle_${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(imageResponse.data));
    
    // Get a publicly accessible URL
    const publicUrl = `/images/${fileName}`;
    
    return {
      success: true,
      prompt,
      model,
      size,
      image_url: publicUrl,
      file_path: filePath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating image with DALL-E:', error);
    return {
      success: false,
      error: error.message,
      prompt,
      model,
      size
    };
  }
}

/**
 * Generate an image using Stable Diffusion API
 * @param {string} prompt - Text description of the desired image
 * @param {string} negativePrompt - What to avoid in the image
 * @param {number} steps - Number of diffusion steps
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Promise<Object>} - Generated image data
 */
async function generateImageWithStableDiffusion(
  prompt, 
  negativePrompt = 'low quality, blurry, distorted, deformed features', 
  steps = 30,
  width = 1024,
  height = 1024
) {
  try {
    const stabilityKey = process.env.STABILITY_API_KEY;
    
    if (!stabilityKey) {
      console.warn('STABILITY_API_KEY is not set in environment variables');
      return {
        success: false,
        error: 'STABILITY_API_KEY is not set in environment variables',
        prompt,
        negative_prompt: negativePrompt,
        steps,
        width,
        height
      };
    }
    
    const response = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        text_prompts: [
          {
            text: prompt,
            weight: 1
          },
          {
            text: negativePrompt,
            weight: -1
          }
        ],
        cfg_scale: 7,
        height,
        width,
        steps,
        samples: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${stabilityKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.data || !response.data.artifacts || !response.data.artifacts[0]) {
      throw new Error('Invalid response from Stability API');
    }
    
    const imageData = response.data.artifacts[0].base64;
    const timestamp = Date.now();
    const fileName = `sd_${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    
    // Get a publicly accessible URL
    const publicUrl = `/images/${fileName}`;
    
    return {
      success: true,
      prompt,
      negative_prompt: negativePrompt,
      steps,
      width,
      height,
      image_url: publicUrl,
      file_path: filePath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating image with Stable Diffusion:', error);
    return {
      success: false,
      error: error.message,
      prompt,
      negative_prompt: negativePrompt,
      steps,
      width,
      height
    };
  }
}

/**
 * Generate an image using available APIs, falling back if one fails
 * @param {string} prompt - Text description of the desired image
 * @param {string} provider - Preferred provider ('openai' or 'stability')
 * @param {object} options - Additional options for image generation
 * @returns {Promise<Object>} - Generated image data
 */
async function generateImage(
  prompt, 
  provider = 'openai', 
  options = {}
) {
  try {
    if (provider === 'openai') {
      const { model = 'dall-e-3', size = '1024x1024' } = options;
      return await generateImageWithDALLE(prompt, model, size);
    } else if (provider === 'stability') {
      const { 
        negativePrompt = 'low quality, blurry, distorted, deformed features',
        steps = 30,
        width = 1024,
        height = 1024
      } = options;
      
      return await generateImageWithStableDiffusion(prompt, negativePrompt, steps, width, height);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error(`Error generating image with ${provider}:`, error);
    
    // Try fallback if primary provider fails
    if (provider === 'openai') {
      console.log('Falling back to Stability AI...');
      const { 
        negativePrompt = 'low quality, blurry, distorted, deformed features',
        steps = 30,
        width = 1024,
        height = 1024
      } = options;
      
      return await generateImageWithStableDiffusion(prompt, negativePrompt, steps, width, height);
    } else if (provider === 'stability') {
      console.log('Falling back to OpenAI DALL-E...');
      const { model = 'dall-e-3', size = '1024x1024' } = options;
      return await generateImageWithDALLE(prompt, model, size);
    }
    
    return {
      success: false,
      error: error.message,
      prompt,
      provider
    };
  }
}

/**
 * Edit an existing image with a text prompt
 * @param {string} imagePath - Path to the image to edit
 * @param {string} prompt - Text description of the desired edit
 * @param {string} maskPath - Optional path to a mask image
 * @returns {Promise<Object>} - Edited image data
 */
async function editImage(imagePath, prompt, maskPath = null) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    // Resize and convert image to RGBA PNG (required by OpenAI API)
    const processedImagePath = path.join(imageDir, 'temp_edit_image.png');
    await sharp(imagePath)
      .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFormat('png')
      .toFile(processedImagePath);
    
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('image', fs.createReadStream(processedImagePath));
    
    if (maskPath && fs.existsSync(maskPath)) {
      // Process mask if provided
      const processedMaskPath = path.join(imageDir, 'temp_mask_image.png');
      await sharp(maskPath)
        .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFormat('png')
        .toFile(processedMaskPath);
      
      form.append('mask', fs.createReadStream(processedMaskPath));
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/images/edits',
      form,
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          ...form.getHeaders()
        }
      }
    );
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    const imageUrl = response.data.data[0].url;
    
    // Download and save the image
    const imageResponse = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    
    const timestamp = Date.now();
    const fileName = `edit_${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(imageResponse.data));
    
    // Clean up temporary files
    if (fs.existsSync(processedImagePath)) {
      fs.unlinkSync(processedImagePath);
    }
    
    if (maskPath && fs.existsSync(path.join(imageDir, 'temp_mask_image.png'))) {
      fs.unlinkSync(path.join(imageDir, 'temp_mask_image.png'));
    }
    
    // Get a publicly accessible URL
    const publicUrl = `/images/${fileName}`;
    
    return {
      success: true,
      prompt,
      original_image: imagePath,
      mask_image: maskPath,
      edited_image_url: publicUrl,
      file_path: filePath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error editing image:', error);
    return {
      success: false,
      error: error.message,
      prompt,
      original_image: imagePath,
      mask_image: maskPath
    };
  }
}

/**
 * Create a variation of an existing image
 * @param {string} imagePath - Path to the image to create variations of
 * @returns {Promise<Object>} - Variation image data
 */
async function createImageVariation(imagePath) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    // Resize and convert image to RGBA PNG (required by OpenAI API)
    const processedImagePath = path.join(imageDir, 'temp_variation_image.png');
    await sharp(imagePath)
      .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFormat('png')
      .toFile(processedImagePath);
    
    const form = new FormData();
    form.append('image', fs.createReadStream(processedImagePath));
    
    const response = await axios.post(
      'https://api.openai.com/v1/images/variations',
      form,
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          ...form.getHeaders()
        }
      }
    );
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    const imageUrl = response.data.data[0].url;
    
    // Download and save the image
    const imageResponse = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    
    const timestamp = Date.now();
    const fileName = `variation_${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(imageResponse.data));
    
    // Clean up temporary files
    if (fs.existsSync(processedImagePath)) {
      fs.unlinkSync(processedImagePath);
    }
    
    // Get a publicly accessible URL
    const publicUrl = `/images/${fileName}`;
    
    return {
      success: true,
      original_image: imagePath,
      variation_image_url: publicUrl,
      file_path: filePath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error creating image variation:', error);
    return {
      success: false,
      error: error.message,
      original_image: imagePath
    };
  }
}

module.exports = {
  generateImage,
  generateImageWithDALLE,
  generateImageWithStableDiffusion,
  editImage,
  createImageVariation
};