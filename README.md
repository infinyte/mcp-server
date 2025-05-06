# Model Context Protocol (MCP) Server

A simple server implementation for the Model Context Protocol that provides a unified API for multiple AI model providers.

## Features

- Unified API for multiple AI providers (Anthropic, OpenAI)
- Support for chat completions and legacy completions
- Tool calling support
- Context/system message handling
- Environment-based configuration

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd testmcp

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit the `.env` file and add your API keys:

```
PORT=3000
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

### Start the server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will be running at http://localhost:3000 (or the port you specified in .env).

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

#### `GET /health`

Health check endpoint that returns status 200 if the server is running.

### Example Clients

#### Command Line Client

A test client is included in `src/client.js`. To run it:

```bash
node src/client.js
```

#### Web Client

A simple web interface is available at http://localhost:3000 when the server is running. You can use this to test the API directly from your browser.

## Available Tools

### Web Search Tools

The server includes built-in web search and retrieval tools:

1. **Web Search** (`/tools/web/search`)
   - Search the web for information on a given query
   - Parameters: `query` (required), `limit` (optional)

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

### Tool Integration with AI Models

The MCP server automatically handles tool calling and execution with AI models. When a model decides to use a tool, the server:

1. Executes the requested tool with the provided parameters
2. Returns the tool's response to the model
3. The model can then incorporate the tool's response into its final answer

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

ISC