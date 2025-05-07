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

// Function to get or generate encryption key
async function getEncryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    return process.env.ENCRYPTION_KEY;
  }
  
  // Try to get key from database
  const Configuration = mongoose.model('Configuration');
  try {
    const keyConfig = await Configuration.findOne({ 
      key: 'SYSTEM_ENCRYPTION_KEY',
      category: 'server'
    });
    
    if (keyConfig) {
      // Key exists in database, return the unencrypted value
      return keyConfig.value;
    } else {
      // Generate a new secure key
      const newKey = crypto.randomBytes(32).toString('hex');
      
      // Store in the database without encryption
      const configModel = new Configuration({
        key: 'SYSTEM_ENCRYPTION_KEY',
        value: newKey,
        isEncrypted: false, // Do not encrypt the encryption key itself
        category: 'server',
        description: 'System-generated encryption key'
      });
      
      await configModel.save();
      
      console.log('Generated and saved new encryption key');
      return newKey;
    }
  } catch (error) {
    console.error('Error managing encryption key:', error);
    // If we can't access the database, use environment variable based fallback
    // This is better than a hardcoded key, as it will be unique per instance
    const instanceId = process.env.INSTANCE_ID || crypto.createHash('sha256').update(`${Date.now()}`).digest('hex').substring(0, 8);
    const machineFallback = crypto.createHash('sha256').update(`mcp-server-${instanceId}`).digest('hex');
    return machineFallback;
  }
}

// Internal cache for encryption key
let encryptionKeyCache = null;
let encryptionKeyPromise = null;

// Pre-save hook to encrypt sensitive data and update timestamps
ConfigurationSchema.pre('save', async function(next) {
  // Skip encryption for the encryption key itself
  if (this.key === 'SYSTEM_ENCRYPTION_KEY' && this.category === 'server') {
    this.isEncrypted = false; // Force encryption off for this special key
    this.metadata.updatedAt = Date.now();
    return next();
  }
  
  // Only encrypt if the value has been modified and encryption is needed
  if (this.isModified('value') && this.isEncrypted) {
    try {
      // Get or load encryption key
      if (!encryptionKeyCache && !encryptionKeyPromise) {
        encryptionKeyPromise = getEncryptionKey();
        encryptionKeyCache = await encryptionKeyPromise;
        encryptionKeyPromise = null;
      } else if (encryptionKeyPromise) {
        // Wait for the pending promise if another save is already loading the key
        encryptionKeyCache = await encryptionKeyPromise;
      }
      
      const encryptionKey = encryptionKeyCache;
      
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
ConfigurationSchema.methods.getDecryptedValue = async function() {
  if (!this.isEncrypted) {
    return this.value;
  }
  
  try {
    // Get or load encryption key
    if (!encryptionKeyCache && !encryptionKeyPromise) {
      encryptionKeyPromise = getEncryptionKey();
      encryptionKeyCache = await encryptionKeyPromise;
      encryptionKeyPromise = null;
    } else if (encryptionKeyPromise) {
      // Wait for the pending promise if another process is already loading the key
      encryptionKeyCache = await encryptionKeyPromise;
    }
    
    const encryptionKey = encryptionKeyCache;
    
    // Extract IV and encrypted data
    const parts = this.value.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted value format');
    }
    
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

// Synchronous version for compatibility with existing code
ConfigurationSchema.methods.getDecryptedValueSync = function() {
  if (!this.isEncrypted) {
    return this.value;
  }
  
  try {
    // Use cached key if available, or fall back to environment variable
    // This is not ideal but necessary for sync operation
    const encryptionKey = encryptionKeyCache || 
                         process.env.ENCRYPTION_KEY || 
                         crypto.createHash('sha256').update(`mcp-server-${Date.now()}`).digest('hex');
    
    // Extract IV and encrypted data
    const parts = this.value.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted value format');
    }
    
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
    console.error('Sync decryption error:', error.message);
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
  // Initialize encryption key if needed
  if (!encryptionKeyCache && key !== 'SYSTEM_ENCRYPTION_KEY') {
    encryptionKeyCache = await getEncryptionKey();
  }
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