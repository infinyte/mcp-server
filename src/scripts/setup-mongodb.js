/**
 * MongoDB Setup Script for MCP Server
 * 
 * This script handles the MongoDB setup process, including:
 * - Creating database and collections
 * - Setting up authentication
 * - Creating indexes for performance
 * - Verifying the setup is working correctly
 */
const { connectDB, closeDB, mongoose } = require('../config/database');
const { ToolDefinition, Configuration, ToolExecution } = require('../models');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

// Promisify the exec function
const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

/**
 * Check if Docker is available
 * @returns {Promise<boolean>} Docker availability
 */
async function checkDocker() {
  try {
    console.log('🔍 Checking if Docker is available...');
    const { stdout } = await execAsync('docker --version');
    console.log(`✅ Docker is available: ${stdout.trim()}`);
    return true;
  } catch (error) {
    console.warn('⚠️ Docker is not available:', error.message);
    return false;
  }
}

/**
 * Check if Docker Compose is available
 * @returns {Promise<boolean>} Docker Compose availability
 */
async function checkDockerCompose() {
  try {
    console.log('🔍 Checking if Docker Compose is available...');
    
    // Try the v2 compose command first
    try {
      const { stdout } = await execAsync('docker compose version');
      console.log(`✅ Docker Compose is available: ${stdout.trim()}`);
      return true;
    } catch (composeError) {
      // Fall back to the v1 docker-compose command
      const { stdout } = await execAsync('docker-compose --version');
      console.log(`✅ Docker Compose (v1) is available: ${stdout.trim()}`);
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Docker Compose is not available:', error.message);
    return false;
  }
}

/**
 * Start MongoDB using Docker Compose
 * @returns {Promise<boolean>} Success status
 */
async function startDockerMongoDB() {
  try {
    console.log('🔄 Starting MongoDB using Docker Compose...');
    
    // Set Docker Compose command based on version
    let composeCmd = 'docker compose';
    
    try {
      await execAsync('docker compose version');
    } catch (composeError) {
      // Fall back to the v1 docker-compose command
      composeCmd = 'docker-compose';
    }
    
    // Check if MongoDB is already running
    const { stdout: psOutput } = await execAsync(`${composeCmd} ps`);
    const isRunning = psOutput.includes('mcp-mongodb') && !psOutput.includes('Exit');
    
    if (isRunning) {
      console.log('✅ MongoDB is already running');
      return true;
    }
    
    // Start MongoDB and Mongo Express
    const { stdout } = await execAsync(`${composeCmd} up -d`);
    console.log(stdout.trim());
    
    console.log('✅ MongoDB started successfully');
    
    // Wait a moment for MongoDB to initialize
    console.log('⏳ Waiting for MongoDB to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return true;
  } catch (error) {
    console.error('❌ Error starting MongoDB:', error.message);
    return false;
  }
}

/**
 * Create default .env file with MongoDB connection
 * @returns {Promise<boolean>} Success status
 */
async function createEnvFile() {
  try {
    console.log('🔄 Creating/updating .env file...');
    
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    // Check if .env file exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      console.log('📝 Existing .env file found');
    } else {
      console.log('📝 Creating new .env file');
    }
    
    // Add MongoDB URI if not present
    if (!envContent.includes('MONGODB_URI=')) {
      envContent += '\n# MongoDB Connection\n';
      envContent += 'MONGODB_URI=mongodb://mcpuser:mcppassword@localhost:27017/mcp-server\n';
    }
    
    // Add encryption key if not present
    if (!envContent.includes('ENCRYPTION_KEY=')) {
      const randomKey = require('crypto').randomBytes(32).toString('hex');
      envContent += '\n# Security\n';
      envContent += `ENCRYPTION_KEY=${randomKey}\n`;
    }
    
    // Write the file
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ .env file updated successfully');
    return true;
  } catch (error) {
    console.error('❌ Error creating .env file:', error.message);
    return false;
  }
}

/**
 * Verify MongoDB connection and setup
 * @returns {Promise<boolean>} Success status
 */
async function verifySetup() {
  try {
    console.log('🔄 Verifying MongoDB setup...');
    
    // Connect to MongoDB
    await connectDB();
    
    console.log('✅ Connected to MongoDB');
    
    // Test creating a document in each collection
    const testToolName = `test_tool_${Date.now()}`;
    const testConfigKey = `TEST_CONFIG_${Date.now()}`;
    
    // Create test tool
    const toolDef = new ToolDefinition({
      name: testToolName,
      description: 'Test tool for setup verification',
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
      enabled: true
    });
    
    await toolDef.save();
    console.log('✅ Test tool creation successful');
    
    // Create test config
    await Configuration.updateConfig(testConfigKey, 'test_value', false);
    console.log('✅ Test configuration creation successful');
    
    // Create test execution
    const executionLogger = await ToolExecution.logExecution({
      toolName: 'test_setup',
      provider: 'direct',
      sessionId: `test_session_${Date.now()}`,
      inputs: { test: 'value' }
    });
    
    await executionLogger.complete({ status: 'success' });
    console.log('✅ Test execution creation successful');
    
    // Clean up test data
    await ToolDefinition.deleteOne({ name: testToolName });
    await Configuration.deleteOne({ key: testConfigKey });
    
    console.log('✅ Test data cleanup successful');
    
    // Close connection
    await closeDB();
    
    return true;
  } catch (error) {
    console.error('❌ Error verifying MongoDB setup:', error);
    
    // Try to close connection
    try {
      await closeDB();
    } catch (closeError) {
      // Ignore close error
    }
    
    return false;
  }
}

/**
 * Check if manual MongoDB setup is required
 * @returns {Promise<void>}
 */
async function promptForManualSetup() {
  console.log('\n📋 MongoDB Setup Options:');
  console.log('1. Docker (automatic setup, recommended)');
  console.log('2. Local MongoDB installation');
  console.log('3. MongoDB Atlas (cloud)');
  
  // Create readline interface for input
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question('Select an option (1-3): ', async (answer) => {
      const option = parseInt(answer.trim(), 10) || 1;
      
      switch (option) {
        case 1:
          console.log('🔄 Setting up MongoDB with Docker...');
          rl.close();
          resolve('docker');
          break;
        
        case 2:
          console.log('🔄 Setting up for local MongoDB installation...');
          rl.question('Enter your MongoDB connection string (default: mongodb://localhost:27017/mcp-server): ', (uri) => {
            const mongoUri = uri.trim() || 'mongodb://localhost:27017/mcp-server';
            rl.close();
            
            // Update .env file with custom URI
            try {
              const envPath = path.join(__dirname, '../../.env');
              let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
              
              // Replace or add MongoDB URI
              if (envContent.includes('MONGODB_URI=')) {
                envContent = envContent.replace(/MONGODB_URI=.*/g, `MONGODB_URI=${mongoUri}`);
              } else {
                envContent += `\nMONGODB_URI=${mongoUri}\n`;
              }
              
              fs.writeFileSync(envPath, envContent);
              console.log('✅ .env file updated with custom MongoDB URI');
            } catch (error) {
              console.error('❌ Error updating .env file:', error.message);
            }
            
            resolve('local');
          });
          break;
        
        case 3:
          console.log('🔄 Setting up for MongoDB Atlas...');
          rl.question('Enter your MongoDB Atlas connection string: ', (uri) => {
            if (!uri || !uri.includes('mongodb+srv://')) {
              console.error('❌ Invalid MongoDB Atlas connection string');
              rl.close();
              resolve('atlas-error');
              return;
            }
            
            rl.close();
            
            // Update .env file with Atlas URI
            try {
              const envPath = path.join(__dirname, '../../.env');
              let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
              
              // Replace or add MongoDB URI
              if (envContent.includes('MONGODB_URI=')) {
                envContent = envContent.replace(/MONGODB_URI=.*/g, `MONGODB_URI=${uri}`);
              } else {
                envContent += `\nMONGODB_URI=${uri}\n`;
              }
              
              fs.writeFileSync(envPath, envContent);
              console.log('✅ .env file updated with MongoDB Atlas URI');
            } catch (error) {
              console.error('❌ Error updating .env file:', error.message);
            }
            
            resolve('atlas');
          });
          break;
        
        default:
          console.log('⚠️ Invalid option, using default (Docker)');
          rl.close();
          resolve('docker');
      }
    });
  });
}

