const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Simple cache implementation
const cacheDir = path.join(__dirname, '../../cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Creates a hash for the URL to use as a cache key
 * @param {string} url - The URL to hash
 * @returns {string} - The hashed URL
 */
function createCacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

/**
 * Check if a URL is cached and not expired
 * @param {string} url - The URL to check
 * @param {number} maxAge - The maximum age of the cache in milliseconds
 * @returns {string|null} - The cached content or null if not cached or expired
 */
function getFromCache(url, maxAge = 3600000) { // Default: 1 hour
  const cacheKey = createCacheKey(url);
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  
  if (fs.existsSync(cachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cacheTime = new Date(cacheData.timestamp);
      const now = new Date();
      
      if (now - cacheTime < maxAge) {
        return cacheData.content;
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
    }
  }
  
  return null;
}

/**
 * Save content to cache
 * @param {string} url - The URL to cache
 * @param {string} content - The content to cache
 */
function saveToCache(url, content) {
  const cacheKey = createCacheKey(url);
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  
  try {
    const cacheData = {
      url,
      content,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

/**
 * Fetch the content of a webpage
 * @param {string} url - The URL to fetch
 * @param {boolean} useCache - Whether to use cache
 * @param {number} maxAge - The maximum age of the cache in milliseconds
 * @returns {Promise<string>} - The HTML content of the webpage
 */
async function fetchWebpage(url, useCache = true, maxAge = 3600000) {
  // If using cache, check if the URL is cached
  if (useCache) {
    const cachedContent = getFromCache(url, maxAge);
    if (cachedContent) {
      return cachedContent;
    }
  }
  
  try {
    // Set headers to mimic a browser
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://www.google.com/'
    };
    
    const response = await axios.get(url, { headers });
    const html = response.data;
    
    // Cache the result if using cache
    if (useCache) {
      saveToCache(url, html);
    }
    
    return html;
  } catch (error) {
    console.error(`Error fetching webpage ${url}:`, error.message);
    throw new Error(`Failed to fetch webpage: ${error.message}`);
  }
}

/**
 * Extract text content from HTML
 * @param {string} html - The HTML content
 * @returns {string} - The extracted text
 */
function extractTextContent(html) {
  const $ = cheerio.load(html);
  
  // Remove script and style elements
  $('script, style, noscript, iframe, img').remove();
  
  // Extract title
  const title = $('title').text().trim();
  
  // Extract meta description
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  
  // Extract main content - focus on main content areas
  const mainContent = [];
  
  // Try to find main content areas
  const contentSelectors = [
    'main', 'article', '.content', '.main', '#content', '#main',
    '[role="main"]', '.post', '.entry', '.blog-post'
  ];
  
  // Get text from specified selectors or fallback to body
  let contentFound = false;
  contentSelectors.forEach(selector => {
    if ($(selector).length && !contentFound) {
      contentFound = true;
      mainContent.push($(selector).text().trim());
    }
  });
  
  // If no content found with specific selectors, use body
  if (!contentFound) {
    mainContent.push($('body').text().trim());
  }
  
  // Clean the text
  const cleanedContent = mainContent.join('\n')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  
  return {
    title,
    description: metaDescription,
    content: cleanedContent
  };
}

/**
 * Get a summarized version of a URL's content
 * @param {string} url - The URL to fetch and summarize
 * @param {boolean} useCache - Whether to use the cache
 * @returns {Promise<Object>} - The summarized content
 */
async function getWebpageContent(url, useCache = true) {
  try {
    const html = await fetchWebpage(url, useCache);
    const content = extractTextContent(html);
    
    return {
      url,
      title: content.title,
      description: content.description,
      content: content.content,
      extractedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error getting webpage content for ${url}:`, error.message);
    throw error;
  }
}

/**
 * Search the web using Google Custom Search API
 * @param {string} query - The search query
 * @param {number} limit - The maximum number of results to return
 * @returns {Promise<Object>} - Search results
 */
async function searchWeb(query, limit = 5) {
  console.log(`Searching web for: ${query} (limit: ${limit})`);
  
  // Create cache key for this search
  const cacheKey = `search:${query}:${limit}`;
  
  // Try to get results from cache first
  const cachedResults = getFromCache(cacheKey, 3600000); // 1 hour cache
  
  if (cachedResults) {
    console.log('Returning cached search results');
    return cachedResults;
  }
  
  // Check for Google API key
  if (!process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_ID) {
    console.warn('GOOGLE_CSE_API_KEY or GOOGLE_CSE_ID not set. Using fallback search.');
    
    // Try Bing search if available
    if (process.env.BING_SEARCH_API_KEY) {
      return await searchBing(query, limit);
    }
    
    return {
      query,
      searchedAt: new Date().toISOString(),
      message: "Search API credentials not configured. Please set GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID in your environment variables.",
      results: []
    };
  }
  
  try {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${limit}`;
    
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Google API error: ${response.status}`);
    }
    
    const data = response.data;
    
    // Process and format results
    const results = data.items ? data.items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
      source: 'google'
    })) : [];
    
    const searchResults = {
      query,
      searchedAt: new Date().toISOString(),
      totalResults: data.searchInformation?.totalResults || 0,
      searchTime: data.searchInformation?.searchTime || 0,
      results: results.slice(0, limit)
    };
    
    // Cache results
    saveToCache(cacheKey, searchResults);
    
    return searchResults;
  } catch (error) {
    console.error('Google Search API error:', error.message);
    
    // Try Bing as fallback if available
    if (process.env.BING_SEARCH_API_KEY) {
      console.log('Trying Bing Search API as fallback...');
      return await searchBing(query, limit);
    }
    
    // Return a graceful error response
    return {
      query,
      searchedAt: new Date().toISOString(),
      error: error.message,
      results: []
    };
  }
}

/**
 * Search the web using Bing Search API (fallback)
 * @param {string} query - The search query
 * @param {number} limit - The maximum number of results to return
 * @returns {Promise<Object>} - Search results
 */
async function searchBing(query, limit = 5) {
  if (!process.env.BING_SEARCH_API_KEY) {
    return {
      query,
      searchedAt: new Date().toISOString(),
      message: "Bing Search API key not configured. Please set BING_SEARCH_API_KEY in your environment variables.",
      results: []
    };
  }
  
  try {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`;
    
    const response = await axios.get(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`Bing API error: ${response.status}`);
    }
    
    const data = response.data;
    
    // Process and format results
    const results = data.webPages?.value ? data.webPages.value.map(item => ({
      title: item.name,
      link: item.url,
      snippet: item.snippet,
      displayLink: item.displayUrl,
      source: 'bing'
    })) : [];
    
    return {
      query,
      searchedAt: new Date().toISOString(),
      totalResults: data.webPages?.totalEstimatedMatches || 0,
      results: results.slice(0, limit)
    };
  } catch (error) {
    console.error('Bing Search API error:', error.message);
    
    // Return a graceful error response
    return {
      query,
      searchedAt: new Date().toISOString(),
      error: error.message,
      results: []
    };
  }
}

/**
 * Fetch and extract content from multiple URLs in parallel
 * @param {Array<string>} urls - An array of URLs to fetch
 * @param {boolean} useCache - Whether to use the cache
 * @returns {Promise<Array>} - An array of extracted content
 */
async function fetchMultipleUrls(urls, useCache = true) {
  try {
    const promises = urls.map(url => getWebpageContent(url, useCache));
    return await Promise.all(promises);
  } catch (error) {
    console.error('Error fetching multiple URLs:', error.message);
    throw error;
  }
}

module.exports = {
  getWebpageContent,
  searchWeb,
  searchBing,
  fetchMultipleUrls
};