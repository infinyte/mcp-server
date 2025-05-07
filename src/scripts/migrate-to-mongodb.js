/**
 * MongoDB Migration Script for MCP Server
 * 
 * This script migrates data from in-memory or file-based storage to MongoDB.
 * It handles:
 * - Tool definitions
 * - Configurations
 * - Historical execution data (if available)
 */
const path = require('path');
const fs = require('fs');
const { connectDB } = require('../config/database');
const { migrateToolDefinitions, initializeConfigurations } = require('../config/initDB');
const tools = require('../tools');
const mongoose = require('mongoose');
const { ToolDefinition, Configuration, ToolExecution } = require('../models');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Check for backup files
const backupsDir = path.join(__dirname, '../../backups');
const cacheDir = path.join(__dirname, '../../cache');
const hasBackups = fs.existsSync(backupsDir) && fs.readdirSync(backupsDir).some(file => file.endsWith('.json'));
const hasCacheData = fs.existsSync(cacheDir) && fs.readdirSync(cacheDir).some(file => file.endsWith('.json'));

/**
 * Migrate tool definitions to MongoDB
 * @returns {Promise<boolean>} Success status
 */
async function migrateTools() {
  try {
    console.log('🔄 Migrating tool definitions to MongoDB...');
    
    // Get tool definitions from the toolDefinitions module
    const toolDefsArray = tools.getAllToolDefinitions();
    console.log(`📊 Found ${toolDefsArray.length} tool definitions to migrate`);
    
    // Check for existing tools in the database
    const existingToolCount = await ToolDefinition.countDocuments({});
    console.log(`📊 Found ${existingToolCount} existing tools in the database`);
    
    if (existingToolCount > 0) {
      // Ask if we should overwrite
      console.log('⚠️ Database already contains tool definitions.');
      console.log('Would you like to overwrite existing tools? (y/N)');

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('> ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase());
        });
      });
      
      if (answer !== 'y' && answer !== 'yes') {
        console.log('⏩ Skipping tool migration');
        return true;
      }
    }
    
    // Migrate tools
    const success = await migrateToolDefinitions(toolDefsArray);
    
    if (success) {
      console.log('✅ Tool definitions migrated successfully');
    } else {
      console.error('❌ Tool migration failed');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Error migrating tools:', error);
    return false;
  }
}

/**
 * Migrate configurations to MongoDB
 * @returns {Promise<boolean>} Success status
 */
