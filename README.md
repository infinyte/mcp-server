# Model Context Protocol (MCP) Server

A simple server implementation for the Model Context Protocol that provides a unified API for multiple AI model providers.

## Features

- Unified API for multiple AI providers (Anthropic, OpenAI)
- Support for chat completions and legacy completions
- Tool calling support
- Context/system message handling
- Environment-based configuration
- MongoDB database for persistence and state management
- Tool execution history and analytics

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd testmcp

# Install dependencies
npm install

# Run the interactive setup
npm run setup
```

The setup script will guide you through configuring the necessary API keys:

- `ANTHROPIC_API_KEY` - For Claude models
- `OPENAI_API_KEY` - For GPT models and DALL-E image generation
- `STABILITY_API_KEY` - For Stable Diffusion image generation
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID` - For web search functionality
- `BING_SEARCH_API_KEY` - For fallback web search

You can also manually edit the `.env` file if you prefer.

## MongoDB Setup

The MCP server uses MongoDB for data persistence. You have several options for setting up MongoDB:

### Option 1: Automated Setup (Recommended)

Run the MongoDB setup script, which will guide you through the process:

```bash
# Run the MongoDB setup script
npm run setup-mongodb
```

This script will:
1. Check if Docker is available
2. Start MongoDB using Docker Compose (if available)
3. Configure the connection in your .env file
4. Verify the MongoDB connection

### Option 2: Manual Docker Setup

The easiest way to get started with MongoDB is to use the included Docker Compose configuration:

```bash
# Start MongoDB and Mongo Express in Docker
docker compose up -d

# Update your .env file with the connection string
echo "MONGODB_URI=mongodb://mcpuser:mcppassword@localhost:27017/mcp-server" >> .env
```

