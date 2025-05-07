const { ToolDefinition, Configuration } = require('../models');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * Migrate current tool definitions from memory to database
 * @param {Array} existingTools - Array of existing tool definitions from memory
 */
async function migrateToolDefinitions(existingTools) {
  console.log('🔄 Migrating tool definitions to database...');
  
  try {
    // Get existing tools from the database
    const existingDbTools = await ToolDefinition.find({});
    const existingDbToolNames = new Set(existingDbTools.map(tool => tool.name));
    
    // Transform tools array into proper format
    for (const tool of existingTools) {
      // Skip if tool already exists in the database
      if (existingDbToolNames.has(tool.name)) {
        console.log(`⏩ Tool "${tool.name}" already exists in database, skipping.`);
        continue;
      }
      
      // Create a new tool definition
      console.log(`➕ Adding tool "${tool.name}" to database...`);
      
      // Determine the tool category from the name
      let category = 'custom';
      if (tool.name.includes('web_')) {
        category = 'web';
      } else if (tool.name.includes('generate_image') || tool.name.includes('edit_image')) {
        category = 'image';
      } else if (tool.name.includes('file_') || tool.name.includes('read_')) {
        category = 'file';
      } else if (tool.name.includes('data_')) {
        category = 'data';
      }
      
      // Create the tool in database
      await ToolDefinition.create({
        name: tool.name,
        description: tool.description,
        version: '1.0.0',
        category,
        parameters: {
          type: 'object',
          properties: mapParameterProperties(tool.parameters.properties),
          required: tool.parameters.required || []
        },
        implementation: 'internal',
        enabled: true,
        metadata: {
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
    
    console.log('✅ Tool definitions migration complete');
    return true;
  } catch (error) {
    console.error('❌ Error migrating tool definitions:', error.message);
    return false;
  }
}

/**
 * Helper function to map parameter properties to the database schema format
 * @param {Object} properties - Tool parameter properties
 * @returns {Object} Mapped properties
 */
function mapParameterProperties(properties) {
  const mappedProperties = {};
  
  for (const [key, prop] of Object.entries(properties)) {
    mappedProperties[key] = {
      type: prop.type,
      description: prop.description
    };
    
    // Add optional properties if they exist
    if (prop.default !== undefined) mappedProperties[key].default = prop.default;
    if (prop.enum) mappedProperties[key].enum = prop.enum;
    if (prop.format) mappedProperties[key].format = prop.format;
    if (prop.minimum !== undefined) mappedProperties[key].minimum = prop.minimum;
    if (prop.maximum !== undefined) mappedProperties[key].maximum = prop.maximum;
    if (prop.minLength !== undefined) mappedProperties[key].minLength = prop.minLength;
    if (prop.maxLength !== undefined) mappedProperties[key].maxLength = prop.maxLength;
    if (prop.pattern) mappedProperties[key].pattern = prop.pattern;
    
    // Handle nested array items
    if (prop.items) {
      mappedProperties[key].items = prop.items;
    }
    
    // Handle nested object properties
    if (prop.properties) {
      mappedProperties[key].properties = mapParameterProperties(prop.properties);
      if (prop.required) mappedProperties[key].required = prop.required;
    }
  }
  
  return mappedProperties;
}

/**
 * Initialize configurations from environment variables
 */
async function initializeConfigurations() {
  console.log('🔄 Initializing configurations from environment...');
  
  try {
    // List of API keys to initialize
    const apiKeys = [
      { key: 'ANTHROPIC_API_KEY', description: 'API key for Anthropic Claude models' },
      { key: 'OPENAI_API_KEY', description: 'API key for OpenAI GPT and DALL-E models' },
      { key: 'STABILITY_API_KEY', description: 'API key for Stability AI models' }
    ];
    
    // List of server configurations
    const serverConfigs = [
      { key: 'PORT', value: process.env.PORT || '3000', description: 'Port for the MCP server', isEncrypted: false },
      { key: 'LOG_LEVEL', value: process.env.LOG_LEVEL || 'info', description: 'Logging level', isEncrypted: false },
      { key: 'NODE_ENV', value: process.env.NODE_ENV || 'development', description: 'Node environment', isEncrypted: false }
    ];
    
    // Initialize API keys
    for (const apiKeyConfig of apiKeys) {
      const { key, description } = apiKeyConfig;
      
      if (process.env[key]) {
        await Configuration.updateConfig(key, process.env[key], true);
        console.log(`✅ Saved API key: ${key}`);
      } else {
        console.log(`⚠️ API key not set in environment: ${key}`);
      }
    }
    
    // Initialize server configurations
    for (const config of serverConfigs) {
      await Configuration.updateConfig(
        config.key, 
        config.value || process.env[config.key], 
        config.isEncrypted
      );
      console.log(`✅ Saved configuration: ${config.key}`);
    }
    
    console.log('✅ Configurations initialization complete');
    return true;
  } catch (error) {
    console.error('❌ Error initializing configurations:', error.message);
    return false;
  }
}

module.exports = {
  migrateToolDefinitions,
  initializeConfigurations
};