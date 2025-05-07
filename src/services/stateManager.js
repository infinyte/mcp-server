/**
 * State Manager for MCP Server
 * 
 * Provides a central management system for application state with:
 * - In-memory cache with database synchronization
 * - State tracking and change detection
 * - Event-based state update notifications
 */
const databaseService = require('./database');
const EventEmitter = require('events');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.dirtyState = false;
    
    // State containers
    this.state = {
      tools: new Map(),           // Tool definitions
      toolExecutions: new Map(),  // Recent tool executions
      configurations: new Map(),  // System configurations
      statistics: {},             // Usage statistics
      status: {
        dbConnected: false,
        useFallback: false,
        lastSync: null,
        changeSinceSync: false
      }
    };
    
    // Bind methods
    this.saveStateToDb = this.saveStateToDb.bind(this);
    
    // Setup regular sync interval (every 5 minutes)
    this.syncInterval = null;
  }
  
  /**
   * Initialize the state manager
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }
    
    // Set sync interval (default: 5 minutes)
    const syncIntervalMs = options.syncIntervalMs || 5 * 60 * 1000;
    
    try {
      // Load state from database
      await this.loadStateFromDb();
      
      // Start sync interval
      this.syncInterval = setInterval(this.saveStateToDb, syncIntervalMs);
      
      // Register shutdown handler if not testing
      if (!options.testing) {
        process.on('SIGINT', this.handleShutdown.bind(this));
        process.on('SIGTERM', this.handleShutdown.bind(this));
      }
      
      this.initialized = true;
      this.emit('initialized');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize state manager:', error);
      
      // Still mark as initialized even if DB sync fails
      // This will make us operate with the default empty state
      this.initialized = true;
      this.emit('initialization_error', error);
      
      return false;
    }
  }
  
  /**
   * Load state from database
   * @returns {Promise<void>}
   */
  async loadStateFromDb() {
    try {
      this.state.status.dbConnected = databaseService.isConnected;
      this.state.status.useFallback = databaseService.useFallback;
      
      // Load tools from database
      const tools = await databaseService.getAllTools();
      tools.forEach(tool => {
        this.state.tools.set(tool.name, tool);
      });
      
      // Get configurations
      const apiConfigs = await databaseService.getConfigurationsByCategory('api_key');
      const serverConfigs = await databaseService.getConfigurationsByCategory('server');
      
      // Combine configurations
      [...(apiConfigs || []), ...(serverConfigs || [])].forEach(config => {
        if (config && config.key) {
          this.state.configurations.set(config.key, config);
        }
      });
      
      // Load recent executions
      const stats = await databaseService.getToolExecutionStats({ period: 'day', limit: 50 });
      this.state.statistics = stats || {};
      
      this.state.status.lastSync = new Date();
      this.state.status.changeSinceSync = false;
      
      this.emit('state_loaded');
    } catch (error) {
      console.error('Error loading state from database:', error);
      this.emit('load_error', error);
      
      // Continue with empty state
      this.state.status.lastSync = null;
    }
  }
  
  /**
   * Save state to database
   * @returns {Promise<boolean>} Success status
   */
  async saveStateToDb() {
    // Only save if changes have been made since last sync
    if (!this.state.status.changeSinceSync && this.state.status.lastSync) {
      return true;
    }
    
    try {
      // Don't attempt to save to DB if we're in fallback mode
      if (databaseService.useFallback) {
        this.state.status.lastSync = new Date();
        this.state.status.changeSinceSync = false;
        return true;
      }
      
      console.log('Saving state to database...');
      
      // Save tools
      for (const [name, tool] of this.state.tools.entries()) {
        if (tool._dirty) {
          await databaseService.saveToolDefinition(tool);
          tool._dirty = false;
        }
      }
      
      // Save configurations
      for (const [key, config] of this.state.configurations.entries()) {
        if (config._dirty) {
          await databaseService.updateConfiguration(
            key, 
            config.value, 
            config.isEncrypted
          );
          config._dirty = false;
        }
      }
      
      this.state.status.lastSync = new Date();
      this.state.status.changeSinceSync = false;
      
      this.emit('state_saved');
      return true;
    } catch (error) {
      console.error('Error saving state to database:', error);
      this.emit('save_error', error);
      return false;
    }
  }
  
  /**
   * Handle application shutdown
   */
  async handleShutdown() {
    console.log('State Manager: Handling shutdown, saving state...');
    
    // Clear the sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Force save to database
    await this.saveStateToDb();
    
    this.emit('shutdown_complete');
  }
  
  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {Object|null} Tool definition or null if not found
   */
  async getTool(name) {
    // Check in-memory cache first
    if (this.state.tools.has(name)) {
      return this.state.tools.get(name);
    }
    
    // Try to get from database
    try {
      const tool = await databaseService.getToolByName(name);
      
      if (tool) {
        // Update cache
        this.state.tools.set(name, tool);
        return tool;
      }
    } catch (error) {
      console.warn(`Error getting tool "${name}" from database:`, error.message);
    }
    
    return null;
  }
  
  /**
   * Get all tools
   * @param {Object} options - Filter options
   * @returns {Array} Array of tool definitions
   */
  async getAllTools(options = {}) {
    // If we don't have any cached tools or need a filtered set, go to DB
    if (this.state.tools.size === 0 || options.category || options.enabledOnly) {
      try {
        const tools = await databaseService.getAllTools(options);
        
        // Update cache with any tools we don't have
        tools.forEach(tool => {
          if (!this.state.tools.has(tool.name)) {
            this.state.tools.set(tool.name, tool);
          }
        });
        
        return tools;
      } catch (error) {
        console.warn('Error getting tools from database:', error.message);
        
        // Fall back to filtering in-memory cache
        let tools = Array.from(this.state.tools.values());
        
        if (options.category) {
          tools = tools.filter(tool => tool.category === options.category);
        }
        
        if (options.enabledOnly) {
          tools = tools.filter(tool => tool.enabled);
        }
        
        return tools;
      }
    }
    
    // Return from cache
    let tools = Array.from(this.state.tools.values());
    
    // Apply filters
    if (options.category) {
      tools = tools.filter(tool => tool.category === options.category);
    }
    
    if (options.enabledOnly) {
      tools = tools.filter(tool => tool.enabled);
    }
    
    return tools;
  }
  
  /**
   * Save a tool definition
   * @param {Object} toolDefinition - Tool definition to save
   * @returns {Promise<Object>} Saved tool
   */
  async saveTool(toolDefinition) {
    if (!toolDefinition || !toolDefinition.name) {
      throw new Error('Tool definition must have a name');
    }
    
    // Mark as dirty for database sync
    toolDefinition._dirty = true;
    
    // Update metadata
    if (!toolDefinition.metadata) {
      toolDefinition.metadata = {};
    }
    
    toolDefinition.metadata.updatedAt = new Date();
    
    // Add to cache
    this.state.tools.set(toolDefinition.name, toolDefinition);
    
    // Mark state as changed
    this.state.status.changeSinceSync = true;
    
    // Try to save to database immediately
    try {
      const savedTool = await databaseService.saveToolDefinition(toolDefinition);
      
      // If save was successful, update cache and clear dirty flag
      if (savedTool) {
        savedTool._dirty = false;
        this.state.tools.set(savedTool.name, savedTool);
        return savedTool;
      }
    } catch (error) {
      console.warn(`Error saving tool "${toolDefinition.name}" to database:`, error.message);
      // Continue with in-memory only
    }
    
    return toolDefinition;
  }
  
  /**
   * Delete a tool
   * @param {string} name - Tool name
   * @returns {Promise<boolean>} Success status
   */
  async deleteTool(name) {
    // Remove from cache
    const hadTool = this.state.tools.delete(name);
    
    // Mark state as changed
    if (hadTool) {
      this.state.status.changeSinceSync = true;
    }
    
    // Try to delete from database
    try {
      await databaseService.deleteToolDefinition(name);
      return true;
    } catch (error) {
      console.warn(`Error deleting tool "${name}" from database:`, error.message);
      return hadTool;
    }
  }
  
  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @param {boolean} decrypt - Whether to decrypt the value
   * @returns {Promise<string>} Configuration value
   */
  async getConfig(key, decrypt = true) {
    // Check cache first
    if (this.state.configurations.has(key)) {
      const config = this.state.configurations.get(key);
      
      // For encrypted values, use the database service to decrypt
      if (decrypt && config.isEncrypted) {
        try {
          return await databaseService.getConfiguration(key, decrypt);
        } catch (error) {
          console.warn(`Error decrypting configuration "${key}":`, error.message);
          return config.value; // Return encrypted value as fallback
        }
      }
      
      return config.value;
    }
    
    // Try to get from database
    try {
      const value = await databaseService.getConfiguration(key, decrypt);
      
      if (value !== null) {
        // Add to cache
        this.state.configurations.set(key, {
          key,
          value,
          isEncrypted: decrypt,
          _dirty: false
        });
        
        return value;
      }
    } catch (error) {
      console.warn(`Error getting configuration "${key}" from database:`, error.message);
    }
    
    // Check environment variables as last resort
    if (process.env[key]) {
      return process.env[key];
    }
    
    return null;
  }
  
  /**
   * Set a configuration value
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @param {boolean} encrypt - Whether to encrypt the value
   * @returns {Promise<boolean>} Success status
   */
  async setConfig(key, value, encrypt = true) {
    // Update cache
    this.state.configurations.set(key, {
      key,
      value,
      isEncrypted: encrypt,
      _dirty: true
    });
    
    // Mark state as changed
    this.state.status.changeSinceSync = true;
    
    // Try to save to database immediately
    try {
      await databaseService.updateConfiguration(key, value, encrypt);
      
      // Clear dirty flag
      const config = this.state.configurations.get(key);
      if (config) {
        config._dirty = false;
      }
      
      return true;
    } catch (error) {
      console.warn(`Error saving configuration "${key}" to database:`, error.message);
      return false;
    }
  }
  
  /**
   * Log tool execution
   * @param {Object} executionData - Execution data
   * @returns {Promise<Object>} Execution completion function
   */
  async logExecution(executionData) {
    // Add to statistics
    this.state.status.changeSinceSync = true;
    
    // Generate a session ID if not provided
    if (!executionData.sessionId) {
      executionData.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    // Pass to database service
    try {
      return await databaseService.logToolExecution(executionData);
    } catch (error) {
      console.warn('Error logging execution to database:', error.message);
      
      // Provide a dummy completion function
      return {
        complete: async (result, error) => {
          return { success: !error, error: error?.message };
        }
      };
    }
  }
  
  /**
   * Get execution statistics
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(options = {}) {
    try {
      const stats = await databaseService.getToolExecutionStats(options);
      
      // Cache statistics
      this.state.statistics = {
        ...(this.state.statistics || {}),
        ...(stats || {})
      };
      
      return stats;
    } catch (error) {
      console.warn('Error getting statistics from database:', error.message);
      return this.state.statistics || {};
    }
  }
  
  /**
   * Get system status
   * @returns {Object} System status
   */
  getStatus() {
    return {
      ...this.state.status,
      toolCount: this.state.tools.size,
      configCount: this.state.configurations.size,
      memoryUsage: process.memoryUsage()
    };
  }
}

// Create a singleton instance
const stateManager = new StateManager();

module.exports = stateManager;