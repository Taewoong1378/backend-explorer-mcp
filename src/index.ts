import dotenv from "dotenv";
import { MCPServer } from "mcp-framework";


function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=', 2);
      parsedArgs[key] = value;
      continue;
    }
    
    if (arg.startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      parsedArgs[key] = value;
      i++; 
      continue;
    }
  }
  
  return parsedArgs;
}


function setEnvFromArgs(args: Record<string, string>) {
  
  if (args['mongodb-uri']) {
    process.env.MONGODB_URI = args['mongodb-uri'];
  }
  
  if (args['mongodb-connection-string']) {
    process.env.MONGODB_CONNECTION_STRING = args['mongodb-connection-string'];
  }
  
  
  if (args['erd-api-url']) {
    process.env.ERD_API_URL = args['erd-api-url'];
  }
  
  
  if (args['swagger-api-url']) {
    process.env.SWAGGER_API_URL = args['swagger-api-url'];
  }
  
  
  if (args['port']) {
    process.env.PORT = args['port'];
  }
  
  
  if (args['log-level']) {
    process.env.LOG_LEVEL = args['log-level'];
  }
}


dotenv.config();


const args = parseCommandLineArgs();
setEnvFromArgs(args);

const server = new MCPServer();

server.start().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});

console.log("Backend Explorer MCP server started with configuration:");
console.log(`- ERD API: ${process.env.ERD_API_URL ? "설정됨" : "설정되지 않음"}`);
console.log(`- Swagger API: ${process.env.SWAGGER_API_URL ? "설정됨" : "설정되지 않음"}`);
console.log(`- MongoDB: ${process.env.MONGODB_URI || process.env.MONGODB_CONNECTION_STRING ? "설정됨" : "설정되지 않음"}`);
console.log(`- Port: ${process.env.PORT || 3333}`);