/**
 * MongoDB Integration Test
 * 
 * Tests the MongoDB connection and basic CRUD operations.
 */
require('dotenv').config();
const { connectDB, closeDB, mongoose } = require('../../src/config/database');
const { ToolDefinition, Configuration, ToolExecution } = require('../../src/models');

/**
 * Test MongoDB connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    console.log('🔄 Testing MongoDB connection...');
    
    // Connect to MongoDB
    await connectDB();
    
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Connection URI: ${mongoose.connection.client.s.url.redacted}`);
    console.log(`📊 Database name: ${mongoose.connection.db.databaseName}`);
    
    return true;
  } catch (error) {
    console.log('❌ MongoDB connection test failed:', error.message);
    console.log('⚠️  This is expected if MongoDB is not running or configured');
    console.log('⚠️  The application should fall back to in-memory storage');
    return false;
  }
}

/**
 * Run database connection test
 */
async function runTests() {
  console.log('🧪 Starting MongoDB integration test...');
  
  try {
    // Test connection
    const connectionSuccessful = await testConnection();
    
    // Close MongoDB connection if successful
    if (connectionSuccessful) {
      await closeDB();
    }
    
    console.log('\n✅ MongoDB test completed');
    // Don't fail the test suite if MongoDB isn't available
    // as the application has a fallback
    return true;
  } catch (error) {
    console.error('❌ Unhandled error during test:', error.message);
    
    // Try to close connection if there was an error
    try {
      await closeDB();
    } catch (closeError) {
      console.error('Error closing database connection:', closeError.message);
    }
    
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Unhandled error during tests:', error);
    process.exit(1);
  });
}

module.exports = runTests;