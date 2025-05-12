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

process.stderr.write("Backend Explorer MCP server started with configuration:\n");
process.stderr.write(`- ERD API: ${process.env.ERD_API_URL ? "Set" : "Not Set"}\n`);
process.stderr.write(`- Swagger API: ${process.env.SWAGGER_API_URL ? "Set" : "Not Set"}\n`);
process.stderr.write(`- MongoDB: ${process.env.MONGODB_URI || process.env.MONGODB_CONNECTION_STRING ? "Set" : "Not Set"}\n`);
process.stderr.write(`- Port: ${process.env.PORT || 3333}\n`);

// MCP 서버 설정 및 시작
const server = new MCPServer({
  name: "backend-explorer-mcp",
  version: "1.0.0",
  transport: {
    type: "http-stream",
    options: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 3333
    }
  }
});

// 도구 처리와 응답 형식 디버깅을 위한 로깅
process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 거부(unhandled rejection):', reason);
});

process.on('uncaughtException', (error) => {
  console.error('처리되지 않은 예외(uncaught exception):', error);
});

server.start().catch((error) => {
  console.error("서버 시작 오류:", error);
  process.exit(1);
});