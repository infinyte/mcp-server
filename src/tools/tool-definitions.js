/**
 * Definitions for tools that can be used with AI models
 * These follow the OpenAI function calling format which is compatible with both
 * OpenAI and Anthropic Claude models
 */

const toolDefinitions = {
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