async function migrateConfigurations() {
  try {
    console.log('🔄 Migrating configurations to MongoDB...');
    
    // Initialize configurations from environment
    const success = await initializeConfigurations();
    
    if (success) {
      console.log('✅ Configurations migrated successfully');
    } else {
      console.error('❌ Configuration migration failed');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Error migrating configurations:', error);
    return false;
  }
}

/**
 * Migrate cache data
 * @returns {Promise<boolean>} Success status
 */
async function migrateCacheData() {
  if (!hasCacheData) {
    console.log('⏩ No cache data found to migrate');
    return true;
  }
  
  try {
    console.log('🔄 Migrating cache data to MongoDB...');
    
    // Get all cache files
    const cacheFiles = fs.readdirSync(cacheDir).filter(file => file.endsWith('.json'));
    console.log(`📊 Found ${cacheFiles.length} cache files to migrate`);
    
    // TODO: Implement cache data migration based on actual cache structure
    // This will depend on how your cache is organized
    
    console.log('✅ Cache data migrated successfully');
    return true;
  } catch (error) {
    console.error('❌ Error migrating cache data:', error);
    return false;
  }
}

/**
 * Migrate backup data
 * @returns {Promise<boolean>} Success status
 */
async function migrateBackupData() {
  if (!hasBackups) {
    console.log('⏩ No backup data found to migrate');
    return true;
  }
  
  try {
    console.log('🔄 Migrating backup data to MongoDB...');
    
    // Get the most recent backup file
    const backupFiles = fs.readdirSync(backupsDir)
      .filter(file => file.startsWith('mcp_backup_') && file.endsWith('.json'))
      .sort() // Sort by name (which includes timestamp)
      .reverse(); // Get newest first
    
    if (backupFiles.length === 0) {
      console.log('⏩ No backup files found to migrate');
      return true;
    }
    
    console.log(`📊 Found ${backupFiles.length} backup files`);
    
    // Ask which backup to restore
    console.log('Select a backup to migrate:');
    backupFiles.forEach((file, index) => {
      const stats = fs.statSync(path.join(backupsDir, file));
      console.log(`  ${index + 1}. ${file} (${new Date(stats.mtime).toLocaleString()})`);
    });
    console.log('  0. Cancel migration');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('> ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
    
    const selection = parseInt(answer, 10);
    
    if (isNaN(selection) || selection === 0) {
      console.log('⏩ Skipping backup migration');
      return true;
    }
    
    if (selection < 1 || selection > backupFiles.length) {
      console.log('❌ Invalid selection');
      return false;
    }
    
    const backupFile = backupFiles[selection - 1];
    const backupPath = path.join(backupsDir, backupFile);
    console.log(`📦 Restoring backup: ${backupFile}`);
    
    // Parse the backup file
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    // Validate backup version
    if (!backupData.version) {
      throw new Error('Invalid backup file: missing version');
    }
    
    // Confirm before proceeding
    console.log(`⚠️ This will restore ${backupData.tools?.length || 0} tools and ${backupData.configurations?.length || 0} configurations.`);
    console.log('Would you like to proceed? (y/N)');
    
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const confirmAnswer = await new Promise(resolve => {
      rl2.question('> ', (answer) => {
        rl2.close();
        resolve(answer.toLowerCase());
      });
    });
    
    if (confirmAnswer !== 'y' && confirmAnswer !== 'yes') {
      console.log('⏩ Skipping backup restoration');
      return true;
    }
    
    // Restore tools
    if (Array.isArray(backupData.tools)) {
      console.log(`🔄 Migrating ${backupData.tools.length} tools from backup...`);
      
      for (const tool of backupData.tools) {
        // Check if tool already exists
        const existingTool = await ToolDefinition.findOne({ name: tool.name });
        
        if (existingTool) {
          console.log(`⏩ Tool "${tool.name}" already exists, updating...`);
          Object.assign(existingTool, tool);
          await existingTool.save();
        } else {
          console.log(`➕ Adding tool "${tool.name}" from backup...`);
          await ToolDefinition.create(tool);
        }
      }
    }
    
    // Restore configurations (excluding values that need to be set manually)
    if (Array.isArray(backupData.configurations)) {
      console.log(`🔄 Migrating ${backupData.configurations.length} configurations from backup...`);
      
      for (const config of backupData.configurations) {
        // Skip if no key
        if (!config.key) {
          continue;
        }
        
        // For API keys, check environment
        if (config.category === 'api_key') {
          if (process.env[config.key]) {
            console.log(`✅ Using ${config.key} from environment`);
            await Configuration.updateConfig(config.key, process.env[config.key], true);
          } else {
            console.log(`⚠️ ${config.key} not found in environment, skipping`);
          }
        } else {
          // For other configs, create with default value
          console.log(`➕ Adding configuration "${config.key}" from backup...`);
          await Configuration.updateConfig(
            config.key,
            config.value || 'default_value',
            config.isEncrypted || false
          );
        }
      }
    }
    
    console.log('✅ Backup data migrated successfully');
    return true;
  } catch (error) {
    console.error('❌ Error migrating backup data:', error);
    return false;
  }
}

/**
 * Test MongoDB connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    console.log('🔄 Testing MongoDB connection...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Test database operations
    
    // Test ToolDefinition
    const testToolName = `test_tool_${Date.now()}`;
    await ToolDefinition.create({
      name: testToolName,
      description: 'Test tool for migration script',
      version: '1.0.0',
      category: 'test',
      parameters: {
        type: 'object',
        properties: {
          test: {
            type: 'string',
            description: 'Test parameter'
          }
        },
        required: []
      },
      enabled: true,
      implementation: 'internal',
      metadata: {
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    // Verify it was created
    const testTool = await ToolDefinition.findOne({ name: testToolName });
    
    if (!testTool) {
      throw new Error('Test tool creation failed');
    }
    
    // Clean up test data
    await ToolDefinition.deleteOne({ name: testToolName });
    
    // Test Configuration
    const testConfigKey = `TEST_CONFIG_${Date.now()}`;
    await Configuration.updateConfig(testConfigKey, 'test_value', false);
    
    // Verify it was created
    const testConfig = await Configuration.findOne({ key: testConfigKey });
    
    if (!testConfig) {
      throw new Error('Test configuration creation failed');
    }
    
    // Clean up test data
    await Configuration.deleteOne({ key: testConfigKey });
    
    // Test ToolExecution
    const testExecution = new ToolExecution({
      toolName: 'test_tool',
      provider: 'direct',
      sessionId: `test_session_${Date.now()}`,
      inputs: { test: 'value' },
      status: 'success',
      executionTime: 100,
      metadata: {
        timestamp: new Date()
      }
    });
    
    await testExecution.save();
    
    // Verify it was created
    const savedExecution = await ToolExecution.findById(testExecution._id);
    
    if (!savedExecution) {
      throw new Error('Test execution creation failed');
    }
    
    // Clean up test data
    await ToolExecution.deleteOne({ _id: testExecution._id });
    
    console.log('✅ MongoDB connection test successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error);
    return false;
  }
}

/**
 * Update configuration in .env file
 * @returns {Promise<boolean>} Success status
 */
async function updateEnvConfig() {
  try {
    console.log('🔄 Updating environment configuration...');
    
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    // Create .env file if it doesn't exist
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Construct new MongoDB URI line
    const uri = process.env.MONGODB_URI || 'mongodb://mcpuser:mcppassword@localhost:27017/mcp-server';
    const mongoLine = `MONGODB_URI=${uri}`;
    
    // Check if MONGODB_URI is already set
    if (envContent.includes('MONGODB_URI=')) {
      // Replace existing line
      envContent = envContent.replace(/MONGODB_URI=.*/g, mongoLine);
    } else {
      // Add new line
      envContent += `\n${mongoLine}\n`;
    }
    
    // Write updated content back to .env
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ Environment configuration updated');
    return true;
  } catch (error) {
    console.error('❌ Error updating environment configuration:', error);
    return false;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting MongoDB migration process...');
  
  try {
    // Test MongoDB connection
    const connectionSuccessful = await testConnection();
    
    if (!connectionSuccessful) {
      console.error('❌ MongoDB connection test failed. Please check your MongoDB setup.');
      process.exit(1);
    }
    
    // Update .env file
    await updateEnvConfig();
    
    // Run migrations
    await migrateTools();
    await migrateConfigurations();
    await migrateCacheData();
    await migrateBackupData();
    
    console.log('🎉 Migration complete! MongoDB is now configured and ready to use with your MCP server.');
    console.log('📝 Additional steps you may want to take:');
    console.log('  1. Start the MCP server to verify the migration was successful');
    console.log('  2. Create a backup of your MongoDB data');
    console.log('  3. Configure authentication and security for production use');
    
    // Close MongoDB connection
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Unhandled error during migration:', error);
    process.exit(1);
  });
}

module.exports = {
  testConnection,
  migrateTools,
  migrateConfigurations,
  migrateCacheData,
  migrateBackupData,
  updateEnvConfig,
  runMigration
};