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
 * Search the web using a search engine API or scrape search results
 * Note: This is a placeholder and needs a real search API integration
 * @param {string} query - The search query
 * @param {number} limit - The maximum number of results to return
 * @returns {Promise<Array>} - An array of search results
 */
async function searchWeb(query, limit = 5) {
  // NOTE: For a production environment, you would use a proper search API:
  // - Google Custom Search API
  // - Bing Search API
  // - DuckDuckGo API (when available)
  // - SerpAPI
  
  // This is a placeholder showing the expected format
  return {
    query,
    searchedAt: new Date().toISOString(),
    message: "This is a placeholder. Implement a real search API integration.",
    results: []
  };
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
  fetchMultipleUrls
};