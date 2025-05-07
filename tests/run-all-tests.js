/**
 * MCP Server Test Suite Runner
 * 
 * This script runs all the test suites for the MCP server.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// List of test suites to run
const testSuites = [
  { name: 'API Tests', path: './api/index.js' },
  { name: 'Security Tests', path: './security/index.js' },
  { name: 'Integration Tests', path: './integration/index.js' },
  { name: 'Unit Tests', path: './unit/index.js' }
];

// Track overall success
let allTestsPassed = true;
let results = [];

console.log('=== MCP Server Test Suite ===\n');

// Run each test suite
testSuites.forEach(suite => {
  const suitePath = path.join(__dirname, suite.path);
  
  // Check if the suite exists
  if (!fs.existsSync(suitePath)) {
    console.log(`⚠️  Skipping ${suite.name}: Test suite not found at ${suitePath}`);
    return;
  }
  
  console.log(`Running ${suite.name}...`);
  
  try {
    // Execute the test suite
    execSync(`node ${suitePath}`, { stdio: 'inherit' });
    results.push({ suite: suite.name, passed: true });
    console.log(`✅ ${suite.name} passed\n`);
  } catch (error) {
    results.push({ suite: suite.name, passed: false });
    console.error(`❌ ${suite.name} failed\n`);
    allTestsPassed = false;
  }
});

// Print summary
console.log('=== Test Summary ===');
results.forEach(result => {
  console.log(`${result.suite}: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
});

// Exit with appropriate code
process.exit(allTestsPassed ? 0 : 1);