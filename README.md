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

## Adding New Providers

To add new AI providers:

1. Add the provider's SDK to the project
2. Create a new handler function in `server.js`
3. Add a new case in the main route handler

## License

ISC