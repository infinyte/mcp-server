/**
 * Admin Routes for MCP Server
 * 
 * Provides endpoints for server administration:
 * - State management
 * - Tool management
 * - Backup and restore
 */
const express = require('express');
const asyncHandler = require('express-async-handler');
const stateManager = require('../services/stateManager');
const persistenceService = require('../services/persistence');
const databaseService = require('../services/database');

const router = express.Router();

// Get server status
router.get('/status', (req, res) => {
  const status = stateManager.getStatus();
  
  // Add uptime
  status.uptime = process.uptime();
  
  // Add memory info
  const memoryUsage = process.memoryUsage();
  status.memory = {
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
  };
  
  // Add db status
  status.database = {
    connected: databaseService.isConnected,
    useFallback: databaseService.useFallback
  };
  
  res.json(status);
});

// Force state sync
router.post('/sync', asyncHandler(async (req, res) => {
  try {
    const success = await stateManager.saveStateToDb();
    
    if (success) {
      res.json({ success: true, message: 'State synced successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to sync state' });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing state',
      error: error.message
    });
  }
}));

// Create a backup
router.post('/backup', asyncHandler(async (req, res) => {
  try {
    const backupPath = await persistenceService.createBackup();
    
    res.json({
      success: true,
      message: 'Backup created successfully',
      backupPath
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating backup',
      error: error.message
    });
  }
}));

// List available backups
router.get('/backups', (req, res) => {
  try {
    const backups = persistenceService.listBackups();
    
    res.json({
      success: true,
      count: backups.length,
      backups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error listing backups',
      error: error.message
    });
  }
});

// Restore from backup
router.post('/restore', asyncHandler(async (req, res) => {
  const { backupFile } = req.body;
  
  if (!backupFile) {
    return res.status(400).json({
      success: false,
      message: 'Backup file path is required'
    });
  }
  
  try {
    const success = await persistenceService.restoreFromBackup(backupFile);
    
    if (success) {
      // Reload state
      await stateManager.loadStateFromDb();
      
      res.json({
        success: true,
        message: 'Backup restored successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to restore from backup'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error restoring from backup',
      error: error.message
    });
  }
}));

// Get execution statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const { period = 'day', toolName, limit = 10 } = req.query;
  
  try {
    const stats = await stateManager.getStatistics({
      period,
      toolName,
      limit: parseInt(limit, 10)
    });
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting statistics',
      error: error.message
    });
  }
}));

// Tool management

// Register a new tool
router.post('/tools', asyncHandler(async (req, res) => {
  const toolDefinition = req.body;
  
  if (!toolDefinition || !toolDefinition.name || !toolDefinition.description) {
    return res.status(400).json({
      success: false,
      message: 'Tool definition must include name and description'
    });
  }
  
  try {
    // Set default values
    if (!toolDefinition.version) {
      toolDefinition.version = '1.0.0';
    }
    
    if (!toolDefinition.category) {
      toolDefinition.category = 'custom';
    }
    
    if (toolDefinition.enabled === undefined) {
      toolDefinition.enabled = true;
    }
    
    if (!toolDefinition.metadata) {
      toolDefinition.metadata = {};
    }
    
    toolDefinition.metadata.createdAt = new Date();
    toolDefinition.metadata.updatedAt = new Date();
    toolDefinition.metadata.createdBy = req.headers['x-user-id'] || 'admin';
    
    // Save to state manager
    const savedTool = await stateManager.saveTool(toolDefinition);
    
    res.status(201).json({
      success: true,
      message: 'Tool registered successfully',
      tool: savedTool
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error registering tool',
      error: error.message
    });
  }
}));

// Update a tool
router.put('/tools/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const toolUpdate = req.body;
  
  if (!toolUpdate) {
    return res.status(400).json({
      success: false,
      message: 'Tool update data is required'
    });
  }
  
  try {
    // Get existing tool
    const existingTool = await stateManager.getTool(name);
    
    if (!existingTool) {
      return res.status(404).json({
        success: false,
        message: `Tool "${name}" not found`
      });
    }
    
    // Merge updates
    const updatedTool = {
      ...existingTool,
      ...toolUpdate,
      name, // Ensure name doesn't change
      metadata: {
        ...existingTool.metadata,
        ...toolUpdate.metadata,
        updatedAt: new Date()
      }
    };
    
    // Save updated tool
    const savedTool = await stateManager.saveTool(updatedTool);
    
    res.json({
      success: true,
      message: 'Tool updated successfully',
      tool: savedTool
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating tool',
      error: error.message
    });
  }
}));

// Delete a tool
router.delete('/tools/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  
  try {
    const success = await stateManager.deleteTool(name);
    
    if (success) {
      res.json({
        success: true,
        message: `Tool "${name}" deleted successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Tool "${name}" not found`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting tool',
      error: error.message
    });
  }
}));

// Configuration management

// Get a configuration
router.get('/config/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { decrypt = 'true' } = req.query;
  
  try {
    const value = await stateManager.getConfig(key, decrypt === 'true');
    
    if (value === null) {
      res.status(404).json({
        success: false,
        message: `Configuration "${key}" not found`
      });
    } else {
      res.json({
        success: true,
        key,
        value
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting configuration',
      error: error.message
    });
  }
}));

// Set a configuration
router.post('/config', asyncHandler(async (req, res) => {
  const { key, value, encrypt = true } = req.body;
  
  if (!key || value === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Both key and value are required'
    });
  }
  
  try {
    const success = await stateManager.setConfig(key, value, encrypt);
    
    if (success) {
      res.json({
        success: true,
        message: `Configuration "${key}" updated successfully`
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Failed to update configuration "${key}"`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating configuration',
      error: error.message
    });
  }
}));

module.exports = router;