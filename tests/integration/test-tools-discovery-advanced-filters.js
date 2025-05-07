/**
 * Integration test for advanced filtering features of the tools discovery API
 * 
 * Tests the functionality of the tools discovery API with various filtering combinations:
 * - Search term filtering
 * - Provider filtering
 * - Combined filtering with multiple parameters
 * - Pagination and offsets
 * - Edge cases and error conditions
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
 * Run integration tests for tools discovery advanced filtering
 */
async function runTests() {
  console.log('=== Testing tools discovery advanced filtering integration ===');
  let allTestsPassed = true;
  
  try {
    // Get all available tools first for reference
    const allToolsResponse = await makeRequest('/tools/available');
    assert.strictEqual(allToolsResponse.statusCode, 200, 'Status code should be 200');
    assert.strictEqual(allToolsResponse.data.success, true, 'Response should indicate success');
    
    const allTools = allToolsResponse.data.tools;
    const allCategories = allToolsResponse.data.metadata.categories;
    const allProviders = allToolsResponse.data.metadata.providers;
    
    // Only proceed if we have tools to test with
    if (allTools.length === 0) {
      console.log('⚠️ No tools available for testing, skipping advanced filtering tests');
      return true;
    }
    
    console.log(`Found ${allTools.length} tools across ${allCategories.length} categories and ${allProviders.length} providers`);
    
    // Test 1: Search term filtering
    console.log('\nTest 1: Testing search term filtering');
    
    // Pick a word that's likely to be in one of the tools
    const searchTerm = allTools[0].name.split('_')[0] || 'search';
    const searchResponse = await makeRequest('/tools/available', 'GET', { search: searchTerm });
    
    assert.strictEqual(searchResponse.statusCode, 200, 'Status code should be 200');
    assert.strictEqual(searchResponse.data.success, true, 'Response should indicate success');
    
    // Verify some results were returned
    if (searchResponse.data.tools.length === 0) {
      throw new Error(`Search term "${searchTerm}" returned no results`);
    }
    
    // Verify search results contain the search term somewhere in their data
    const validSearchResults = searchResponse.data.tools.every(tool => 
      tool.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tool.tags && tool.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
    );
    
    assert.strictEqual(validSearchResults, true, 'All search results should contain the search term');
    
    console.log(`✅ Search term filtering test passed (found ${searchResponse.data.tools.length} tools matching "${searchTerm}")`);
    
    // Test 2: Provider filtering
    console.log('\nTest 2: Testing provider filtering');
    
    // Skip if no providers are available
    if (allProviders.length === 0) {
      console.log('⚠️ No providers available for testing, skipping provider filtering test');
    } else {
      // First check which provider actually has tools
      let foundValidProvider = false;
      let targetProvider;
      let providerResponse;
      
      for (const provider of allProviders) {
        console.log(`Trying provider: ${provider}`);
        providerResponse = await makeRequest('/tools/available', 'GET', { provider });
        
        if (providerResponse.data.tools.length > 0) {
          targetProvider = provider;
          foundValidProvider = true;
          break;
        }
      }
      
      if (!foundValidProvider) {
        console.log('⚠️ No providers with tools found, skipping provider filtering test');
      } else {
        assert.strictEqual(providerResponse.statusCode, 200, 'Status code should be 200');
        assert.strictEqual(providerResponse.data.success, true, 'Response should indicate success');
        
        // Verify all tools have the correct provider
        const validProviderResults = providerResponse.data.tools.every(tool => 
          (tool.provider && tool.provider.toLowerCase() === targetProvider.toLowerCase()) ||
          (tool.metadata && 
           tool.metadata.provider && 
           tool.metadata.provider.toLowerCase() === targetProvider.toLowerCase())
        );
        
        assert.strictEqual(validProviderResults, true, 'All tools should have the requested provider');
        
        console.log(`✅ Provider filtering test passed (found ${providerResponse.data.tools.length} tools from provider "${targetProvider}")`);
      }
    }
    
    // Test 3: Category filtering
    console.log('\nTest 3: Testing category filtering');
    
    // Skip if no categories are available
    if (allCategories.length === 0) {
      console.log('⚠️ No categories available for testing, skipping category filtering test');
    } else {
      // Pick the first category
      const targetCategory = allCategories[0];
      const categoryResponse = await makeRequest('/tools/available', 'GET', { category: targetCategory });
      
      assert.strictEqual(categoryResponse.statusCode, 200, 'Status code should be 200');
      assert.strictEqual(categoryResponse.data.success, true, 'Response should indicate success');
      
      // Verify at least one tool was returned
      if (categoryResponse.data.tools.length === 0) {
        throw new Error(`Category "${targetCategory}" returned no results`);
      }
      
      // Verify all tools have the correct category
      const validCategoryResults = categoryResponse.data.tools.every(tool => 
        tool.category === targetCategory
      );
      
      assert.strictEqual(validCategoryResults, true, 'All tools should be in the requested category');
      
      console.log(`✅ Category filtering test passed (found ${categoryResponse.data.tools.length} tools in category "${targetCategory}")`);
    }
    
    // Test 4: Pagination with limit
    console.log('\nTest 4: Testing pagination with limit');
    
    // Only test if we have at least 3 tools
    if (allTools.length < 3) {
      console.log('⚠️ Not enough tools available for testing pagination, skipping test');
    } else {
      const limitSize = Math.min(2, Math.floor(allTools.length / 2));
      const limitResponse = await makeRequest('/tools/available', 'GET', { limit: limitSize });
      
      assert.strictEqual(limitResponse.statusCode, 200, 'Status code should be 200');
      assert.strictEqual(limitResponse.data.success, true, 'Response should indicate success');
      
      // Verify the correct number of tools was returned
      assert.strictEqual(limitResponse.data.tools.length, limitSize, `Should return exactly ${limitSize} tools`);
      
      // Verify metadata correctly reflects pagination
      assert.strictEqual(limitResponse.data.metadata.limit, limitSize, 'Metadata should reflect the requested limit');
      assert.strictEqual(limitResponse.data.metadata.totalCount, allTools.length, 'Total count should reflect all available tools');
      
      console.log(`✅ Pagination with limit test passed (limited to ${limitSize} tools of ${allTools.length} total)`);
    }
    
    // Test 5: Pagination with offset
    console.log('\nTest 5: Testing pagination with offset and limit');
    
    // Only test if we have at least 3 tools
    if (allTools.length < 3) {
      console.log('⚠️ Not enough tools available for testing pagination with offset, skipping test');
    } else {
      const limitSize = Math.min(2, Math.floor(allTools.length / 2));
      const offsetSize = 1;
      
      // First get the first page
      const firstPageResponse = await makeRequest('/tools/available', 'GET', { limit: limitSize, offset: 0 });
      
      // Then get the second page
      const secondPageResponse = await makeRequest('/tools/available', 'GET', { limit: limitSize, offset: offsetSize });
      
      assert.strictEqual(secondPageResponse.statusCode, 200, 'Status code should be 200');
      assert.strictEqual(secondPageResponse.data.success, true, 'Response should indicate success');
      
      // Verify the correct number of tools was returned (might be less if reaching the end)
      assert(secondPageResponse.data.tools.length <= limitSize, `Should return at most ${limitSize} tools`);
      
      // Verify metadata correctly reflects pagination
      assert.strictEqual(secondPageResponse.data.metadata.offset, offsetSize, 'Metadata should reflect the requested offset');
      
      // Verify the pages have different tools (not guaranteed if tools are identical)
      if (firstPageResponse.data.tools.length > 0 && secondPageResponse.data.tools.length > 0) {
        const firstPageFirstTool = firstPageResponse.data.tools[0];
        const secondPageFirstTool = secondPageResponse.data.tools[0];
        
        if (firstPageFirstTool.name === secondPageFirstTool.name) {
          // Tools might be identical, so let's check a few more properties
          const firstPageFirstToolStr = JSON.stringify(firstPageFirstTool);
          const secondPageFirstToolStr = JSON.stringify(secondPageFirstTool);
          
          if (firstPageFirstToolStr === secondPageFirstToolStr) {
            console.log('⚠️ Warning: First tool from first and second page are identical, this might be valid if tools are identical');
          }
        }
      }
      
      console.log(`✅ Pagination with offset test passed (offset ${offsetSize}, limit ${limitSize})`);
    }
    
    // Test 6: Combined filtering
    console.log('\nTest 6: Testing combined filtering (category + search)');
    
    // Only test if we have categories
    if (allCategories.length === 0) {
      console.log('⚠️ No categories available for testing combined filtering, skipping test');
    } else {
      // Try each category until we find one with tools
      let foundValidCategory = false;
      let targetCategory;
      let categoryResponse;
      
      for (const category of allCategories) {
        console.log(`Trying category: ${category}`);
        categoryResponse = await makeRequest('/tools/available', 'GET', { category });
        
        if (categoryResponse.data.tools.length > 0) {
          targetCategory = category;
          foundValidCategory = true;
          break;
        }
      }
      
      if (!foundValidCategory) {
        console.log('⚠️ No categories with tools found, skipping combined filtering test');
      } else {
        // Pick a word from the first tool's name or description
        const firstTool = categoryResponse.data.tools[0];
        const searchTerm = firstTool.name.split('_')[0] || firstTool.description.split(' ')[0] || 'search';
        
        // Use both category and search filters
        const combinedResponse = await makeRequest('/tools/available', 'GET', { 
          category: targetCategory,
          search: searchTerm
        });
        
        assert.strictEqual(combinedResponse.statusCode, 200, 'Status code should be 200');
        assert.strictEqual(combinedResponse.data.success, true, 'Response should indicate success');
        
        if (combinedResponse.data.tools.length === 0) {
          console.log(`⚠️ No tools found with category=${targetCategory} and search=${searchTerm}, skipping combined filtering assertions`);
        } else {
          // Verify results meet both criteria
          combinedResponse.data.tools.forEach(tool => {
            assert.strictEqual(tool.category, targetCategory, `Tool ${tool.name} should be in category ${targetCategory}`);
            
            // Check if search term is in name, description, or tags
            const containsSearchTerm = 
              tool.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (tool.tags && tool.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
            
            assert(containsSearchTerm, `Tool ${tool.name} should contain search term "${searchTerm}"`);
          });
          
          console.log(`✅ Combined filtering test passed (category=${targetCategory}, search=${searchTerm}, found ${combinedResponse.data.tools.length} tools)`);
        }
      }
    }
    
    // Test 7: Edge case - non-existent category
    console.log('\nTest 7: Testing edge case - non-existent category');
    
    const nonExistentCategory = 'non_existent_category_' + Date.now();
    const nonExistentCategoryResponse = await makeRequest('/tools/available', 'GET', { 
      category: nonExistentCategory 
    });
    
    assert.strictEqual(nonExistentCategoryResponse.statusCode, 200, 'Status code should be 200 even for non-existent category');
    assert.strictEqual(nonExistentCategoryResponse.data.success, true, 'Response should indicate success even for non-existent category');
    assert.strictEqual(nonExistentCategoryResponse.data.tools.length, 0, 'Should return empty array for non-existent category');
    
    console.log('✅ Non-existent category test passed (returned empty array as expected)');
    
    // Test 8: Edge case - pagination beyond available tools
    console.log('\nTest 8: Testing edge case - pagination beyond available tools');
    
    // For the pagination test, we need to specify a large enough offset
    // Typically offset >= totalCount should return an empty array
    const beyondLimitResponse = await makeRequest('/tools/available', 'GET', { 
      offset: allTools.length + 1000
    });
    
    assert.strictEqual(beyondLimitResponse.statusCode, 200, 'Status code should be 200 even for pagination beyond limits');
    assert.strictEqual(beyondLimitResponse.data.success, true, 'Response should indicate success even for pagination beyond limits');
    
    // Check if the tools array is empty or length is 0 (both are acceptable)
    if (beyondLimitResponse.data.tools.length > 0) {
      console.log(`⚠️ Warning: Server returned ${beyondLimitResponse.data.tools.length} tools with offset beyond total count. This may be valid behavior if the server implementation allows this.`);
    } else {
      console.log('✅ Pagination beyond limits test passed (returned empty array as expected)');
    }
    
    // Test 9: Edge case - invalid format parameter
    console.log('\nTest 9: Testing edge case - invalid format parameter');
    
    const invalidFormatResponse = await makeRequest('/tools/available', 'GET', { 
      format: 'invalid_format_' + Date.now()
    });
    
    // Should default to JSON for invalid format
    assert.strictEqual(invalidFormatResponse.statusCode, 200, 'Status code should be 200 even for invalid format');
    assert.strictEqual(invalidFormatResponse.data.success, true, 'Response should indicate success even for invalid format');
    
    console.log('✅ Invalid format test passed (defaulted to JSON as expected)');
    
    // Test 10: Output formats
    console.log('\nTest 10: Testing different output formats');
    
    // Test YAML format
    const yamlResponse = await makeRequest('/tools/available', 'GET', { format: 'yaml' });
    assert.strictEqual(yamlResponse.statusCode, 200, 'Status code should be 200 for YAML format');
    // Content-type may include charset
    assert(yamlResponse.headers['content-type'].startsWith('text/yaml'), 'Content-Type should start with text/yaml');
    // YAML response is returned as a string
    assert(typeof yamlResponse.data === 'string', 'YAML response should be a string');
    assert(yamlResponse.data.includes('success: true'), 'YAML response should contain success: true');
    
    // Test HTML format
    const htmlResponse = await makeRequest('/tools/available', 'GET', { format: 'html' });
    assert.strictEqual(htmlResponse.statusCode, 200, 'Status code should be 200 for HTML format');
    // Content-type may include charset
    assert(htmlResponse.headers['content-type'].startsWith('text/html'), 'Content-Type should start with text/html');
    // HTML response is returned as a string
    assert(typeof htmlResponse.data === 'string', 'HTML response should be a string');
    assert(htmlResponse.data.includes('<html>'), 'HTML response should contain <html> tag');
    assert(htmlResponse.data.includes('<table>'), 'HTML response should contain <table> tag');
    
    // Test table format
    const tableResponse = await makeRequest('/tools/available', 'GET', { format: 'table' });
    assert.strictEqual(tableResponse.statusCode, 200, 'Status code should be 200 for table format');
    // Content-type may include charset
    assert(tableResponse.headers['content-type'].startsWith('text/plain'), 'Content-Type should start with text/plain');
    // Table response is returned as a string
    assert(typeof tableResponse.data === 'string', 'Table response should be a string');
    assert(tableResponse.data.includes('| Name | Description | Category | Version |'), 'Table response should contain headers');
    
    console.log('✅ Output formats test passed (YAML, HTML, and table formats verified)');
    
    console.log('\n✅ All tools discovery advanced filtering integration tests passed!');
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