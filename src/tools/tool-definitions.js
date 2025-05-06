/**
 * Definitions for tools that can be used with AI models
 * These follow the OpenAI function calling format which is compatible with both
 * OpenAI and Anthropic Claude models
 */

const toolDefinitions = {
  // Web tools
  webSearch: {
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
  
  webContent: {
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
  },
  
  webBatch: {
    name: "web_batch",
    description: "Retrieve content from multiple URLs in parallel",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Array of URLs to retrieve content from"
        },
        useCache: {
          type: "boolean",
          description: "Whether to use cached content if available",
          default: true
        }
      },
      required: ["urls"]
    }
  },
  
  // Image generation tools
  generateImage: {
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
          description: "Additional options for image generation",
          properties: {
            model: {
              type: "string",
              description: "For OpenAI: The model to use (dall-e-2 or dall-e-3)",
              default: "dall-e-3"
            },
            size: {
              type: "string",
              description: "For OpenAI: Image size (1024x1024, 512x512, etc.)",
              default: "1024x1024"
            },
            negativePrompt: {
              type: "string",
              description: "For Stability: What to avoid in the image",
              default: "low quality, blurry, distorted, deformed features"
            },
            steps: {
              type: "integer",
              description: "For Stability: Number of diffusion steps (higher = more detail but slower)",
              default: 30
            },
            width: {
              type: "integer",
              description: "For Stability: Image width",
              default: 1024
            },
            height: {
              type: "integer",
              description: "For Stability: Image height",
              default: 1024
            }
          }
        }
      },
      required: ["prompt"]
    }
  },
  
  editImage: {
    name: "edit_image",
    description: "Edit an existing image with a text prompt",
    parameters: {
      type: "object",
      properties: {
        imagePath: {
          type: "string",
          description: "Path to the image to edit"
        },
        prompt: {
          type: "string",
          description: "Text description of the desired edit"
        },
        maskPath: {
          type: "string",
          description: "Optional path to a mask image (transparent areas indicate where edits should be applied)"
        }
      },
      required: ["imagePath", "prompt"]
    }
  },
  
  createVariation: {
    name: "create_image_variation",
    description: "Create a variation of an existing image",
    parameters: {
      type: "object",
      properties: {
        imagePath: {
          type: "string",
          description: "Path to the image to create variations of"
        }
      },
      required: ["imagePath"]
    }
  }
};

// Get all tool definitions as an array
function getAllToolDefinitions() {
  return Object.values(toolDefinitions);
}

// Get a specific tool definition by name
function getToolDefinition(name) {
  return toolDefinitions[name];
}

module.exports = {
  toolDefinitions,
  getAllToolDefinitions,
  getToolDefinition
};