/**
 * Persistence Service
 * 
 * Handles data persistence for the MCP server, including:
 * - Graceful shutdown data synchronization
 * - Backup and recovery operations
 * - Data migration between versions
 */
const databaseService = require('./database');
const stateManager = require('./stateManager');
const fs = require('fs');
const path = require('path');

class PersistenceService {
  constructor() {
    this.backupDir = path.join(__dirname, '../../backups');
    this.isShuttingDown = false;
    this.syncInProgress = false;
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
  
  /**
   * Initialize the persistence service
   * @returns {Promise<void>}
   */
  async initialize() {
    // Register shutdown handlers
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.handleShutdown('uncaughtException', error);
    });
    
    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
    
    console.log('Persistence service initialized');
  }
  
  /**
   * Handle application shutdown
   * @param {string} signal - Shutdown signal
   * @param {Error} [error] - Error that caused shutdown
   */
  async handleShutdown(signal, error) {
    // Prevent multiple shutdown handlers from running simultaneously
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    console.log(`\n🛑 Shutdown initiated (${signal})`);
    
    if (error) {
      console.error('Shutdown due to error:', error);
    }
    
    try {
      // Sync state to database
      console.log('💾 Syncing state to database before shutdown...');
      await this.syncStateToDatabase();
      console.log('✅ State saved successfully');
      
      // Create backup if database is connected
      if (databaseService.isConnected && !databaseService.useFallback) {
        console.log('📦 Creating backup...');
        await this.createBackup();
        console.log('✅ Backup created successfully');
      }
    } catch (syncError) {
      console.error('❌ Error during shutdown sync:', syncError);
    }
    
    // Close database connection
    try {
      console.log('🔌 Closing database connection...');
      await databaseService.close();
      console.log('✅ Database connection closed');
    } catch (dbError) {
      console.error('❌ Error closing database connection:', dbError);
    }
    
    console.log('👋 Shutdown complete');
    
    // Exit with appropriate code
    process.exit(error ? 1 : 0);
  }
  
  /**
   * Sync state to database
   * @returns {Promise<boolean>} Success status
   */
  async syncStateToDatabase() {
    if (this.syncInProgress) {
      return false;
    }
    
    this.syncInProgress = true;
    
    try {
      // Check if stateManager is initialized
      if (!stateManager.initialized) {
        await stateManager.initialize();
      }
      
      // Save state
      const success = await stateManager.saveStateToDb();
      
      this.syncInProgress = false;
      return success;
    } catch (error) {
      this.syncInProgress = false;
      console.error('Error syncing state to database:', error);
      return false;
    }
  }
  
  /**
   * Create a backup of current state
   * @returns {Promise<string>} Backup file path
   */
  async createBackup() {
    if (databaseService.useFallback) {
      throw new Error('Cannot create backup when using fallback store');
    }
    
    try {
      // Get current state
      const tools = await databaseService.getAllTools();
      const apiConfigs = await databaseService.getConfigurationsByCategory('api_key');
      const serverConfigs = await databaseService.getConfigurationsByCategory('server');
      
      // Create backup object (excluding sensitive data)
      const backup = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          version: tool.version,
          category: tool.category,
          parameters: tool.parameters,
          enabled: tool.enabled,
          implementation: tool.implementation,
          implementationPath: tool.implementationPath,
          metadata: {
            createdBy: tool.metadata?.createdBy,
            createdAt: tool.metadata?.createdAt,
            updatedAt: tool.metadata?.updatedAt,
            lastUsed: tool.metadata?.lastUsed,
            usageCount: tool.metadata?.usageCount
          }
        })),
        configurations: [
          ...(serverConfigs || []).map(config => ({
            key: config.key,
            category: config.category,
            description: config.description,
            isEncrypted: config.isEncrypted
            // Excluding values for security
          })),
          ...(apiConfigs || []).map(config => ({
            key: config.key,
            category: config.category,
            description: config.description,
            isEncrypted: config.isEncrypted
            // Excluding values for security
          }))
        ]
      };
      
      // Generate backup file name
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const fileName = `mcp_backup_${timestamp}.json`;
      const filePath = path.join(this.backupDir, fileName);
      
      // Write backup to file
      fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
      
      return filePath;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }
  
  /**
   * Restore from a backup file
   * @param {string} backupFile - Path to backup file
   * @returns {Promise<boolean>} Success status
   */
  async restoreFromBackup(backupFile) {
    try {
      // Read backup file
      const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      
      // Validate backup version
      if (!backupData.version) {
        throw new Error('Invalid backup file: missing version');
      }
      
      // Restore tools
      if (Array.isArray(backupData.tools)) {
        for (const tool of backupData.tools) {
          await databaseService.saveToolDefinition(tool);
        }
      }
      
      // Restore configurations (excluding values that need to be set manually)
      if (Array.isArray(backupData.configurations)) {
        for (const config of backupData.configurations) {
          // Skip API keys (these should be set manually)
          if (config.category === 'api_key') {
            continue;
          }
          
          // Get existing config to preserve value
          const existingConfig = await databaseService.getConfiguration(config.key);
          
          if (existingConfig) {
            await databaseService.updateConfiguration(
              config.key, 
              existingConfig, 
              config.isEncrypted
            );
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error restoring from backup:', error);
      return false;
    }
  }
  
  /**
   * List available backups
   * @returns {Array} Backup files with metadata
   */
  listBackups() {
    try {
      // Get all backup files
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.endsWith('.json') && file.startsWith('mcp_backup_'));
      
      // Get metadata for each file
      return files.map(file => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        
        try {
          // Try to get version and timestamp from file
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          return {
            fileName: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            version: data.version,
            timestamp: data.timestamp,
            toolCount: Array.isArray(data.tools) ? data.tools.length : 0,
            configCount: Array.isArray(data.configurations) ? data.configurations.length : 0
          };
        } catch (error) {
          // If we can't parse the file, return basic info
          return {
            fileName: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            error: 'Could not parse backup file'
          };
        }
      }).sort((a, b) => {
        // Sort by creation date, newest first
        return new Date(b.created) - new Date(a.created);
      });
    } catch (error) {
      console.error('Error listing backups:', error);
      return [];
    }
  }
}

// Create a singleton instance
const persistenceService = new PersistenceService();

module.exports = persistenceService;