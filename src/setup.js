const readline = require('readline');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load current environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Define required environment variables
const envVars = [
  {
    name: 'ANTHROPIC_API_KEY',
    description: 'Anthropic API Key (for Claude models)',
    required: false
  },
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API Key (for GPT models and DALL-E)',
    required: false
  },
  {
    name: 'STABILITY_API_KEY',
    description: 'Stability AI API Key (for Stable Diffusion)',
    required: false
  },
  {
    name: 'PORT',
    description: 'Port for the MCP server',
    default: '3000',
    required: false
  }
];

// Path to .env file
const envPath = path.join(__dirname, '..', '.env');

// Function to get current environment variables
function getCurrentEnv() {
  try {
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      const envValues = {};
      
      envFile.split('\n').forEach(line => {
        if (line && !line.startsWith('#') && line.includes('=')) {
          const [key, value] = line.split('=');
          if (key && value) {
            envValues[key.trim()] = value.trim();
          }
        }
      });
      
      return envValues;
    }
  } catch (error) {
    console.error('Error reading .env file:', error.message);
  }
  
  return {};
}

// Function to update environment variables
function updateEnvFile(envValues) {
  let envContent = '';
  
  // Add PORT first
  if (envValues.PORT) {
    envContent += `PORT=${envValues.PORT}\n\n`;
  }
  
  // Add API keys section
  envContent += '# API keys for AI models\n';
  
  // Add Anthropic API key
  if (envValues.ANTHROPIC_API_KEY) {
    envContent += `ANTHROPIC_API_KEY=${envValues.ANTHROPIC_API_KEY}\n`;
  } else {
    envContent += '# ANTHROPIC_API_KEY=your_anthropic_api_key_here\n';
  }
  
  // Add OpenAI API key
  if (envValues.OPENAI_API_KEY) {
    envContent += `OPENAI_API_KEY=${envValues.OPENAI_API_KEY}\n`;
  } else {
    envContent += '# OPENAI_API_KEY=your_openai_api_key_here\n';
  }
  
  // Add Stability API key section
  envContent += '\n# API key for Stability AI (image generation)\n';
  if (envValues.STABILITY_API_KEY) {
    envContent += `STABILITY_API_KEY=${envValues.STABILITY_API_KEY}\n`;
  } else {
    envContent += '# STABILITY_API_KEY=your_stability_api_key_here\n';
  }
  
  // Add server URL
  envContent += '\n# Optional: Server URL for clients\n';
  envContent += `MCP_SERVER_URL=http://localhost:${envValues.PORT || '3000'}\n`;
  
  // Write to file
  fs.writeFileSync(envPath, envContent);
  console.log('\n.env file updated successfully!\n');
}

// Function to prompt for environment variables
async function promptForEnvVars() {
  return new Promise((resolve) => {
    const currentEnv = getCurrentEnv();
    const updatedEnv = { ...currentEnv };
    let index = 0;
    
    console.log('\n=== MCP Server Setup ===\n');
    console.log('This script will help you configure your MCP server.');
    console.log('Press Enter to keep the current value (shown in parentheses).\n');
    
    function promptNext() {
      if (index >= envVars.length) {
        rl.close();
        updateEnvFile(updatedEnv);
        
        // Check if essential APIs are configured
        const hasAnthropic = updatedEnv.ANTHROPIC_API_KEY && updatedEnv.ANTHROPIC_API_KEY.length > 10;
        const hasOpenAI = updatedEnv.OPENAI_API_KEY && updatedEnv.OPENAI_API_KEY.length > 10;
        const hasStability = updatedEnv.STABILITY_API_KEY && updatedEnv.STABILITY_API_KEY.length > 10;
        
        console.log('\n=== Configuration Summary ===');
        console.log(`Anthropic API: ${hasAnthropic ? 'Configured ✅' : 'Not configured ❌'}`);
        console.log(`OpenAI API: ${hasOpenAI ? 'Configured ✅' : 'Not configured ❌'}`);
        console.log(`Stability API: ${hasStability ? 'Configured ✅' : 'Not configured ❌'}`);
        
        if (!hasAnthropic && !hasOpenAI) {
          console.log('\n⚠️  Warning: No AI model APIs are configured. MCP server will have limited functionality.');
        }
        
        resolve(updatedEnv);
        return;
      }
      
      const envVar = envVars[index];
      const currentValue = currentEnv[envVar.name] || envVar.default || '';
      const displayValue = currentValue ? ` (${currentValue})` : '';
      
      rl.question(`${envVar.description}${displayValue}: `, (answer) => {
        // If user provided a value, use it, otherwise keep current value or default
        if (answer.trim()) {
          updatedEnv[envVar.name] = answer.trim();
        } else if (currentValue) {
          updatedEnv[envVar.name] = currentValue;
        } else if (envVar.required) {
          console.log(`⚠️  ${envVar.name} is required. Please provide a value.`);
          return promptNext(); // Ask again for the same variable
        }
        
        index++;
        promptNext();
      });
    }
    
    promptNext();
  });
}

// Main function to check environment and start setup if needed
async function checkEnvironment() {
  const currentEnv = getCurrentEnv();
  let allConfigured = true;
  let missingVars = [];
  
  // Check for required variables
  envVars.forEach(envVar => {
    if (envVar.required && !currentEnv[envVar.name] && !process.env[envVar.name]) {
      allConfigured = false;
      missingVars.push(envVar.name);
    }
  });
  
  // Check if any API keys are present
  const hasAnyApiKey = Boolean(
    currentEnv.ANTHROPIC_API_KEY || 
    process.env.ANTHROPIC_API_KEY ||
    currentEnv.OPENAI_API_KEY || 
    process.env.OPENAI_API_KEY ||
    currentEnv.STABILITY_API_KEY || 
    process.env.STABILITY_API_KEY
  );
  
  if (!hasAnyApiKey) {
    console.log('⚠️  No API keys are configured. Some MCP server features may not work.');
    missingVars.push('API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, or STABILITY_API_KEY)');
    allConfigured = false;
  }
  
  if (!allConfigured) {
    console.log('\n⚠️  Missing environment variables: ' + missingVars.join(', '));
    console.log('Would you like to set up these variables now? (y/n)');
    
    rl.question('> ', async (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        await promptForEnvVars();
        console.log('\nSetup complete! You can now start the MCP server with:');
        console.log('npm start');
      } else {
        console.log('\nSkipping setup. Note that some features may not work correctly.');
        console.log('You can run this setup later with:');
        console.log('node src/setup.js');
        rl.close();
      }
    });
  } else {
    console.log('✅ Environment is properly configured.');
    rl.close();
    return true;
  }
}

// If script is run directly, run the setup
if (require.main === module) {
  promptForEnvVars().then(() => {
    console.log('Setup completed successfully!');
  });
} else {
  // If imported as a module, export the functions
  module.exports = {
    checkEnvironment,
    promptForEnvVars
  };
}