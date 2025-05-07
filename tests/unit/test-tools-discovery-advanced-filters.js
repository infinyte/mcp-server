/**
 * Unit test for advanced filtering features of the tools-available.js module
 * 
 * Tests search term, provider filtering, and combined filtering
 */
const assert = require('assert');

// Import the module to test
const toolsAvailableHandler = require('../../src/tools-available');

// More comprehensive mock tools data for testing advanced filters
const mockTools = {
  getAllToolDefinitions: () => [
    {
      name: 'web_search',
      description: 'Search the web for information',
      category: 'web',
      version: '1.0.0',
      provider: 'google',
      enabled: true,
      tags: ['search', 'web', 'information'],
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
      tags: ['image', 'generation', 'ai'],
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
    },
    {
      name: 'weather_forecast',
      description: 'Get weather forecast for a location',
      category: 'weather',
      version: '1.1.0',
      provider: 'weatherapi',
      enabled: true,
      tags: ['weather', 'forecast', 'location'],
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City or coordinates'
          },
          days: {
            type: 'number',
            description: 'Number of days',
            default: 3
          }
        },
        required: ['location']
      }
    },
    {
      name: 'language_translation',
      description: 'Translate text between languages',
      category: 'language',
      version: '1.0.0',
      provider: 'google',
      enabled: true,
      tags: ['translation', 'language', 'text'],
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to translate'
          },
          source: {
            type: 'string',
            description: 'Source language',
            default: 'auto'
          },
          target: {
            type: 'string',
            description: 'Target language',
            default: 'en'
          }
        },
        required: ['text', 'target']
      }
    },
    {
      name: 'code_analysis',
      description: 'Analyze code for bugs and best practices',
      category: 'development',
      version: '0.9.0',
      provider: 'anthropic',
      enabled: false, // Disabled tool for testing
      tags: ['code', 'analysis', 'development'],
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Code snippet to analyze'
          },
          language: {
            type: 'string',
            description: 'Programming language',
            default: 'javascript'
          }
        },
        required: ['code']
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

// Create a simple mock helper for testing
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

/**
 * Run advanced filtering tests
 */
