const { ToolDefinition, Configuration, ToolExecution } = require('../models');
const { connectDB, closeDB } = require('../config/database');
const { migrateToolDefinitions, initializeConfigurations } = require('../config/initDB');

/**
 * In-memory fallback store when MongoDB is unavailable
 */
class InMemoryStore {
  constructor() {
    this.tools = new Map();
    this.configurations = new Map();
    this.executions = [];
  }
  
  // Tool methods
  async getAllTools(options = {}) {
    let tools = Array.from(this.tools.values());
    
    // Apply filters
    if (options.category) {
      tools = tools.filter(tool => tool.category === options.category);
    }
    
    if (options.enabledOnly) {
      tools = tools.filter(tool => tool.enabled);
    }
    
    return tools;
  }
  
  async getToolByName(name) {
    return this.tools.get(name) || null;
  }
  
  async saveToolDefinition(toolDefinition) {
    const tool = {
      ...toolDefinition,
      metadata: {
        ...(toolDefinition.metadata || {}),
        updatedAt: new Date()
      }
    };
    
    if (!tool.metadata.createdAt) {
      tool.metadata.createdAt = new Date();
    }
    
    this.tools.set(tool.name, tool);
    return tool;
  }
  
  async deleteToolDefinition(name) {
    const had = this.tools.has(name);
    this.tools.delete(name);
    return had;
  }
  
  // Configuration methods
  async getConfiguration(key) {
    return this.configurations.get(key) || null;
  }
  
  async updateConfiguration(key, value, encrypt = true) {
    const config = {
      key,
      value,
      isEncrypted: encrypt,
      metadata: {
        updatedAt: new Date()
      }
    };
    
    this.configurations.set(key, config);
    return config;
  }
  
  async getConfigurationsByCategory(category) {
    return Array.from(this.configurations.values())
      .filter(config => config.category === category);
  }
  
  // Execution methods
  async logToolExecution(executionData) {
    const execution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      toolName: executionData.toolName,
      provider: executionData.provider || 'direct',
      sessionId: executionData.sessionId,
      inputs: executionData.inputs || {},
      status: 'pending',
      metadata: {
        ipAddress: executionData.ipAddress,
        userAgent: executionData.userAgent,
        userId: executionData.userId,
        timestamp: new Date(),
        modelName: executionData.modelName
      }
    };
    
    this.executions.push(execution);
    
    // Keep only the last 100 executions
    if (this.executions.length > 100) {
      this.executions.shift();
    }
    
