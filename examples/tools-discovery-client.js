/**
 * MCP Server - Tools Discovery Client Example
 * 
 * This example demonstrates how to use the /tools/available endpoint
 * to discover and use available tools on the MCP server.
 */
const axios = require('axios');
const yaml = require('js-yaml');

// Server URL (defaults to localhost:3000)
const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const TOOLS_URL = `${SERVER_URL}/tools/available`;

/**
 * Discover available tools on the MCP server
 * @param {Object} options - Options for filtering tools
 * @returns {Promise<Object>} - Tools information
 */
async function discoverTools(options = {}) {
  try {
    const { format = 'json', category, search, provider, limit } = options;
    
    // Build query string
    const params = new URLSearchParams();
    if (format) params.append('format', format);
    if (category) params.append('category', category);
    if (search) params.append('search', search);
    if (provider) params.append('provider', provider);
    if (limit) params.append('limit', limit.toString());
    
    // Make request
    const url = `${TOOLS_URL}?${params.toString()}`;
    console.log(`Discovering tools from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Accept': format === 'yaml' ? 'text/yaml' : 'application/json'
      }
    });
    
    // Parse response based on format
    if (format === 'yaml') {
      return yaml.load(response.data);
    } else if (format === 'table' || format === 'html') {
      // Return as string for these formats
      return response.data;
    } else {
      // JSON format
      return response.data;
    }
  } catch (error) {
    console.error('Error discovering tools:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Call a tool endpoint based on discovered information
 * @param {Object} toolInfo - Tool information from discovery
 * @param {Object} parameters - Parameters to pass to the tool
 * @returns {Promise<Object>} - Tool response
 */
async function callTool(toolInfo, parameters) {
  try {
    if (!toolInfo.usage || !toolInfo.usage.endpoint) {
      throw new Error(`Tool ${toolInfo.name} doesn't have usage information`);
    }
    
    console.log(`Calling tool: ${toolInfo.name} (${toolInfo.usage.endpoint})`);
    console.log(`Parameters: ${JSON.stringify(parameters, null, 2)}`);
    
    const response = await axios({
      method: toolInfo.usage.method || 'POST',
      url: `${SERVER_URL}${toolInfo.usage.endpoint}`,
      data: parameters
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error calling tool ${toolInfo.name}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Main function to demonstrate tool discovery and usage
 */
async function main() {
  try {
    console.log('=== MCP Server Tools Discovery Demo ===\n');
    
    // 1. Discover all available tools
    console.log('Step 1: Discovering all available tools...');
    const allTools = await discoverTools();
    console.log(`Found ${allTools.count} tools across ${allTools.metadata.categories.length} categories\n`);
    
    // 2. Show categories
    console.log('Available categories:');
    allTools.metadata.categories.forEach(category => {
      console.log(`- ${category}`);
    });
    console.log();
    
    // 3. Filter tools by category (e.g., 'web')
    const category = 'web';
    console.log(`Step 2: Filtering tools by category '${category}'...`);
    const webTools = await discoverTools({ category });
    console.log(`Found ${webTools.count} tools in category '${category}':`);
    webTools.tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    console.log();
    
    // 4. Get detailed information about a specific tool
    const toolName = webTools.tools[0]?.name || 'web_search';
    console.log(`Step 3: Getting details for tool '${toolName}'...`);
    const toolDetails = await discoverTools({ search: toolName });
    
    if (toolDetails.count === 0) {
      console.log(`Tool '${toolName}' not found`);
      return;
    }
    
    const tool = toolDetails.tools[0];
    console.log(`Tool Details for '${tool.name}':`);
    console.log(`- Description: ${tool.description}`);
    console.log(`- Category: ${tool.category}`);
    console.log(`- Provider: ${tool.provider}`);
    console.log(`- Parameters:`);
    
    Object.entries(tool.parameters || {}).forEach(([name, details]) => {
      console.log(`  - ${name} (${details.type}): ${details.description}`);
      console.log(`    Required: ${details.required}, Default: ${details.default || 'None'}`);
    });
    console.log();
    
    // 5. Call the tool if it has usage information
    if (tool.usage && tool.usage.endpoint) {
      console.log(`Step 4: Using the '${tool.name}' tool...`);
      
      // Prepare parameters based on the tool
      const params = {};
      if (tool.name === 'web_search') {
        params.query = 'current weather';
        params.limit = 3;
      } else if (tool.name === 'web_content') {
        params.url = 'https://example.com';
      } else {
        // Default: Prepare parameters based on tool definition
        Object.entries(tool.parameters || {}).forEach(([name, details]) => {
          if (details.required) {
            // Set a default value based on type
            if (details.type === 'string') {
              params[name] = `test_${name}`;
            } else if (details.type === 'number') {
              params[name] = 1;
            } else if (details.type === 'boolean') {
              params[name] = true;
            }
          }
        });
      }
      
      try {
        const result = await callTool(tool, params);
        console.log('Tool Response:');
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Failed to call tool:', error.message);
      }
    } else {
      console.log(`Tool '${tool.name}' doesn't have usage information`);
    }
    
    // 6. Get tools in HTML format
    console.log('\nStep 5: Getting tools in HTML format...');
    const htmlOutput = await discoverTools({ format: 'html' });
    console.log('HTML output generated. First 200 characters:');
    console.log(htmlOutput.substring(0, 200) + '...');
    
    console.log('\nDemonstration complete!');
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
}

// Run the demo if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  discoverTools,
  callTool
};