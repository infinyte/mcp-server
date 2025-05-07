const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

/**
 * Schema for encrypted API keys and server configurations
 */
const ConfigurationSchema = new Schema({
  key: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  value: { 
    type: String,
    required: true
  },
  isEncrypted: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['api_key', 'connection', 'server', 'feature_flag'],
    default: 'server'
  },
  description: {
    type: String
  },
  metadata: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastUsed: { type: Date },
    expiresAt: { type: Date }
  }
}, { timestamps: true });

// Pre-save hook to encrypt sensitive data and update timestamps
ConfigurationSchema.pre('save', function(next) {
  // Only encrypt if the value has been modified and encryption is needed
  if (this.isModified('value') && this.isEncrypted) {
    try {
      // Get encryption key from environment or use a default
      const encryptionKey = process.env.ENCRYPTION_KEY || 'mcp-server-default-encryption-key';
      
      // Create an initialization vector
      const iv = crypto.randomBytes(16);
      
      // Create cipher using AES-256-CBC
      const cipher = crypto.createCipheriv('aes-256-cbc', 
        crypto.createHash('sha256').update(encryptionKey).digest(), iv);
      
      // Encrypt the value
      let encrypted = cipher.update(this.value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Store the IV and encrypted value
      this.value = `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      return next(error);
    }
  }
  
  // Update timestamp
  this.metadata.updatedAt = Date.now();
  next();
});

// Method to decrypt value
ConfigurationSchema.methods.getDecryptedValue = function() {
  if (!this.isEncrypted) {
    return this.value;
  }
  
  try {
    // Get encryption key from environment or use a default
    const encryptionKey = process.env.ENCRYPTION_KEY || 'mcp-server-default-encryption-key';
    
    // Extract IV and encrypted data
    const parts = this.value.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', 
      crypto.createHash('sha256').update(encryptionKey).digest(), iv);
    
    // Decrypt the value
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
};

// Update last used timestamp
ConfigurationSchema.methods.markAsUsed = async function() {
  this.metadata.lastUsed = Date.now();
  return this.save();
};

// Static method to get configuration by key
ConfigurationSchema.statics.getByKey = async function(key) {
  return this.findOne({ key });
};

// Static method to get all configurations by category
ConfigurationSchema.statics.getAllByCategory = function(category) {
  return this.find({ category }).sort({ key: 1 });
};

// Static method to update configuration
ConfigurationSchema.statics.updateConfig = async function(key, value, isEncrypted = true) {
  const config = await this.findOne({ key });
  
  if (config) {
    config.value = value;
    config.isEncrypted = isEncrypted;
    return config.save();
  } else {
    return this.create({ key, value, isEncrypted });
  }
};

// Create the model
const Configuration = mongoose.model('Configuration', ConfigurationSchema);

module.exports = Configuration;