    return {
      complete: async (result, error) => {
        execution.executionTime = Date.now() - execution.metadata.timestamp;
        
        if (error) {
          execution.status = 'failure';
          execution.errorMessage = error.message || String(error);
        } else {
          execution.status = 'success';
          execution.outputs = result;
        }
        
        return execution;
      }
    };
  }
  
  async getToolExecutionStats(options = {}) {
    const { period = 'day', toolName, limit = 10 } = options;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case 'hour':
        startDate.setHours(now.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 1);
    }
    
    // Filter executions by date and toolName
    const filteredExecutions = this.executions.filter(exec => {
      const matchesDate = exec.metadata.timestamp >= startDate;
      const matchesTool = !toolName || exec.toolName === toolName;
      return matchesDate && matchesTool;
    });
    
    // Count stats
    const totalCount = filteredExecutions.length;
    const successCount = filteredExecutions.filter(exec => exec.status === 'success').length;
    const failureCount = filteredExecutions.filter(exec => exec.status === 'failure').length;
    
    // Get top tools
    const toolCounts = {};
    filteredExecutions.forEach(exec => {
      toolCounts[exec.toolName] = (toolCounts[exec.toolName] || 0) + 1;
    });
    
    const topTools = Object.entries(toolCounts)
      .map(([name, count]) => ({ _id: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    // Calculate average execution times
    const toolExecutionTimes = {};
    const successfulExecutions = filteredExecutions.filter(exec => exec.status === 'success');
    
    successfulExecutions.forEach(exec => {
      if (!toolExecutionTimes[exec.toolName]) {
        toolExecutionTimes[exec.toolName] = {
          total: 0,
          count: 0
        };
      }
      
      toolExecutionTimes[exec.toolName].total += exec.executionTime || 0;
      toolExecutionTimes[exec.toolName].count += 1;
    });
    
    const executionTimes = Object.entries(toolExecutionTimes)
      .map(([name, data]) => ({
        _id: name,
        avgTime: data.count > 0 ? data.total / data.count : 0
      }))
      .sort((a, b) => a.avgTime - b.avgTime);
    
    return {
      period,
      totalCount,
      successCount,
      failureCount,
      successRate: totalCount > 0 ? (successCount / totalCount * 100).toFixed(2) + '%' : '0%',
      topTools,
      executionTimes
    };
  }
}

/**
 * Database service to provide a clean API for database operations
 */
class DatabaseService {
  constructor() {
    this.isInitialized = false;
    this.isConnected = false;
    this.useFallback = false;
    this.fallbackStore = new InMemoryStore();
  }
  
  /**
   * Initialize the database connection and setup
   * @param {Object} options - Initialization options
   * @param {Array} options.tools - Array of existing tool definitions to migrate
   * @param {boolean} options.allowFallback - Whether to use the in-memory fallback if MongoDB is unavailable
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    if (this.isInitialized) {
      return true;
    }
    
    const allowFallback = options.allowFallback !== false; // Default to true
    
    try {
      // Try to connect to MongoDB
      try {
        await connectDB();
        this.isConnected = true;
        console.log('✅ Connected to MongoDB database');
        
        // Initialize configurations from environment
        await initializeConfigurations();
        
        // Migrate tool definitions if provided
        if (options.tools && Array.isArray(options.tools)) {
          await migrateToolDefinitions(options.tools);
        }
      } catch (dbError) {
        // If MongoDB connection fails and fallback is allowed
        if (allowFallback) {
          console.warn(`⚠️ MongoDB connection failed: ${dbError.message}`);
          console.warn('⚠️ Using in-memory fallback store (data will not persist between restarts)');
          this.useFallback = true;
          
          // Initialize in-memory store with tool definitions
          if (options.tools && Array.isArray(options.tools)) {
            for (const tool of options.tools) {
              await this.fallbackStore.saveToolDefinition({
                name: tool.name,
                description: tool.description,
                version: '1.0.0',
                category: tool.name.includes('web_') ? 'web' : 
                          tool.name.includes('image') ? 'image' : 'custom',
                parameters: tool.parameters,
                enabled: true,
                implementation: 'internal',
                metadata: {
                  createdBy: 'system',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              });
            }
            console.log(`✅ Loaded ${options.tools.length} tools into in-memory store`);
          }
          
          // Store environment variables as configurations
          const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'STABILITY_API_KEY'];
          for (const key of envKeys) {
            if (process.env[key]) {
              await this.fallbackStore.updateConfiguration(key, process.env[key], true);
            }
          }
        } else {
          // If fallback is not allowed, propagate the error
          throw dbError;
        }
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
    if (this.useFallback) {
      return this.fallbackStore.getAllTools(options);
    }
    
    try {
      await this.ensureConnection();
      
      const query = {};
      
      if (options.category) {
        query.category = options.category;
      }
      
      if (options.enabledOnly) {
        query.enabled = true;
      }
      
      return ToolDefinition.find(query).sort({ name: 1 });
    } catch (error) {
      console.warn(`Error getting tools from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.getAllTools(options);
    }
  }
  
  /**
   * Get a tool definition by name
   * @param {string} name - Tool name
   * @returns {Promise<Object>} Tool definition
   */
  async getToolByName(name) {
    if (this.useFallback) {
      return this.fallbackStore.getToolByName(name);
    }
    
    try {
      await this.ensureConnection();
      return ToolDefinition.findOne({ name });
    } catch (error) {
      console.warn(`Error getting tool from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.getToolByName(name);
    }
  }
  
  /**
   * Create or update a tool definition
   * @param {Object} toolDefinition - Tool definition data
   * @returns {Promise<Object>} Saved tool definition
   */
  async saveToolDefinition(toolDefinition) {
    if (this.useFallback) {
      return this.fallbackStore.saveToolDefinition(toolDefinition);
    }
    
    try {
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
    } catch (error) {
      console.warn(`Error saving tool to database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.saveToolDefinition(toolDefinition);
    }
  }
  
  /**
   * Delete a tool definition
   * @param {string} name - Tool name
   * @returns {Promise<boolean>} Success status
   */
  async deleteToolDefinition(name) {
    if (this.useFallback) {
      return this.fallbackStore.deleteToolDefinition(name);
    }
    
    try {
      await this.ensureConnection();
      const result = await ToolDefinition.deleteOne({ name });
      return result.deletedCount > 0;
    } catch (error) {
      console.warn(`Error deleting tool from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.deleteToolDefinition(name);
    }
  }
  
  /**
   * Log a tool execution
   * @param {Object} executionData - Tool execution data
   * @returns {Promise<Object>} Log completion function
   */
  async logToolExecution(executionData) {
    if (this.useFallback) {
      return this.fallbackStore.logToolExecution(executionData);
    }
    
    try {
      await this.ensureConnection();
      return ToolExecution.logExecution(executionData);
    } catch (error) {
      console.warn(`Error logging execution to database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.logToolExecution(executionData);
    }
  }
  
  /**
   * Get tool execution statistics
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Execution statistics
   */
  async getToolExecutionStats(options = {}) {
    if (this.useFallback) {
      return this.fallbackStore.getToolExecutionStats(options);
    }
    
    try {
      await this.ensureConnection();
      return ToolExecution.getStats(options);
    } catch (error) {
      console.warn(`Error getting execution stats from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.getToolExecutionStats(options);
    }
  }
  
  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @param {boolean} decrypt - Whether to decrypt the value
   * @returns {Promise<string>} Configuration value
   */
  async getConfiguration(key, decrypt = true) {
    if (this.useFallback) {
      return this.fallbackStore.getConfiguration(key);
    }
    
    try {
      await this.ensureConnection();
      
      const config = await Configuration.getByKey(key);
      
      if (!config) {
        return null;
      }
      
      return decrypt && config.isEncrypted ? config.getDecryptedValue() : config.value;
    } catch (error) {
      console.warn(`Error getting configuration from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.getConfiguration(key);
    }
  }
  
  /**
   * Update a configuration value
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @param {boolean} encrypt - Whether to encrypt the value
   * @returns {Promise<Object>} Updated configuration
   */
  async updateConfiguration(key, value, encrypt = true) {
    if (this.useFallback) {
      return this.fallbackStore.updateConfiguration(key, value, encrypt);
    }
    
    try {
      await this.ensureConnection();
      return Configuration.updateConfig(key, value, encrypt);
    } catch (error) {
      console.warn(`Error updating configuration in database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.updateConfiguration(key, value, encrypt);
    }
  }
  
  /**
   * Get all configurations by category
   * @param {string} category - Configuration category
   * @returns {Promise<Array>} Configurations
   */
  async getConfigurationsByCategory(category) {
    if (this.useFallback) {
      return this.fallbackStore.getConfigurationsByCategory(category);
    }
    
    try {
      await this.ensureConnection();
      return Configuration.getAllByCategory(category);
    } catch (error) {
      console.warn(`Error getting configurations from database: ${error.message}`);
      console.warn('Falling back to in-memory store');
      return this.fallbackStore.getConfigurationsByCategory(category);
    }
  }
  
  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.useFallback) {
      this.isInitialized = false;
      return;
    }
    
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
    if (this.useFallback) {
      throw new Error('Database connection is not available, using fallback store');
    }
    
    if (!this.isConnected) {
      await connectDB();
      this.isConnected = true;
    }
  }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;