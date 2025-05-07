# MCP Server Test Suite

This directory contains the test suite for the MCP Server.

## Test Organization

The test suite is organized into the following categories:

- **API Tests**: Tests for API connectivity with AI providers like Anthropic and OpenAI
- **Security Tests**: Tests for security features like encryption
- **Integration Tests**: Tests for integration between components like MongoDB and image services
- **Unit Tests**: Tests for individual components and functions

## Running Tests

### Running All Tests

```bash
npm test
```

### Running Specific Test Categories

```bash
# Run API tests
npm run test:api

# Run security tests
npm run test:security

# Run integration tests
npm run test:integration

# Run unit tests
npm run test:unit
```

## Test Environment

Some tests require specific environment variables to be set:

- `ANTHROPIC_API_KEY`: Needed for Anthropic API tests
- `OPENAI_API_KEY`: Needed for OpenAI API and image generation tests
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID`: Needed for web search tests
- `MONGODB_URI`: Needed for MongoDB integration tests

If these environment variables are not set, the relevant tests will be skipped rather than failing.

## Adding New Tests

To add a new test:

1. Create a new test file in the appropriate category directory
2. Update the corresponding index.js file to include your test
3. Make sure your test returns a boolean indicating success/failure

## Test Coverage

- API connectivity and responses
- Database connections and operations
- Security and encryption
- Web search and content retrieval
- Image generation services

The test suite is designed to run even when external services are not available by using fallbacks and mock implementations where appropriate.