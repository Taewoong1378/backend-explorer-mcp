import dotenv from "dotenv";
import { MCPServer } from "mcp-framework";

// Load environment variables from .env file
dotenv.config();

// Create server instance
const server = new MCPServer();

// Start the server
server.start().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});

console.log("Backend Insight Gateway MCP server started successfully.");