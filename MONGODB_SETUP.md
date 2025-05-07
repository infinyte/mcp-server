# MongoDB Setup Options for MCP Server

The MCP server requires a MongoDB database for persistent storage. Here are several options for setting up MongoDB:

## Option 1: Docker Compose (Recommended for Development)

The easiest way to get started with MongoDB is to use the included Docker Compose configuration. This will start MongoDB and Mongo Express (a web-based admin interface) in Docker containers.

Prerequisites:
- Docker and Docker Compose installed

Steps:
1. From the project root, run:
   ```bash
   docker compose up -d
   ```

2. MongoDB will be available at: `mongodb://mcpuser:mcppassword@localhost:27017`
3. Mongo Express will be available at: `http://localhost:8081`

## Option 2: Local MongoDB Installation

You can install MongoDB directly on your machine.

Steps:
1. Install MongoDB from https://www.mongodb.com/try/download/community
2. Start the MongoDB service
3. Update your `.env` file with:
   ```
   MONGODB_URI=mongodb://localhost:27017/mcp-server
   ```

## Option 3: MongoDB Atlas (Recommended for Production)

MongoDB Atlas is a cloud-hosted MongoDB service that offers a free tier.

Steps:
1. Create an account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster
3. Set up a database user and whitelist your IP address
4. Get your connection string and update your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/mcp-server?retryWrites=true&w=majority
   ```

## Option 4: Run Without MongoDB (Limited Functionality)

The MCP server can run without MongoDB, but with limited functionality:
- Tool definitions won't be persisted between restarts
- No tool execution history
- No configuration storage

The server will automatically detect if MongoDB is unavailable and run in this mode.