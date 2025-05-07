/**
 * MongoDB Test Script for MCP Server
 * 
 * This script tests MongoDB connectivity and performs
 * basic CRUD operations to verify the database setup.
 */
const { connectDB, closeDB, mongoose } = require('../config/database');
const { ToolDefinition, Configuration, ToolExecution } = require('../models');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

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
    console.error('❌ MongoDB connection test failed:', error);
    return false;
  }
}

/**
 * Test CRUD operations on ToolDefinition model
 * @returns {Promise<boolean>} Success status
 */
async function testToolDefinitions() {
  try {
    console.log('\n🔄 Testing ToolDefinition CRUD operations...');
    
    // Create test tool
    const testToolName = `test_tool_${Date.now()}`;
    
    console.log(`📝 Creating test tool: ${testToolName}`);
    
    const toolDef = new ToolDefinition({
      name: testToolName,
      description: 'Test tool created by test script',
      version: '1.0.0',
      category: 'test',
      parameters: {
        type: 'object',
        properties: {
          test_param: {
            type: 'string',
            description: 'Test parameter'
          }
        },
        required: []
      },
      enabled: true,
      implementation: 'internal',
      metadata: {
        createdBy: 'test_script',
        createdAt: new Date()
      }
    });
    
    await toolDef.save();
    console.log('✅ Test tool created successfully');
    
    // Read test tool
    console.log('🔍 Reading test tool...');
    const readTool = await ToolDefinition.findOne({ name: testToolName });
    
    if (!readTool) {
      throw new Error('Test tool not found after creation');
    }
    
    console.log('✅ Test tool read successfully');
    
    // Update test tool
    console.log('🔄 Updating test tool...');
    readTool.description = 'Updated test tool description';
    await readTool.save();
    
    // Verify update
    const updatedTool = await ToolDefinition.findOne({ name: testToolName });
    
    if (updatedTool.description !== 'Updated test tool description') {
      throw new Error('Tool update failed');
    }
    
    console.log('✅ Test tool updated successfully');
    
    // Delete test tool
    console.log('🗑️ Deleting test tool...');
    await ToolDefinition.deleteOne({ name: testToolName });
    
    // Verify deletion
    const deletedTool = await ToolDefinition.findOne({ name: testToolName });
    
    if (deletedTool) {
      throw new Error('Tool deletion failed');
    }
    
    console.log('✅ Test tool deleted successfully');
    console.log('✅ ToolDefinition CRUD tests passed');
    
    return true;
  } catch (error) {
    console.error('❌ ToolDefinition test failed:', error);
    return false;
  }
}

/**
 * Test CRUD operations on Configuration model
 * @returns {Promise<boolean>} Success status
 */
async function testConfiguration() {
  try {
    console.log('\n🔄 Testing Configuration CRUD operations...');
    
    // Create test configuration
    const testConfigKey = `TEST_CONFIG_${Date.now()}`;
    
    console.log(`📝 Creating test configuration: ${testConfigKey}`);
    
    await Configuration.updateConfig(testConfigKey, 'test_value', false);
    console.log('✅ Test configuration created successfully');
    
    // Read test configuration
    console.log('🔍 Reading test configuration...');
    const readConfig = await Configuration.getByKey(testConfigKey);
    
    if (!readConfig) {
      throw new Error('Test configuration not found after creation');
    }
    
    console.log('✅ Test configuration read successfully');
    console.log(`📊 Value: ${readConfig.value}`);
    
    // Test encryption
    console.log('🔐 Testing encryption/decryption...');
    
    // Update with encryption
    await Configuration.updateConfig(testConfigKey, 'secret_value', true);
    
    // Get encrypted and decrypted values
    const encryptedConfig = await Configuration.getByKey(testConfigKey);
    const decryptedValue = encryptedConfig.getDecryptedValue();
    
    console.log(`📊 Encrypted value: ${encryptedConfig.value}`);
    console.log(`📊 Decrypted value: ${decryptedValue}`);
    
    if (decryptedValue !== 'secret_value') {
      throw new Error('Encryption/decryption test failed');
    }
    
    console.log('✅ Encryption test passed');
    
    // Delete test configuration
    console.log('🗑️ Deleting test configuration...');
    await Configuration.deleteOne({ key: testConfigKey });
    
    // Verify deletion
    const deletedConfig = await Configuration.getByKey(testConfigKey);
    
    if (deletedConfig) {
      throw new Error('Configuration deletion failed');
    }
    
    console.log('✅ Test configuration deleted successfully');
    console.log('✅ Configuration CRUD tests passed');
    
    return true;
  } catch (error) {
    console.error('❌ Configuration test failed:', error);
    return false;
  }
}

/**
 * Test CRUD operations on ToolExecution model
 * @returns {Promise<boolean>} Success status
 */
async function testToolExecution() {
  try {
    console.log('\n🔄 Testing ToolExecution CRUD operations...');
    
    // Create execution logger
    console.log('📝 Creating test execution...');
    
    const executionLogger = await ToolExecution.logExecution({
      toolName: 'test_tool',
      provider: 'direct',
      sessionId: `test_session_${Date.now()}`,
      inputs: { test: 'value' },
      ipAddress: '127.0.0.1',
      userAgent: 'Test User Agent',
      userId: 'test_user',
      modelName: 'test_model'
    });
    
    console.log('✅ Test execution created successfully');
    
    // Complete the execution
    console.log('🔄 Completing test execution...');
    
    const testResult = { status: 'success', value: 'test_result' };
    await executionLogger.complete(testResult);
    
    console.log('✅ Test execution completed successfully');
    
    // Get execution stats
    console.log('📊 Testing execution statistics...');
    
    const stats = await ToolExecution.getStats({ period: 'day' });
    
    console.log(`📊 Total executions: ${stats.totalCount}`);
    console.log(`📊 Success rate: ${stats.successRate}`);
    
    console.log('✅ ToolExecution CRUD tests passed');
    
    return true;
  } catch (error) {
    console.error('❌ ToolExecution test failed:', error);
    return false;
  }
}

/**
 * Run database connection and data handling tests
 */
async function runTests() {
  console.log('🧪 Starting MongoDB tests...');
  
  try {
    // Test connection
    const connectionSuccessful = await testConnection();
    
    if (!connectionSuccessful) {
      console.error('❌ MongoDB connection test failed. Aborting further tests.');
      process.exit(1);
    }
    
    // Run model tests
    let allTestsPassed = true;
    
    // ToolDefinition tests
    const toolTestsPassed = await testToolDefinitions();
    allTestsPassed = allTestsPassed && toolTestsPassed;
    
    // Configuration tests
    const configTestsPassed = await testConfiguration();
    allTestsPassed = allTestsPassed && configTestsPassed;
    
    // ToolExecution tests
    const executionTestsPassed = await testToolExecution();
    allTestsPassed = allTestsPassed && executionTestsPassed;
    
    // Show results
    console.log('\n🧪 Test Results:');
    console.log(`Connection: ${connectionSuccessful ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`ToolDefinition: ${toolTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Configuration: ${configTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`ToolExecution: ${executionTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Close MongoDB connection
    await closeDB();
    
    if (allTestsPassed) {
      console.log('\n🎉 All MongoDB tests passed! Your MongoDB connection is working correctly.');
    } else {
      console.error('\n❌ Some tests failed. Please check the error messages above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unhandled error during tests:', error);
    
    // Try to close connection if there was an error
    try {
      await closeDB();
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
    
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Unhandled error during tests:', error);
    process.exit(1);
  });
}

module.exports = {
  testConnection,
  testToolDefinitions,
  testConfiguration,
  testToolExecution,
  runTests
};