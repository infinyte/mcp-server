/**
 * MCP Server Unit Tests
 * 
 * This suite tests individual components and functions.
 */
const { execSync } = require('child_process');
const path = require('path');

console.log('=== Running Unit Tests ===');

// Define the test files
const testFiles = [
  { name: 'Web Search Unit Test', path: './test-web-search.js' },
  { name: 'Tools Available Module Test', path: './test-tools-available-module.js' },
  { name: 'Tools Discovery Advanced Filters Test', path: './test-tools-discovery-advanced-filters.js' }
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

console.log('\n✅ All Unit tests passed');