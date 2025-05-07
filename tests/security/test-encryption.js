/**
 * Test script for encryption in Configuration model
 */
require('dotenv').config();
const crypto = require('crypto');

// Create a simulated environment similar to our implementation
// This allows us to test the functionality without needing MongoDB
const encryptionKeyCache = null;
const instanceId = process.env.INSTANCE_ID || crypto.createHash('sha256').update(`${Date.now()}`).digest('hex').substring(0, 8);

// Simulate our fallback key generation
function generateFallbackKey() {
  const machineFallback = crypto.createHash('sha256').update(`mcp-server-${instanceId}`).digest('hex');
  return machineFallback;
}

// Test encryption and decryption
function testEncryption() {
  console.log('=== Testing Encryption Implementation ===');
  
  // Generate a test key
  const testKey = generateFallbackKey();
  console.log(`Generated key (${testKey.length} chars): ${testKey.substring(0, 10)}...`);
  
  // Test value to encrypt
  const testValue = 'my-secret-api-key-12345';
  console.log(`Original value: ${testValue}`);
  
  // Encrypt the value using our implementation
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', 
    crypto.createHash('sha256').update(testKey).digest(), iv);
  
  let encrypted = cipher.update(testValue, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const encryptedWithIV = `${iv.toString('hex')}:${encrypted}`;
  console.log(`Encrypted value: ${encryptedWithIV}`);
  
  // Now decrypt it
  const parts = encryptedWithIV.split(':');
  const decryptIv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', 
    crypto.createHash('sha256').update(testKey).digest(), decryptIv);
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  console.log(`Decrypted value: ${decrypted}`);
  console.log(`Decryption successful: ${decrypted === testValue ? 'Yes ✅' : 'No ❌'}`);
  
  return decrypted === testValue;
}

// Run the test
try {
  const success = testEncryption();
  console.log(`\nTest ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('Test error:', error);
  process.exit(1);
}