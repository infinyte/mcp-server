/**
 * Integration test for the tools discovery and usage flow
 * 
 * This test verifies that the tools discovery endpoint provides accurate
 * information that can be used to call the actual tools.
 */
const http = require('http');
const assert = require('assert');

// Server URL (will default to localhost:3000 if not set in environment)
const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000';
// Extract host and port from server URL
const urlObj = new URL(serverUrl);
const host = urlObj.hostname;
const port = urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80);

/**
 * Helper function to make HTTP requests to the server
 * @param {string} path - The URL path
 * @param {string} method - HTTP method
 * @param {Object} query - Query parameters for GET requests
 * @param {Object} body - Request body for POST requests
 * @returns {Promise<Object>} - Response object
 */
function makeRequest(path, method = 'GET', query = {}, body = null) {
  return new Promise((resolve, reject) => {
    // Convert query params to string for GET requests
    let requestPath = path;
    if (method === 'GET' && Object.keys(query).length > 0) {
      const queryString = Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      requestPath = `${path}?${queryString}`;
    }
    
    const options = {
      hostname: host,
      port: port,
      path: requestPath,
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          let parsedData = data;
          // Try to parse as JSON if appropriate
          if (data && data.trim() && (
            res.headers['content-type']?.includes('application/json') || 
            data.trim().startsWith('{') || 
            data.trim().startsWith('[')
          )) {
            parsedData = JSON.parse(data);
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
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Run integration tests for tools discovery and usage
 */
async function runTests() {
  console.log('=== Testing tools discovery and usage integration ===');
  let allTestsPassed = true;
  
  try {
    // Test 1: Discover tools and use the information to call a tool
    console.log('\nTest 1: Discover and use a tool');
    
    // First, get all available tools
    const toolsResponse = await makeRequest('/tools/available');
    
    assert.strictEqual(toolsResponse.statusCode, 200, 'Status code should be 200');
    assert.strictEqual(toolsResponse.data.success, true, 'Response should indicate success');
    assert(Array.isArray(toolsResponse.data.tools), 'Response should contain tools array');
    assert(toolsResponse.data.tools.length > 0, 'Tools array should not be empty');
    
    // Find a web search tool that we can test
    const webSearchTool = toolsResponse.data.tools.find(tool => 
      tool.name === 'web_search' || 
      (tool.category === 'web' && tool.name.includes('search'))
    );
    
    if (!webSearchTool) {
      console.log('⚠️ Web search tool not found, skipping tool usage test');
      return true;
    }
    
    console.log(`Found web search tool: ${webSearchTool.name}`);
    
    // Verify the tool has usage information
    assert(webSearchTool.usage, 'Tool should have usage information');
    assert(webSearchTool.usage.endpoint, 'Tool should have endpoint information');
    assert(webSearchTool.usage.method, 'Tool should have method information');
    
    // Get required parameters
    const requiredParams = {};
    for (const [paramName, paramInfo] of Object.entries(webSearchTool.parameters)) {
      if (paramInfo.required) {
        // Set a default value based on the parameter name
        if (paramName === 'query') {
          requiredParams[paramName] = 'integration test';
        } else if (paramName === 'url') {
          requiredParams[paramName] = 'https://example.com';
        } else {
          requiredParams[paramName] = 'test_value';
        }
      }
    }
    
    // Call the tool using the discovered information
    console.log(`Calling ${webSearchTool.usage.endpoint} with parameters:`, requiredParams);
    const toolResponse = await makeRequest(
      webSearchTool.usage.endpoint,
      webSearchTool.usage.method,
      {},
      requiredParams
    );
    
    assert.strictEqual(toolResponse.statusCode, 200, 'Tool endpoint should return status 200');
    
    // Verify the response is in the expected format
    // For web search, we should have a results array
    if (webSearchTool.name === 'web_search') {
      assert(Array.isArray(toolResponse.data.results) || toolResponse.data.results === null, 
        'Web search should return results array (or null placeholder)');
    }
    
    console.log('✅ Tool discovery and usage integration test passed');
    
    // Test 2: Test filtering and finding a specific tool
    console.log('\nTest 2: Testing category filtering for tool discovery');
    
    // Get a category from the first test response
    const category = toolsResponse.data.metadata.categories.find(c => c !== 'other') || 'web';
    const categoryResponse = await makeRequest('/tools/available', 'GET', { category });
    
    assert.strictEqual(categoryResponse.statusCode, 200, 'Status code should be 200');
    assert(categoryResponse.data.tools.every(tool => tool.category === category), 
           'All tools should be in the requested category');
    
    console.log(`✅ Category filtering test passed (category: ${category})`);
    
    console.log('\n✅ All tools discovery and usage integration tests passed!');
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