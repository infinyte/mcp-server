/**
 * MongoDB Backup Script for MCP Server
 * 
 * This script creates a backup of the MongoDB database
 * for the MCP server, including tools, configurations,
 * and other critical data.
 */
const path = require('path');
const fs = require('fs');
const { connectDB, closeDB } = require('../config/database');
const { ToolDefinition, Configuration } = require('../models');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Backup directory
const backupDir = path.join(__dirname, '../../backups');

/**
 * Create a backup of MongoDB data
 * @param {Object} options - Backup options
 * @param {boolean} options.includeExecutions - Whether to include execution history
 * @param {string} options.backupName - Custom backup name
 * @returns {Promise<string>} Backup file path
 */
async function createBackup(options = {}) {
  const { includeExecutions = false, backupName = '' } = options;
  
  try {
    console.log('🔄 Creating MongoDB backup...');
    
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Connect to MongoDB
    await connectDB();
    
    // Gather data
    console.log('📊 Gathering tool definitions...');
    const tools = await ToolDefinition.find({});
    console.log(`📊 Found ${tools.length} tool definitions`);
    
    console.log('📊 Gathering configurations...');
    const apiConfigs = await Configuration.find({ category: 'api_key' });
    const serverConfigs = await Configuration.find({ category: 'server' });
    const featureFlags = await Configuration.find({ category: 'feature_flag' });
    console.log(`📊 Found ${apiConfigs.length} API configurations`);
    console.log(`📊 Found ${serverConfigs.length} server configurations`);
    console.log(`📊 Found ${featureFlags.length} feature flags`);
    
    // Create backup object (excluding sensitive data)
    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        version: tool.version || '1.0.0',
        category: tool.category,
        tags: tool.tags || [],
        parameters: tool.parameters,
        enabled: tool.enabled,
        implementation: tool.implementation,
        implementationPath: tool.implementationPath,
        security: {
          requiresAuth: tool.security?.requiresAuth || false,
          rateLimit: tool.security?.rateLimit || 0
        },
        metadata: {
          createdBy: tool.metadata?.createdBy,
          createdAt: tool.metadata?.createdAt,
          updatedAt: tool.metadata?.updatedAt,
          lastUsed: tool.metadata?.lastUsed,
          usageCount: tool.metadata?.usageCount || 0
        }
      })),
      configurations: [
        ...(serverConfigs || []).map(config => ({
          key: config.key,
          value: config.isEncrypted ? '[ENCRYPTED]' : config.value,
          category: config.category,
          description: config.description,
          isEncrypted: config.isEncrypted,
          metadata: {
            createdAt: config.metadata?.createdAt,
            updatedAt: config.metadata?.updatedAt,
            lastUsed: config.metadata?.lastUsed,
            expiresAt: config.metadata?.expiresAt
          }
        })),
        ...(apiConfigs || []).map(config => ({
          key: config.key,
          category: config.category,
          description: config.description,
          isEncrypted: config.isEncrypted,
          // Excluding actual API key values for security
          value: '[REDACTED]'
        })),
        ...(featureFlags || []).map(config => ({
          key: config.key,
          value: config.value,
          category: config.category,
          description: config.description,
          isEncrypted: config.isEncrypted,
          metadata: {
            createdAt: config.metadata?.createdAt,
            updatedAt: config.metadata?.updatedAt
          }
        }))
      ]
    };
    
    // Include execution history if requested
    if (includeExecutions) {
      const { ToolExecution } = require('../models');
      
      console.log('📊 Gathering execution history...');
      // Only get the last 100 executions to keep backup size reasonable
      const executions = await ToolExecution.find({})
        .sort({ 'metadata.timestamp': -1 })
        .limit(100);
      
      console.log(`📊 Including ${executions.length} recent executions`);
      
      backup.executions = executions.map(exec => ({
        toolName: exec.toolName,
        provider: exec.provider,
        sessionId: exec.sessionId,
        status: exec.status,
        executionTime: exec.executionTime,
        metadata: {
          timestamp: exec.metadata?.timestamp,
          modelName: exec.metadata?.modelName
        }
      }));
    }
    
    // Generate backup file name
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const fileName = backupName ? 
      `mcp_backup_${backupName}_${timestamp}.json` : 
      `mcp_backup_${timestamp}.json`;
    
    const filePath = path.join(backupDir, fileName);
    
    // Write backup to file
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
    
    console.log(`✅ Backup created successfully: ${filePath}`);
    
    // Close MongoDB connection
    await closeDB();
    
    return filePath;
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    
    // Try to close connection if there was an error
    try {
      await closeDB();
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
    
    throw error;
  }
}

/**
 * List available backups
 * @returns {Array} Backup files with metadata
 */
function listBackups() {
  try {
    console.log('📋 Listing available backups...');
    
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      console.log('⚠️ No backup directory found');
      return [];
    }
    
    // Get all backup files
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json') && file.startsWith('mcp_backup_'));
    
    if (files.length === 0) {
      console.log('⚠️ No backup files found');
      return [];
    }
    
    // Get metadata for each file
    const backups = files.map(file => {
      const filePath = path.join(backupDir, file);
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
          configCount: Array.isArray(data.configurations) ? data.configurations.length : 0,
          executionCount: Array.isArray(data.executions) ? data.executions.length : 0
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
    
    // Print backup list
    console.log(`📋 Found ${backups.length} backups:`);
    
    backups.forEach((backup, index) => {
      const createdDate = new Date(backup.created).toLocaleString();
      const sizeKB = Math.round(backup.size / 1024);
      
      console.log(`${index + 1}. ${backup.fileName}`);
      console.log(`   Created: ${createdDate}`);
      console.log(`   Size: ${sizeKB} KB`);
      console.log(`   Tools: ${backup.toolCount || 'unknown'}`);
      console.log(`   Configs: ${backup.configCount || 'unknown'}`);
      
      if (backup.error) {
        console.log(`   Error: ${backup.error}`);
      }
      
      console.log('');
    });
    
    return backups;
  } catch (error) {
    console.error('❌ Error listing backups:', error);
    return [];
  }
}

/**
 * Parse command line arguments and execute backup
 */
async function runBackupCommand() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    // List backups
    listBackups();
  } else {
    // Create new backup
    const includeExecutions = args.includes('--with-executions') || args.includes('-e');
    
    // Get custom name if provided
    let backupName = '';
    const nameIndex = args.findIndex(arg => arg === '--name' || arg === '-n');
    
    if (nameIndex >= 0 && nameIndex < args.length - 1) {
      backupName = args[nameIndex + 1];
    }
    
    // Create the backup
    try {
      await createBackup({ includeExecutions, backupName });
    } catch (error) {
      console.error('Backup failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  runBackupCommand().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  createBackup,
  listBackups
};