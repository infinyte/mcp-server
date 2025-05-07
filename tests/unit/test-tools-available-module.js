/**
 * Unit test for the tools-available.js module
 * 
 * Tests the functionality of the tools discovery module without requiring a server.
 */
const assert = require('assert');

// Mock Express request and response
const mockRequest = (query = {}) => ({
  query
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.header = jest.fn().mockReturnValue(res);
  return res;
};

// Mock tools data
const mockTools = {
  getAllToolDefinitions: () => [
    {
      name: 'web_search',
      description: 'Search the web for information',
      category: 'web',
      version: '1.0.0',
      provider: 'google',
      enabled: true,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 5
          }
        },
        required: ['query']
      }
    },
    {
      name: 'generate_image',
      description: 'Generate an image from a text prompt',
      category: 'image',
      version: '1.0.0',
      provider: 'openai',
      enabled: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image'
          },
          size: {
            type: 'string',
            description: 'Image size',
            default: '1024x1024'
          }
        },
        required: ['prompt']
      }
    }
  ]
};

// Mock database service
const mockDatabaseService = {
  getAllTools: async (options = {}) => {
    let tools = [...mockTools.getAllToolDefinitions()];
    
    // Apply filtering based on options
    if (options.category) {
      tools = tools.filter(tool => tool.category === options.category);
    }
    
    if (options.enabledOnly) {
      tools = tools.filter(tool => tool.enabled !== false);
    }
    
    return tools;
  }
};

// Import the module to test
const toolsAvailableHandler = require('../../src/tools-available');

// Test function
async function runTests() {
  console.log('=== Testing tools-available.js module ===');
  let allTestsPassed = true;
  
  try {
    // Create handler
    const handler = toolsAvailableHandler(mockTools, mockDatabaseService);
    
    // Test 1: JSON response
    console.log('\nTest 1: Testing JSON response');
    const req1 = mockRequest();
    const res1 = mockResponse();
    
    await handler(req1, res1);
    
    assert(res1.json.mock.calls.length === 1, 'json method should be called once');
    const jsonResponse = res1.json.mock.calls[0][0];
    
    assert(jsonResponse.success === true, 'Response should indicate success');
    assert(Array.isArray(jsonResponse.tools), 'Response should contain tools array');
    assert(jsonResponse.tools.length === 2, 'Should return all mock tools');
    assert(typeof jsonResponse.metadata === 'object', 'Response should contain metadata');
    assert(jsonResponse.metadata.categories.includes('web'), 'Categories should include "web"');
    assert(jsonResponse.metadata.categories.includes('image'), 'Categories should include "image"');
    
    console.log('✅ JSON response test passed');
    
    // Test 2: Category filtering
    console.log('\nTest 2: Testing category filtering');
    const req2 = mockRequest({ category: 'web' });
    const res2 = mockResponse();
    
    await handler(req2, res2);
    
    assert(res2.json.mock.calls.length === 1, 'json method should be called once');
    const categoryResponse = res2.json.mock.calls[0][0];
    
    assert(categoryResponse.tools.length === 1, 'Should return only web tools');
    assert(categoryResponse.tools[0].category === 'web', 'Tool should be in web category');
    assert(categoryResponse.tools[0].name === 'web_search', 'Tool name should be web_search');
    
    console.log('✅ Category filtering test passed');
    
    // Test 3: Format conversion
    console.log('\nTest 3: Testing YAML format');
    const req3 = mockRequest({ format: 'yaml' });
    const res3 = mockResponse();
    
    await handler(req3, res3);
    
    assert(res3.header.mock.calls.length === 1, 'header method should be called once');
    assert(res3.header.mock.calls[0][0] === 'Content-Type', 'Should set Content-Type header');
    assert(res3.header.mock.calls[0][1] === 'text/yaml', 'Should set text/yaml Content-Type');
    assert(res3.send.mock.calls.length === 1, 'send method should be called once');
    
    console.log('✅ YAML format test passed');
    
    // Test 4: Table format
    console.log('\nTest 4: Testing table format');
    const req4 = mockRequest({ format: 'table' });
    const res4 = mockResponse();
    
    await handler(req4, res4);
    
    assert(res4.header.mock.calls.length === 1, 'header method should be called once');
    assert(res4.header.mock.calls[0][0] === 'Content-Type', 'Should set Content-Type header');
    assert(res4.header.mock.calls[0][1] === 'text/plain', 'Should set text/plain Content-Type');
    assert(res4.send.mock.calls.length === 1, 'send method should be called once');
    const tableContent = res4.send.mock.calls[0][0];
    assert(tableContent.includes('| Name | Description | Category | Version |'), 'Table should have headers');
    assert(tableContent.includes('| web_search |'), 'Table should include tool name');
    
    console.log('✅ Table format test passed');
    
    // Test 5: HTML format
    console.log('\nTest 5: Testing HTML format');
    const req5 = mockRequest({ format: 'html' });
    const res5 = mockResponse();
    
    await handler(req5, res5);
    
    assert(res5.header.mock.calls.length === 1, 'header method should be called once');
    assert(res5.header.mock.calls[0][0] === 'Content-Type', 'Should set Content-Type header');
    assert(res5.header.mock.calls[0][1] === 'text/html', 'Should set text/html Content-Type');
    assert(res5.send.mock.calls.length === 1, 'send method should be called once');
    const htmlContent = res5.send.mock.calls[0][0];
    assert(htmlContent.includes('<html>'), 'HTML should have html tag');
    assert(htmlContent.includes('<table>'), 'HTML should include table tag');
    assert(htmlContent.includes('<td class="tool-name">web_search</td>'), 'HTML should include tool name');
    
    console.log('✅ HTML format test passed');
    
    // Test 6: Error handling
    console.log('\nTest 6: Testing error handling');
    // Create a database service that throws an error
    const errorDatabaseService = {
      getAllTools: async () => {
        throw new Error('Test error');
      }
    };
    
    const errorHandler = toolsAvailableHandler(mockTools, errorDatabaseService);
    const req6 = mockRequest();
    const res6 = mockResponse();
    
    await errorHandler(req6, res6);
    
    assert(res6.status.mock.calls.length === 1, 'status method should be called once');
    assert(res6.status.mock.calls[0][0] === 500, 'Should return status 500');
    assert(res6.json.mock.calls.length === 1, 'json method should be called once');
    const errorResponse = res6.json.mock.calls[0][0];
    assert(errorResponse.success === false, 'Response should indicate failure');
    assert(errorResponse.error === 'Test error', 'Response should include error message');
    
    console.log('✅ Error handling test passed');
    
    console.log('\n✅ All tools-available.js module tests passed!');
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    allTestsPassed = false;
  }
  
  return allTestsPassed;
}

