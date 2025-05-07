const { ToolDefinition, Configuration, ToolExecution } = require('../models');
const { connectDB, closeDB } = require('../config/database');
const { migrateToolDefinitions, initializeConfigurations } = require('../config/initDB');

/**
 * Database service to provide a clean API for database operations
 */
class DatabaseService {
  constructor() {
    this.isInitialized = false;
    this.isConnected = false;
  }
  
  /**
   * Initialize the database connection and setup
   * @param {Object} options - Initialization options
   * @param {Array} options.tools - Array of existing tool definitions to migrate
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    if (this.isInitialized) {
      return true;
    }
    
    try {
      // Connect to MongoDB
      await connectDB();
      this.isConnected = true;
      
      // Initialize configurations from environment
      await initializeConfigurations();
      
      // Migrate tool definitions if provided
      if (options.tools && Array.isArray(options.tools)) {
        await migrateToolDefinitions(options.tools);
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize database service:', error.message);
      return false;
    }
  }
  
  /**
   * Get all tool definitions
   * @param {Object} options - Query options
   * @param {string} options.category - Filter by category
   * @param {boolean} options.enabledOnly - Only return enabled tools
   * @returns {Promise<Array>} Tool definitions
   */
  async getAllTools(options = {}) {
    await this.ensureConnection();
    
    const query = {};
    
    if (options.category) {
      query.category = options.category;
    }
    
    if (options.enabledOnly) {
      query.enabled = true;
    }
    
    return ToolDefinition.find(query).sort({ name: 1 });
  }
  
  /**
   * Get a tool definition by name
   * @param {string} name - Tool name
   * @returns {Promise<Object>} Tool definition
   */
  async getToolByName(name) {
    await this.ensureConnection();
    return ToolDefinition.findOne({ name });
  }
  
  /**
   * Create or update a tool definition
   * @param {Object} toolDefinition - Tool definition data
   * @returns {Promise<Object>} Saved tool definition
   */
  async saveToolDefinition(toolDefinition) {
    await this.ensureConnection();
    
    // Check if tool already exists
    const existingTool = await ToolDefinition.findOne({ name: toolDefinition.name });
    
    if (existingTool) {
      // Update existing tool
      Object.assign(existingTool, toolDefinition);
      return existingTool.save();
    } else {
      // Create new tool
      return ToolDefinition.create(toolDefinition);
    }
  }
  
  /**
   * Delete a tool definition
   * @param {string} name - Tool name
   * @returns {Promise<boolean>} Success status
   */
  async deleteToolDefinition(name) {
    await this.ensureConnection();
    const result = await ToolDefinition.deleteOne({ name });
    return result.deletedCount > 0;
  }
  
  /**
   * Log a tool execution
   * @param {Object} executionData - Tool execution data
   * @returns {Promise<Object>} Log completion function
   */
  async logToolExecution(executionData) {
    await this.ensureConnection();
    return ToolExecution.logExecution(executionData);
  }
  
  /**
   * Get tool execution statistics
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Execution statistics
   */
  async getToolExecutionStats(options = {}) {
    await this.ensureConnection();
    return ToolExecution.getStats(options);
  }
  
  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @param {boolean} decrypt - Whether to decrypt the value
   * @returns {Promise<string>} Configuration value
   */
  async getConfiguration(key, decrypt = true) {
    await this.ensureConnection();
    
    const config = await Configuration.getByKey(key);
    
    if (!config) {
      return null;
    }
    
    return decrypt && config.isEncrypted ? config.getDecryptedValue() : config.value;
  }
  
  /**
   * Update a configuration value
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @param {boolean} encrypt - Whether to encrypt the value
   * @returns {Promise<Object>} Updated configuration
   */
  async updateConfiguration(key, value, encrypt = true) {
    await this.ensureConnection();
    return Configuration.updateConfig(key, value, encrypt);
  }
  
  /**
   * Get all configurations by category
   * @param {string} category - Configuration category
   * @returns {Promise<Array>} Configurations
   */
  async getConfigurationsByCategory(category) {
    await this.ensureConnection();
    return Configuration.getAllByCategory(category);
  }
  
  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.isConnected) {
      await closeDB();
      this.isConnected = false;
      this.isInitialized = false;
    }
  }
  
  /**
   * Ensure database connection is established
   * @returns {Promise<void>}
   */
  async ensureConnection() {
    if (!this.isConnected) {
      await connectDB();
      this.isConnected = true;
    }
  }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;