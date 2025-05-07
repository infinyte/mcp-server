const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for tool parameter properties
 */
const ParameterPropertySchema = new Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['string', 'number', 'boolean', 'integer', 'array', 'object', 'null']
  },
  description: { type: String, required: true },
  default: { type: Schema.Types.Mixed },
  enum: { type: [Schema.Types.Mixed] },
  format: { type: String },
  minimum: { type: Number },
  maximum: { type: Number },
  minLength: { type: Number },
  maxLength: { type: Number },
  pattern: { type: String },
  items: { type: Schema.Types.Mixed }, // For array types
  additionalProperties: { type: Schema.Types.Mixed },
  properties: { type: Map, of: Schema.Types.Mixed }, // Nested properties for objects
  required: { type: [String] } // For object types, list of required properties
}, { _id: false });

/**
 * Schema for tool parameters
 */
const ParameterSchema = new Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['object']
  },
  properties: { 
    type: Map, 
    of: ParameterPropertySchema,
    required: true
  },
  required: { 
    type: [String], 
    default: [] 
  },
  additionalProperties: { 
    type: Boolean,
    default: false
  }
}, { _id: false });

/**
 * Schema for tool definitions
 */
const ToolDefinitionSchema = new Schema({
  name: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  description: { 
    type: String, 
    required: true 
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  category: {
    type: String,
    enum: ['web', 'image', 'file', 'data', 'utility', 'custom'],
    default: 'custom'
  },
  tags: {
    type: [String],
    default: []
  },
  parameters: {
    type: ParameterSchema,
    required: true
  },
  implementation: {
    type: String,
    enum: ['internal', 'external', 'plugin'],
    default: 'internal'
  },
  implementationPath: {
    type: String
  },
  enabled: {
    type: Boolean,
    default: true
  },
  security: {
    requiresAuth: { type: Boolean, default: false },
    rateLimit: { type: Number, default: 0 } // 0 means no limit
  },
  metadata: {
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastUsed: { type: Date },
    usageCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Pre-save hook to update the updatedAt timestamp
ToolDefinitionSchema.pre('save', function(next) {
  this.metadata.updatedAt = Date.now();
  next();
});

// Index for efficient searching
ToolDefinitionSchema.index({ name: 1, version: 1 }, { unique: true });
ToolDefinitionSchema.index({ category: 1 });
ToolDefinitionSchema.index({ tags: 1 });
ToolDefinitionSchema.index({ 'metadata.createdAt': -1 });
ToolDefinitionSchema.index({ 'metadata.usageCount': -1 });

// Method to increment usage count
ToolDefinitionSchema.methods.incrementUsage = async function() {
  this.metadata.lastUsed = Date.now();
  this.metadata.usageCount += 1;
  return this.save();
};

// Static method to get all tools by category
ToolDefinitionSchema.statics.getAllByCategory = function(category) {
  return this.find({ category, enabled: true }).sort({ 'metadata.usageCount': -1 });
};

// Static method to get all enabled tools
ToolDefinitionSchema.statics.getAllEnabled = function() {
  return this.find({ enabled: true }).sort({ name: 1 });
};

// Create the model
const ToolDefinition = mongoose.model('ToolDefinition', ToolDefinitionSchema);

module.exports = ToolDefinition;