/**
 * Run MongoDB setup process
 */
async function setupMongoDB() {
  console.log('🚀 Starting MongoDB setup for MCP Server...');
  
  try {
    // Check if Docker is available if we want to use Docker
    const dockerAvailable = await checkDocker();
    const dockerComposeAvailable = dockerAvailable && await checkDockerCompose();
    
    let setupMethod;
    
    if (dockerComposeAvailable) {
      // Use Docker Compose
      console.log('✅ Docker and Docker Compose are available, using for MongoDB setup');
      
      // Start MongoDB using Docker Compose
      await startDockerMongoDB();
      
      // Create/update .env file
      await createEnvFile();
      
      setupMethod = 'docker';
    } else {
      // Prompt for manual setup
      setupMethod = await promptForManualSetup();
      
      if (setupMethod === 'docker') {
        console.error('❌ Docker setup was selected but Docker or Docker Compose is not available');
        console.log('Please install Docker and Docker Compose, or choose another setup method');
        process.exit(1);
      }
    }
    
    // Reload environment variables
    delete require.cache[require.resolve('dotenv')];
    dotenv.config();
    
    // Verify setup
    const setupVerified = await verifySetup();
    
    if (setupVerified) {
      console.log('\n🎉 MongoDB setup complete!');
      
      if (setupMethod === 'docker') {
        console.log('\n📊 MongoDB Details:');
        console.log('- Connection URI: mongodb://mcpuser:mcppassword@localhost:27017/mcp-server');
        console.log('- Username: mcpuser');
        console.log('- Password: mcppassword');
        console.log('- Mongo Express UI: http://localhost:8081');
      }
      
      console.log('\n📝 Next Steps:');
      console.log('1. Start the MCP server to begin using MongoDB');
      console.log('2. Run the migration script to import your existing data:');
      console.log('   node src/scripts/migrate-to-mongodb.js');
    } else {
      console.error('\n❌ MongoDB setup verification failed');
      console.log('Please check your MongoDB connection and try again');
      
      if (setupMethod === 'docker') {
        console.log('\nTroubleshooting tips:');
        console.log('1. Check if Docker containers are running: docker compose ps');
        console.log('2. Check container logs: docker compose logs mongodb');
        console.log('3. Try restarting containers: docker compose restart');
      }
    }
  } catch (error) {
    console.error('❌ Error during MongoDB setup:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupMongoDB().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Unhandled error during setup:', error);
    process.exit(1);
  });
}

module.exports = {
  checkDocker,
  checkDockerCompose,
  startDockerMongoDB,
  createEnvFile,
  verifySetup,
  setupMongoDB
};