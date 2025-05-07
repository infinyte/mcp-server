const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for tool execution history
 */
const ToolExecutionSchema = new Schema({
  toolName: { 
    type: String, 
    required: true,
    index: true
  },
  provider: {
    type: String,
    enum: ['anthropic', 'openai', 'direct', 'other'],
    default: 'direct',
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },
  inputs: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  },
  outputs: {
    type: Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'pending',
    index: true
  },
  errorMessage: {
    type: String
  },
  executionTime: {
    type: Number, // in milliseconds
    default: 0
  },
  metadata: {
    ipAddress: { type: String },
    userAgent: { type: String },
    userId: { type: String },
    timestamp: { type: Date, default: Date.now },
    modelName: { type: String }
  }
}, { 
  timestamps: true,
  // Use this to control what data is returned by default
  toJSON: { 
    transform: function(doc, ret) {
      // Optionally transform the returned object
      // For example, remove sensitive data
      delete ret.__v;
      return ret;
    } 
  }
});

// Indexes for efficient querying
ToolExecutionSchema.index({ 'metadata.timestamp': -1 });
ToolExecutionSchema.index({ toolName: 1, status: 1 });
ToolExecutionSchema.index({ toolName: 1, 'metadata.timestamp': -1 });

// Static method to log tool execution
ToolExecutionSchema.statics.logExecution = async function(toolData) {
  try {
    // Start execution tracking
    const startTime = Date.now();
    const execution = new this({
      toolName: toolData.toolName,
      provider: toolData.provider || 'direct',
      sessionId: toolData.sessionId,
      inputs: toolData.inputs || {},
      status: 'pending',
      metadata: {
        ipAddress: toolData.ipAddress,
        userAgent: toolData.userAgent,
        userId: toolData.userId,
        timestamp: new Date(),
        modelName: toolData.modelName
      }
    });
    
    // Save initial record
    await execution.save();
    
    return {
      // Return a function to complete the execution log
      complete: async (result, error) => {
        const endTime = Date.now();
        execution.executionTime = endTime - startTime;
        
        if (error) {
          execution.status = 'failure';
          execution.errorMessage = error.message || String(error);
        } else {
          execution.status = 'success';
          execution.outputs = result;
        }
        
        return execution.save();
      }
    };
  } catch (error) {
    console.error('Failed to log tool execution:', error);
    // Return no-op function to prevent errors
    return {
      complete: async () => {}
    };
  }
};

// Static method to get execution stats
ToolExecutionSchema.statics.getStats = async function(options = {}) {
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
      startDate.setDate(now.getDate() - 1); // Default to 1 day
  }
  
  // Build the query
  const query = { 'metadata.timestamp': { $gte: startDate } };
  if (toolName) {
    query.toolName = toolName;
  }
  
  // Get basic stats
  const totalCount = await this.countDocuments(query);
  const successCount = await this.countDocuments({ ...query, status: 'success' });
  const failureCount = await this.countDocuments({ ...query, status: 'failure' });
  
  // Get most used tools
  const topTools = await this.aggregate([
    { $match: query },
    { $group: { _id: '$toolName', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
  
  // Get average execution time by tool
  const executionTimes = await this.aggregate([
    { $match: { ...query, status: 'success' } },
    { $group: { _id: '$toolName', avgTime: { $avg: '$executionTime' } } },
    { $sort: { avgTime: 1 } }
  ]);
  
  return {
    period,
    totalCount,
    successCount,
    failureCount,
    successRate: totalCount > 0 ? (successCount / totalCount * 100).toFixed(2) + '%' : '0%',
    topTools,
    executionTimes
  };
};

// Create the model
const ToolExecution = mongoose.model('ToolExecution', ToolExecutionSchema);

module.exports = ToolExecution;