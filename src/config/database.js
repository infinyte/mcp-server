const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

// Load and expand environment variables
const env = dotenv.config();
dotenvExpand.expand(env);

// MongoDB connection URL with fallback to localhost
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mcp-server';

// Connection options
const dbOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  autoIndex: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
};

// State tracking
let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Connect to MongoDB
 * @returns {Promise<typeof mongoose>} Mongoose connection
 */
async function connectDB() {
  if (isConnected) {
    console.log('💾 MongoDB is already connected');
    return mongoose;
  }

  try {
    connectionAttempts++;
    
    console.log(`🔄 Connecting to MongoDB (attempt ${connectionAttempts})...`);
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, dbOptions);
    
    // Reset state on successful connection
    isConnected = true;
    connectionAttempts = 0;
    
    console.log(`✅ MongoDB connected successfully: ${MONGODB_URI}`);
    
    // Add connection event listeners
    mongoose.connection.on('disconnected', handleDisconnect);
    mongoose.connection.on('error', handleError);
    
    return mongoose;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    
    // If we've exceeded max attempts, don't try again
    if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`⛔ Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      // Throw the error to be handled by the caller
      throw error;
    }
    
    // Exponential backoff for reconnection
    const delay = Math.min(1000 * 2 ** connectionAttempts, 10000);
    console.log(`⏱️ Retrying connection in ${delay / 1000} seconds...`);
    
    // Wait and try again
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectDB();
  }
}

/**
 * Handle database disconnection
 */
function handleDisconnect() {
  isConnected = false;
  console.log('⚠️ MongoDB disconnected');
  
  // Attempt to reconnect
  if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect to MongoDB...');
      connectDB().catch(err => {
        console.error('❌ Failed to reconnect to MongoDB:', err.message);
      });
    }, 5000); // Wait 5 seconds before reconnecting
  }
}

/**
 * Handle database errors
 * @param {Error} error - The error that occurred
 */
function handleError(error) {
  console.error('❌ MongoDB connection error:', error.message);
}

/**
 * Close database connection gracefully
 */
async function closeDB() {
  if (!isConnected) {
    return;
  }
  
  try {
    console.log('🔄 Closing MongoDB connection...');
    await mongoose.connection.close();
    isConnected = false;
    console.log('✅ MongoDB connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
    // Force close in case of error
    process.exit(1);
  }
}

module.exports = {
  connectDB,
  closeDB,
  mongoose
};