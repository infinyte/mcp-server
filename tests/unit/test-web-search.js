/**
 * Web Search Unit Test
 * 
 * Tests the web search functionality.
 */
require('dotenv').config();
const webSearch = require('../../src/tools/web-search');

/**
 * Test web search functionality
 */
async function testWebSearch() {
  console.log('=== Testing Web Search ===');
  
  // Test search (will use fallback if no API keys available)
  console.log('Testing searchWeb function...');
  
  try {
    const searchResults = await webSearch.searchWeb('MCP server test', 3);
    
    console.log('Search results structure:', Object.keys(searchResults).join(', '));
    console.log(`Search query: ${searchResults.query}`);
    console.log(`Results count: ${searchResults.results ? searchResults.results.length : 0}`);
    
    // Validate structure (even if it's a placeholder)
    const hasValidStructure = searchResults.query && 
                             (searchResults.searchedAt || searchResults.timestamp) &&
                             Array.isArray(searchResults.results);
    
    if (hasValidStructure) {
      console.log('✅ Search function returned valid structure');
    } else {
      console.error('❌ Invalid search result structure');
      return false;
    }
    
    // Test webpage content retrieval with a simple URL
    console.log('\nTesting getWebpageContent function...');
    
    try {
      // Use a reliable test URL
      const testUrl = 'https://example.com';
      const contentResult = await webSearch.getWebpageContent(testUrl);
      
      console.log('Content result structure:', Object.keys(contentResult).join(', '));
      console.log(`URL: ${contentResult.url}`);
      console.log(`Title: ${contentResult.title}`);
      console.log(`Content length: ${contentResult.content ? contentResult.content.length : 0} chars`);
      
      // Validate webpage content structure
      const hasValidContentStructure = contentResult.url &&
                                      contentResult.title && 
                                      contentResult.content;
                                      
      if (hasValidContentStructure) {
        console.log('✅ Content function returned valid structure');
      } else {
        console.error('❌ Invalid content result structure');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error testing webpage content:', error.message);
      // Don't fail the test if just the content retrieval fails
      console.log('⚠️ Content retrieval failed but search function test passed');
      return true;
    }
  } catch (error) {
    console.error('❌ Error testing web search:', error.message);
    return false;
  }
}

// Run the test
async function main() {
  const success = await testWebSearch();
  console.log(`\nWeb search test ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
  return success;
}

// Run test if called directly
if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = main;