/**
 * MCP Server Security Tests
 * 
 * This suite tests the security features like encryption.
 */
const { execSync } = require('child_process');
const path = require('path');

console.log('=== Running Security Tests ===');

// Define the test files
const testFiles = [
  { name: 'Encryption Test', path: './test-encryption.js' }
];

// Track overall success
let allTestsPassed = true;

// Run each test file
testFiles.forEach(test => {
  const testPath = path.join(__dirname, test.path);
  
  console.log(`\nRunning ${test.name}...`);
  
  try {
    // Execute the test
    execSync(`node ${testPath}`, { stdio: 'inherit' });
    console.log(`✅ ${test.name} passed`);
  } catch (error) {
    console.error(`❌ ${test.name} failed`);
    allTestsPassed = false;
  }
});

// Exit with appropriate code
if (!allTestsPassed) {
  process.exit(1);
}

console.log('\n✅ All Security tests passed');