# backend-explorer-mcp

The Backend Insight Gateway is a Model Context Protocol (MCP) server designed to help frontend developers understand backend code implementations using Cursor AI. This server provides tools to explore ERD, Swagger API documentation, and MongoDB databases.

## Available Tools

### 1. get_erd

Retrieves Entity-Relationship Diagram (ERD) information to understand backend database schema and relationships.

```typescript
// Usage example
{
  "options": {
    "format": "markdown" // or "json"
  }
}
```

### 2. get_swagger

Retrieves Swagger API documentation to explore backend API endpoints, parameters, response schemas, and more.

```typescript
// Usage example
{
  "options": {
    "format": "markdown", // or "json"
    "path": "/api/users" // Optional: filter for specific path only
  }
}
```

### 3. mongodb_explorer

Explore MongoDB database information including collections, schemas, and sample data.

```typescript
// List collections
{
  "action": "listCollections",
  "options": {
    "format": "markdown" // or "json"
  }
}

// Describe collection schema
{
  "action": "describeCollection",
  "collection": "users",
  "options": {
    "format": "markdown" // or "json"
  }
}

// View sample data
{
  "action": "sampleData",
  "collection": "users",
  "options": {
    "format": "markdown", // or "json"
    "limit": 5 // Number of sample documents to retrieve (default: 10)
  }
}

// Run query
{
  "action": "query",
  "collection": "users",
  "query": "{\"username\": \"johndoe\"}",
  "options": {
    "format": "markdown", // or "json"
    "limit": 5 // Limit results (default: 10)
  }
}
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your specific URLs and credentials

# Build the project
pnpm run build

# Start the server
pnpm start
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```
# Backend API URLs
ERD_API_URL=https://your-api.example.com/erd
SWAGGER_API_URL=https://your-api.example.com/swaggerJson

# MongoDB Configuration
MONGODB_API_URL=https://your-api.example.com/api/mongodb
# MONGODB_CONNECTION_STRING=mongodb://username:password@host:port/database

# Server Configuration
PORT=8080
# Set to "sse" or "http" to use HTTP transport instead of stdio
# TRANSPORT_TYPE=sse
# CORS_ALLOWED_ORIGIN=*
```

## Project Structure

```
backend-explorer-mcp/
├── src/
│   ├── tools/        # MCP tools
│   │   ├── ERDTool.ts
│   │   ├── SwaggerTool.ts
│   │   ├── MongoDBTool.ts
│   │   └── ExampleTool.ts
│   └── index.ts      # Server entry point
├── package.json
└── tsconfig.json
```

## Usage with Cursor

Add the MCP server in Cursor settings:

1. Launch Cursor and go to Preferences
2. Select the MCP tab
3. Click "Add new global MCP server"
4. Configure as follows:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/backend-explorer-mcp/dist/index.js"]
}
```

## Usage with Claude Desktop

### Development Environment

Add the following configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "backend-explorer-mcp": {
      "command": "node",
      "args":["/absolute/path/to/backend-explorer-mcp/dist/index.js"]
    }
  }
}
```

### After Deployment

After publishing the package to npm, you can configure it as follows:

```json
{
  "mcpServers": {
    "backend-explorer-mcp": {
      "command": "npx",
      "args": ["backend-explorer-mcp"]
    }
  }
}
```

## Building and Testing

1. Modify the tools
2. Run `pnpm run build` to compile
3. The server will automatically load the tools

## Publishing to npm

To publish the package to npm:

```bash
# Update version in package.json
pnpm version [patch|minor|major]

# Build the project
pnpm run build

# Publish to npm
pnpm publish
```

Make sure to set the appropriate access level in your `package.json`:

```json
{
  "name": "backend-explorer-mcp",
  "publishConfig": {
    "access": "public" // or "restricted" for private packages
  }
}
```

## Learn More

- [MCP Framework GitHub](https://github.com/QuantGeekDev/mcp-framework)
- [MCP Framework Documentation](https://mcp-framework.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
