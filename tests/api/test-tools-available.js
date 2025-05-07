/**
 * Test for the /tools/available endpoint
 * 
 * This test verifies the functionality of the tools listing endpoint.
 */
const http = require('http');
const assert = require('assert');
const yaml = require('js-yaml');

// Server URL (will default to localhost:3000 if not set in environment)
const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000';
// Extract host and port from server URL
const urlObj = new URL(serverUrl);
const host = urlObj.hostname;
const port = urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80);

/**
 * Helper function to make HTTP GET requests to the server
 * @param {string} path - The URL path
 * @param {Object} query - Query parameters
 * @returns {Promise<Object>} - Response object
 */
function makeRequest(path, query = {}) {
  return new Promise((resolve, reject) => {
    // Convert query params to string
    const queryString = Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    const requestPath = queryString ? `${path}?${queryString}` : path;
    
    const options = {
      hostname: host,
      port: port,
      path: requestPath,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          // Parse response based on content type
          const contentType = res.headers['content-type'] || '';
          
          let parsedData;
          if (contentType.includes('application/json')) {
            parsedData = JSON.parse(data);
          } else if (contentType.includes('text/yaml')) {
            parsedData = yaml.load(data);
          } else {
            parsedData = data;
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Run all tests for the tools available endpoint
 */
async function runTests() {
  console.log('=== Testing /tools/available endpoint ===');
  let allTestsPassed = true;
  
  try {
    // Test 1: Basic endpoint test (JSON format)
    console.log('\nTest 1: Basic endpoint test with JSON format');
    const jsonResponse = await makeRequest('/tools/available');
    
    assert.strictEqual(jsonResponse.statusCode, 200, 'Status code should be 200');
    assert.strictEqual(jsonResponse.data.success, true, 'Response should indicate success');
    assert(Array.isArray(jsonResponse.data.tools), 'Response should contain tools array');
    assert(jsonResponse.data.tools.length > 0, 'Tools array should not be empty');
    assert(typeof jsonResponse.data.metadata === 'object', 'Response should contain metadata');
    
    console.log('✅ JSON response test passed');
    
    // Test 2: YAML format test
    console.log('\nTest 2: Testing YAML format');
    const yamlResponse = await makeRequest('/tools/available', { format: 'yaml' });
    
    assert.strictEqual(yamlResponse.statusCode, 200, 'Status code should be 200');
    assert.strictEqual(yamlResponse.data.success, true, 'Response should indicate success');
    assert(Array.isArray(yamlResponse.data.tools), 'YAML response should contain tools array');
    
    console.log('✅ YAML format test passed');
    
    // Test 3: Table format test
    console.log('\nTest 3: Testing Table format');
    const tableResponse = await makeRequest('/tools/available', { format: 'table' });
    
    assert.strictEqual(tableResponse.statusCode, 200, 'Status code should be 200');
    assert(typeof tableResponse.data === 'string', 'Table response should be a string');
    assert(tableResponse.data.includes('| Name | Description | Category | Version |'), 'Table should have headers');
    
    console.log('✅ Table format test passed');
    
    // Test 4: HTML format test
    console.log('\nTest 4: Testing HTML format');
    const htmlResponse = await makeRequest('/tools/available', { format: 'html' });
    
    assert.strictEqual(htmlResponse.statusCode, 200, 'Status code should be 200');
    assert(typeof htmlResponse.data === 'string', 'HTML response should be a string');
    assert(htmlResponse.data.includes('<html>'), 'Response should be HTML');
    assert(htmlResponse.data.includes('<table>'), 'HTML should contain a table');
    
    console.log('✅ HTML format test passed');
    
    // Test 5: Filtering by category
    console.log('\nTest 5: Testing category filtering');
    // Get a category from the first test response
    const category = jsonResponse.data.metadata.categories[0];
    const categoryResponse = await makeRequest('/tools/available', { category });
    
    assert.strictEqual(categoryResponse.statusCode, 200, 'Status code should be 200');
    assert(categoryResponse.data.tools.every(tool => tool.category === category), 
           'All tools should be in the requested category');
    
    console.log(`✅ Category filtering test passed (category: ${category})`);
    
    // Test 6: Filtering by enabled status
    console.log('\nTest 6: Testing enabled filter');
    const enabledResponse = await makeRequest('/tools/available', { enabled: 'true' });
    
    assert.strictEqual(enabledResponse.statusCode, 200, 'Status code should be 200');
    assert(enabledResponse.data.tools.every(tool => tool.enabled), 
           'All tools should be enabled');
    
    console.log('✅ Enabled filtering test passed');
    
    // Test 7: Test pagination
    console.log('\nTest 7: Testing pagination');
    const limitedResponse = await makeRequest('/tools/available', { limit: 2 });
    
    assert.strictEqual(limitedResponse.statusCode, 200, 'Status code should be 200');
    assert(limitedResponse.data.tools.length <= 2, 'Should return at most 2 tools');
    assert(limitedResponse.data.metadata.limit === 2, 'Limit metadata should be 2');
    
    console.log('✅ Pagination test passed');
    
    console.log('\n✅ All /tools/available endpoint tests passed!');
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    allTestsPassed = false;
  }
  
  return allTestsPassed;
}

// Run the tests if this file is run directly
if (require.main === module) {
  // Check if the server is running first
  makeRequest('/health')
    .then(res => {
      if (res.statusCode !== 200) {
        console.error('❌ Server is not healthy. Make sure the MCP server is running.');
        process.exit(1);
      }
      
      runTests()
        .then(success => {
          process.exit(success ? 0 : 1);
        })
        .catch(error => {
          console.error('Unhandled error:', error);
          process.exit(1);
        });
    })
    .catch(error => {
      console.error('❌ Failed to connect to server. Make sure the MCP server is running at', serverUrl);
      process.exit(1);
    });
}

module.exports = runTests;