// Run tests directly with simplified mocking
if (require.main === module) {
  // Create a simple mock helper for direct testing
  const createMockHelper = () => {
    const mock = {};
    
    mock.req = (query = {}) => ({ query });
    
    mock.res = () => {
      const res = {};
      const calls = { json: [], send: [], header: [], status: [] };
      
      res.json = (data) => {
        calls.json.push(data);
        return res;
      };
      
      res.send = (data) => {
        calls.send.push(data);
        return res;
      };
      
      res.header = (name, value) => {
        calls.header.push([name, value]);
        return res;
      };
      
      res.status = (code) => {
        calls.status.push(code);
        return res;
      };
      
      // Add mock property to access calls
      res.mock = {
        calls
      };
      
      return res;
    };
    
    return mock;
  };

  // Replace assertion functions with simpler versions
  const simplifiedAssert = {
    // Original assert still available
    ...assert,
    
    // For mocks
    mockCalled: (mock, method, times = 1) => {
      const actual = mock.mock.calls[method]?.length || 0;
      if (actual !== times) {
        throw new Error(`Expected method ${method} to be called ${times} time(s), but was called ${actual} time(s)`);
      }
    }
  };
  
  // Run a simplified version of the test
  const runSimplifiedTest = async () => {
    console.log('=== Testing tools-available.js module (simplified) ===');
    let allTestsPassed = true;
    
    try {
      // Create handler
      const handler = toolsAvailableHandler(mockTools, mockDatabaseService);
      const mock = createMockHelper();
      
      // Test 1: JSON response
      console.log('\nTest 1: Testing JSON response');
      const req1 = mock.req();
      const res1 = mock.res();
      
      await handler(req1, res1);
      
      if (res1.mock.calls.json.length !== 1) {
        throw new Error(`Expected json method to be called once, but was called ${res1.mock.calls.json.length} times`);
      }
      
      const jsonResponse = res1.mock.calls.json[0];
      
      if (!jsonResponse.success) {
        throw new Error('Expected response to indicate success');
      }
      
      if (!Array.isArray(jsonResponse.tools)) {
        throw new Error('Expected response to contain tools array');
      }
      
      if (jsonResponse.tools.length !== 2) {
        throw new Error(`Expected 2 tools, but got ${jsonResponse.tools.length}`);
      }
      
      console.log('✅ JSON response test passed');
      
      // Test 2: Category filtering
      console.log('\nTest 2: Testing category filtering');
      const req2 = mock.req({ category: 'web' });
      const res2 = mock.res();
      
      await handler(req2, res2);
      
      if (res2.mock.calls.json.length !== 1) {
        throw new Error(`Expected json method to be called once, but was called ${res2.mock.calls.json.length} times`);
      }
      
      const categoryResponse = res2.mock.calls.json[0];
      
      if (categoryResponse.tools.length !== 1) {
        throw new Error(`Expected 1 tool, but got ${categoryResponse.tools.length}`);
      }
      
      if (categoryResponse.tools[0].category !== 'web') {
        throw new Error(`Expected tool category to be 'web', but got '${categoryResponse.tools[0].category}'`);
      }
      
      console.log('✅ Category filtering test passed');
      
      console.log('\n✅ All tools-available.js module tests passed!');
      return true;
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      return false;
    }
  };
  
  runSimplifiedTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = runTests;