async function runTests() {
  console.log('=== Testing tools-available.js advanced filtering ===');
  let allTestsPassed = true;
  
  try {
    // Create handler
    const handler = toolsAvailableHandler(mockTools, mockDatabaseService);
    const mock = createMockHelper();
    
    // Get all mock tools for testing
    const allMockTools = mockTools.getAllToolDefinitions();
    
    // Test 1: Search term filtering by name
    console.log('\nTest 1: Testing search term filtering by name');
    const req1 = mock.req({ search: 'web' });
    const res1 = mock.res();
    
    await handler(req1, res1);
    
    if (res1.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res1.mock.calls.json.length} times`);
    }
    
    const searchResponse = res1.mock.calls.json[0];
    
    if (searchResponse.tools.length !== 1) {
      throw new Error(`Expected 1 tool, but got ${searchResponse.tools.length}`);
    }
    
    if (!searchResponse.tools.some(tool => tool.name === 'web_search')) {
      throw new Error('Expected to find web_search tool in results');
    }
    
    console.log('✅ Search term by name test passed');
    
    // Test 2: Search term filtering by description
    console.log('\nTest 2: Testing search term filtering by description');
    const req2 = mock.req({ search: 'forecast' });
    const res2 = mock.res();
    
    await handler(req2, res2);
    
    if (res2.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res2.mock.calls.json.length} times`);
    }
    
    const descriptionResponse = res2.mock.calls.json[0];
    
    if (descriptionResponse.tools.length !== 1) {
      throw new Error(`Expected 1 tool, but got ${descriptionResponse.tools.length}`);
    }
    
    if (!descriptionResponse.tools.some(tool => tool.name === 'weather_forecast')) {
      throw new Error('Expected to find weather_forecast tool in results');
    }
    
    console.log('✅ Search term by description test passed');
    
    // Test 3: Search term filtering by description containing code
    console.log('\nTest 3: Testing search term filtering by description containing "code"');
    const req3 = mock.req({ search: 'code', enabled: 'false' }); // Include disabled tools
    const res3 = mock.res();
    
    await handler(req3, res3);
    
    if (res3.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res3.mock.calls.json.length} times`);
    }
    
    const codeResponse = res3.mock.calls.json[0];
    
    // Should find at least the code_analysis tool by name or description
    if (codeResponse.tools.length < 1) {
      throw new Error(`Expected at least 1 tool, but got ${codeResponse.tools.length}`);
    }
    
    // Verify at least one tool name or description contains 'code'
    const hasCodeTool = codeResponse.tools.some(tool => 
      tool.name.toLowerCase().includes('code') || 
      tool.description.toLowerCase().includes('code')
    );
    
    if (!hasCodeTool) {
      throw new Error('Expected to find a tool with "code" in name or description');
    }
    
    console.log('✅ Search term by description (code) test passed');
    
    // Test 4: Provider filtering
    console.log('\nTest 4: Testing provider filtering');
    const req4 = mock.req({ provider: 'google' });
    const res4 = mock.res();
    
    await handler(req4, res4);
    
    if (res4.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res4.mock.calls.json.length} times`);
    }
    
    const providerResponse = res4.mock.calls.json[0];
    
    // Should find 2 Google tools (web_search and language_translation)
    if (providerResponse.tools.length !== 2) {
      throw new Error(`Expected 2 tools, but got ${providerResponse.tools.length}`);
    }
    
    if (!providerResponse.tools.some(tool => tool.name === 'web_search')) {
      throw new Error('Expected to find web_search tool in results');
    }
    
    if (!providerResponse.tools.some(tool => tool.name === 'language_translation')) {
      throw new Error('Expected to find language_translation tool in results');
    }
    
    console.log('✅ Provider filtering test passed');
    
    // Test 5: Combined filtering (category + search)
    console.log('\nTest 5: Testing combined filtering (category + search)');
    const req5 = mock.req({ category: 'web', search: 'information' });
    const res5 = mock.res();
    
    await handler(req5, res5);
    
    if (res5.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res5.mock.calls.json.length} times`);
    }
    
    const combinedResponse = res5.mock.calls.json[0];
    
    if (combinedResponse.tools.length !== 1) {
      throw new Error(`Expected 1 tool, but got ${combinedResponse.tools.length}`);
    }
    
    if (combinedResponse.tools[0].name !== 'web_search') {
      throw new Error(`Expected tool name to be 'web_search', but got '${combinedResponse.tools[0].name}'`);
    }
    
    console.log('✅ Combined filtering test passed');
    
    // Test 6: Pagination limits
    console.log('\nTest 6: Testing pagination limits');
    
    // Use enabled: 'false' to get all tools, including disabled ones
    const req6 = mock.req({ limit: '2', enabled: 'false' });
    const res6 = mock.res();
    
    await handler(req6, res6);
    
    if (res6.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res6.mock.calls.json.length} times`);
    }
    
    const paginationResponse = res6.mock.calls.json[0];
    
    if (paginationResponse.tools.length !== 2) {
      throw new Error(`Expected 2 tools, but got ${paginationResponse.tools.length}`);
    }
    
    // Get the total number of tools from our mock data
    const totalTools = mockTools.getAllToolDefinitions().length;
    
    // Verify total count is correct
    if (paginationResponse.metadata.totalCount !== totalTools) {
      throw new Error(`Expected total count to be ${totalTools}, but got ${paginationResponse.metadata.totalCount}`);
    }
    
    console.log('✅ Pagination limits test passed');
    
    // Test 7: Pagination offset
    console.log('\nTest 7: Testing pagination offset');
    const req7 = mock.req({ limit: '2', offset: '2' });
    const res7 = mock.res();
    
    await handler(req7, res7);
    
    if (res7.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res7.mock.calls.json.length} times`);
    }
    
    const offsetResponse = res7.mock.calls.json[0];
    
    if (offsetResponse.tools.length !== 2) {
      throw new Error(`Expected 2 tools, but got ${offsetResponse.tools.length}`);
    }
    
    // Should be different tools than the first 2
    if (offsetResponse.tools[0].name === paginationResponse.tools[0].name) {
      throw new Error('Expected different tools with offset');
    }
    
    console.log('✅ Pagination offset test passed');
    
    // Test 8: Enabled filtering (should skip disabled tools)
    console.log('\nTest 8: Testing enabled filtering');
    const req8 = mock.req({ enabled: 'true' });
    const res8 = mock.res();
    
    await handler(req8, res8);
    
    if (res8.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res8.mock.calls.json.length} times`);
    }
    
    const enabledResponse = res8.mock.calls.json[0];
    
    // Should only find 4 tools (code_analysis is disabled)
    if (enabledResponse.tools.length !== 4) {
      throw new Error(`Expected 4 tools, but got ${enabledResponse.tools.length}`);
    }
    
    if (enabledResponse.tools.some(tool => tool.name === 'code_analysis')) {
      throw new Error('Expected NOT to find code_analysis tool in results when enabled=true');
    }
    
    console.log('✅ Enabled filtering test passed');
    
    // Test 9: Disabled tools filtering
    console.log('\nTest 9: Testing disabled tools filtering');
    const req9 = mock.req({ enabled: 'false' });
    const res9 = mock.res();
    
    await handler(req9, res9);
    
    if (res9.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res9.mock.calls.json.length} times`);
    }
    
    const disabledResponse = res9.mock.calls.json[0];
    
    // Should include all tools when enabled=false
    if (disabledResponse.tools.length !== 5) {
      throw new Error(`Expected 5 tools, but got ${disabledResponse.tools.length}`);
    }
    
    console.log('✅ Disabled tools filtering test passed');
    
    // Test 10: Edge case: no matching results
    console.log('\nTest 10: Testing edge case: no matching results');
    const req10 = mock.req({ search: 'nonexistentterm' });
    const res10 = mock.res();
    
    await handler(req10, res10);
    
    if (res10.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res10.mock.calls.json.length} times`);
    }
    
    const noResultsResponse = res10.mock.calls.json[0];
    
    if (noResultsResponse.tools.length !== 0) {
      throw new Error(`Expected 0 tools, but got ${noResultsResponse.tools.length}`);
    }
    
    // Response should still be successful even with no results
    if (!noResultsResponse.success) {
      throw new Error('Expected success to be true even with no results');
    }
    
    console.log('✅ No matching results test passed');
    
    // Test 11: Comprehensive combined filtering
    console.log('\nTest 11: Testing comprehensive combined filtering');
    const req11 = mock.req({ 
      category: 'development', 
      provider: 'anthropic',
      enabled: 'false', // Include disabled tools
      search: 'code'
    });
    const res11 = mock.res();
    
    await handler(req11, res11);
    
    if (res11.mock.calls.json.length !== 1) {
      throw new Error(`Expected json method to be called once, but was called ${res11.mock.calls.json.length} times`);
    }
    
    const complexResponse = res11.mock.calls.json[0];
    
    if (complexResponse.tools.length !== 1) {
      throw new Error(`Expected 1 tool, but got ${complexResponse.tools.length}`);
    }
    
    if (complexResponse.tools[0].name !== 'code_analysis') {
      throw new Error(`Expected tool name to be 'code_analysis', but got '${complexResponse.tools[0].name}'`);
    }
    
    console.log('✅ Comprehensive combined filtering test passed');
    
    console.log('\n✅ All advanced filtering tests passed!');
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
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = runTests;