MongoDB will be available at `mongodb://mcpuser:mcppassword@localhost:27017/mcp-server`  
Mongo Express (web admin) will be available at [http://localhost:8081](http://localhost:8081)

### Option 3: Local MongoDB Installation

If you prefer to install MongoDB locally:

1. Install MongoDB from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
2. Start the MongoDB service
3. Update your `.env` file with:
   ```
   MONGODB_URI=mongodb://localhost:27017/mcp-server
   ```

### Option 4: MongoDB Atlas (Cloud)

For production use, MongoDB Atlas is recommended:

1. Create an account at [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Set up a database user and whitelist your IP address
4. Get your connection string and update your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/mcp-server?retryWrites=true&w=majority
   ```

## Database Migration

To migrate existing data to MongoDB:

```bash
# Run the migration script
npm run migrate-mongodb
```

This script will:
1. Migrate tool definitions to MongoDB
2. Migrate configurations (like API keys) to MongoDB
3. Import any backup data if available

## Usage

### Start the server

```bash
# Interactive startup (checks for API keys)
npm start

# Development mode with auto-reload
npm run dev

# Quick start (skips environment checks)
npm run quick-start

# Start server with PM2 process manager
npm run pm2:start

# Start server with PM2 in production mode
npm run pm2:start:prod
```

The server will be running at http://localhost:3000 (or the port you specified in .env).

#### Startup Options

1. **Standard Start** (`npm start`):
   - Checks if API keys are configured
   - Prompts for setup if no keys are found
   - Recommended for first-time users

2. **Development Mode** (`npm run dev`):
   - Uses nodemon for auto-reload on code changes
   - Still performs environment checks
   - Best for development

3. **Quick Start** (`npm run quick-start`):
   - Bypasses all environment checks
   - Starts the server immediately
   - Useful when you know your configuration is correct

4. **PM2 Production Mode** (`npm run pm2:start:prod`):
   - Runs the server using the PM2 process manager
   - Automatically restarts if the server crashes
   - Optimized for production environments
   - Bypasses environment checks

### Using PM2 Process Manager

The server can be run with PM2, a production process manager for Node.js applications. PM2 provides features like:

- Process management (restart on crash)
- Log management
- Performance monitoring
- Load balancing (for multiple instances)

#### PM2 Commands

```bash
# Start the server with PM2
npm run pm2:start

# Start in production mode
npm run pm2:start:prod

# View logs
npm run pm2:logs

# Monitor performance
npm run pm2:monit

# Restart the server
npm run pm2:restart

# Stop the server
npm run pm2:stop

# Remove the server from PM2
npm run pm2:delete
```

The PM2 configuration is stored in `ecosystem.config.js`. You can modify this file to change:
- Process name
- Environment variables
- Memory limits
- Deployment configuration
- Number of instances (for load balancing)

### API Endpoints

#### `POST /mcp/:provider`

Make requests to AI models through a unified API.

**URL Parameters:**
- `provider`: The AI provider to use (`anthropic` or `openai`)

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Your prompt here" }
  ],
  "model": "claude-3-opus-20240229",  // Optional, provider-specific model name
  "tools": [...],  // Optional, tools for function calling
  "context": "System message or context"  // Optional
}
```

OR (Legacy format):

```json
{
  "prompt": "Your prompt here",
  "model": "claude-3-opus-20240229",  // Optional
  "context": "System message or context"  // Optional
}
```

**Response:**
Returns the raw response from the provider's API.

#### `GET /tools/available`

Get a comprehensive list of all available tools with detailed information.

**Query Parameters:**
- `format` - Response format: `json` (default), `yaml`, `table`, or `html`
- `category` - Filter tools by category (optional)
- `enabled` - Filter by enabled status: `true` (default) or `false`
- `search` - Search for tools by name, description, or tags
- `provider` - Filter tools by provider (e.g., `openai`, `google`)
- `limit` - Maximum number of tools to return (for pagination)
- `offset` - Offset for pagination (default: 0)

**Response (JSON format):**
```json
{
  "success": true,
  "count": 10,
  "metadata": {
    "categories": ["web", "image", "utility"],
    "providers": ["openai", "anthropic", "internal"],
    "totalCount": 24,
    "offset": 0,
    "limit": 10
  },
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information",
      "category": "web",
      "version": "1.0.0",
      "provider": "google",
      "enabled": true,
      "parameters": {
        "query": {
          "type": "string",
          "description": "The search query",
          "required": true
        },
        "limit": {
          "type": "number",
          "description": "Maximum number of results",
          "required": false,
          "default": 5
        }
      },
      "usage": {
        "endpoint": "/tools/web/search",
        "method": "POST",
        "parameters": { /* same as above */ }
      },
      "metadata": {
        "createdAt": "2023-10-15T12:00:00Z",
        "updatedAt": "2024-04-20T09:30:00Z",
        "usageCount": 1245
      }
    }
    // ... more tools
  ]
}
```

#### `GET /health`

Health check endpoint that returns status 200 if the server is running.

### Data Management

#### Database Backups

You can create and manage database backups:

```bash
# Create a full backup
npm run backup-mongodb

# Create a backup with execution history
npm run backup-mongodb -- --with-executions

# List existing backups
npm run backup-mongodb -- --list
```

#### Testing the Database Connection

To verify your MongoDB setup:

```bash
# Run the database test script
npm run test-mongodb
```

### Example Clients

#### Command Line Client

A test client is included in `src/client.js`. To run it:

```bash
node src/client.js
```

#### Web Client

A simple web interface is available at http://localhost:3000 when the server is running. You can use this to test the API directly from your browser.

## Available Tools

The MCP server provides a tools discovery endpoint that allows users and AI agents to programmatically list all available tools:

#### Tools Discovery

`GET /tools/available` - Lists all available tools with detailed information.

- Supports multiple formats: JSON, YAML, HTML, and ASCII table
- Provides filtering by category, provider, and search terms
- Includes detailed metadata and usage examples for each tool

Example usage:
```bash
# Get all tools in JSON format
curl http://localhost:3000/tools/available

# Get tools in a specific category
curl http://localhost:3000/tools/available?category=web

# Search for image-related tools
curl http://localhost:3000/tools/available?search=image

# Get a formatted HTML page of all tools
curl http://localhost:3000/tools/available?format=html > tools.html
```

### Web Search Tools

The server includes built-in web search and retrieval tools:

1. **Web Search** (`/tools/web/search`)
   - Search the web for information on a given query
   - Parameters: `query` (required), `limit` (optional)
   - Requires: `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID` environment variables
   - Falls back to `BING_SEARCH_API_KEY` if Google search fails

2. **Web Content** (`/tools/web/content`)
   - Retrieve and extract content from a specific URL
   - Parameters: `url` (required), `useCache` (optional)

3. **Web Batch** (`/tools/web/batch`)
   - Retrieve content from multiple URLs in parallel
   - Parameters: `urls` (required array), `useCache` (optional)

### Image Generation Tools

The server also includes image generation, editing, and variation tools:

1. **Generate Image** (`/tools/image/generate`)
   - Generate an image based on a text prompt
   - Parameters:
     - `prompt` (required): Detailed description of the image
     - `provider` (optional): `openai` or `stability` (defaults to `openai`)
     - `options` (optional): Provider-specific options

2. **Edit Image** (`/tools/image/edit`)
   - Edit an existing image with a text prompt
   - Parameters:
     - `imagePath` (required): Path to the image to edit
     - `prompt` (required): Description of the edit to make
     - `maskPath` (optional): Path to a mask image

3. **Create Image Variation** (`/tools/image/variation`)
   - Create a variation of an existing image
   - Parameters:
     - `imagePath` (required): Path to the image to create variations of

> **Note:** To use these tools, you need to set API keys in your `.env` file:
> - For OpenAI images: `OPENAI_API_KEY`
> - For Stability AI images: `STABILITY_API_KEY`
> - For Web Search: `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID`

### Tool Integration with AI Models

The MCP server automatically handles tool calling and execution with AI models. When a model decides to use a tool, the server:

1. Executes the requested tool with the provided parameters
2. Returns the tool's response to the model
3. The model can then incorporate the tool's response into its final answer

#### Tool Discovery for AI Models

AI models can use the `/tools/available` endpoint to discover what tools are available and how to use them. This is particularly useful for:

- Dynamic tool discovery during runtime
- Self-documentation for AI agents
- Enabling AI systems to adapt to available capabilities

Example system prompt for AI models:
```
You have access to external tools through the MCP server. 
Before using any tools, you should check what tools are available by calling:
GET /tools/available

This will return a list of all available tools with their parameters and usage instructions.
You can then use these tools by following the provided usage patterns.
```

### Example Tool Usage

See the `/examples` directory for sample code demonstrating tool usage.

## Adding New Providers or Tools

### Adding New AI Providers

To add new AI providers:

1. Add the provider's SDK to the project
2. Create a new handler function in `server.js`
3. Add a new case in the main route handler

### Adding New Tools

To add new tools to the server:

1. Create a new tool implementation in the `/src/tools` directory
2. Add the tool definition to `tool-definitions.js`
3. Update the tool execution functions in `server.js`
4. Add new API endpoints for direct tool usage (if needed)

## License

GNU MIT
