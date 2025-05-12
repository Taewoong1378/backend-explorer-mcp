import axios from "axios";
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface SwaggerToolInput {
  options?: {
    format?: string;
    path?: string;
  };
}

class SwaggerTool extends MCPTool<SwaggerToolInput> {
  name = "get_swagger";
  description = "Retrieves Swagger API documentation to explore backend API endpoints, parameters, response schemas, and more.";

  schema = {
    options: {
      type: z.object({
        format: z.enum(["json", "markdown"]).optional().default("json"),
        path: z.string().optional(),
      }).optional(),
      description: "Options for the response format ('json' or 'markdown') and specific API path to filter (optional)",
    },
  };

  async execute(input: SwaggerToolInput): Promise<any> {
    try {
      const format = input.options?.format || "json";
      const path = input.options?.path;
      const swaggerApiUrl = process.env.SWAGGER_API_URL;
      
      if (!swaggerApiUrl) {
        const errorResponse = {
          content: [
            {
              type: "text",
              text: "SWAGGER_API_URL is not set in the environment variables"
            }
          ]
        };
        return errorResponse;
      }

      try {
        const response = await axios.get(swaggerApiUrl);
        
        let data = response.data;
        
        // Filter for specific path if provided
        if (path && data.paths && data.paths[path]) {
          data = {
            ...data,
            paths: {
              [path]: data.paths[path]
            }
          };
        }
        
        if (format === "markdown") {
          const markdown = this.convertToMarkdown(data, path);
          const markdownResponse = {
            content: [
              {
                type: "text",
                text: markdown
              }
            ]
          };
          return markdownResponse;
        }
        
        const jsonResponse = {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        };
        return jsonResponse;
      } catch (requestError) {
        console.error("SwaggerTool axios error:", requestError);
        let errorMessage = "Unknown error";
        
        if (axios.isAxiosError(requestError)) {
          errorMessage = `Failed to retrieve Swagger information: ${requestError.message}`;
        } else if (requestError instanceof Error) {
          errorMessage = requestError.message;
        }
        
        const errorResponse = {
          content: [
            {
              type: "text",
              text: errorMessage
            }
          ]
        };
        return errorResponse;
      }
    } catch (error) {
      console.error("SwaggerTool unexpected error:", error);
      let errorMessage = "Unknown error";
      
      if (error instanceof Error) {
        errorMessage = `Failed to retrieve Swagger information: ${error.message}`;
      }
      
      const errorResponse = {
        content: [
          {
            type: "text",
            text: errorMessage
          }
        ]
      };
      return errorResponse;
    }
  }

  private convertToMarkdown(data: any, specificPath?: string): string {
    try {
      let markdown = "# API Documentation (Swagger)\n\n";
      
      if (data.info) {
        markdown += `## ${data.info.title || 'API Documentation'}\n\n`;
        markdown += `${data.info.description || ''}\n\n`;
        
        if (data.info.version) {
          markdown += `**Version**: ${data.info.version}\n\n`;
        }
      }
      
      if (data.paths) {
        markdown += "## Endpoints\n\n";
        
        Object.entries(data.paths).forEach(([path, methods]: [string, any]) => {
          markdown += `### ${path}\n\n`;
          
          Object.entries(methods).forEach(([method, info]: [string, any]) => {
            markdown += `#### ${method.toUpperCase()}\n\n`;
            
            if (info.summary) {
              markdown += `**Summary**: ${info.summary}\n\n`;
            }
            
            if (info.description) {
              markdown += `**Description**: ${info.description}\n\n`;
            }
            
            if (info.parameters && info.parameters.length > 0) {
              markdown += "**Parameters**:\n\n";
              markdown += "| Name | Location | Required | Type | Description |\n";
              markdown += "|------|----------|----------|------|-------------|\n";
              
              info.parameters.forEach((param: any) => {
                markdown += `| ${param.name} | ${param.in} | ${param.required ? 'Yes' : 'No'} | ${param.type || (param.schema && param.schema.type) || ''} | ${param.description || ''} |\n`;
              });
              
              markdown += "\n";
            }
            
            if (info.requestBody) {
              markdown += "**Request Body**:\n\n";
              
              if (info.requestBody.content && info.requestBody.content["application/json"] && 
                  info.requestBody.content["application/json"].schema) {
                const schema = info.requestBody.content["application/json"].schema;
                
                if (schema.properties) {
                  markdown += "| Property | Type | Required | Description |\n";
                  markdown += "|----------|------|----------|-------------|\n";
                  
                  Object.entries(schema.properties).forEach(([prop, details]: [string, any]) => {
                    const required = schema.required && schema.required.includes(prop);
                    markdown += `| ${prop} | ${details.type || ''} | ${required ? 'Yes' : 'No'} | ${details.description || ''} |\n`;
                  });
                  
                  markdown += "\n";
                }
              }
            }
            
            if (info.responses) {
              markdown += "**Responses**:\n\n";
              
              Object.entries(info.responses).forEach(([code, response]: [string, any]) => {
                markdown += `**${code}**: ${response.description || ''}\n\n`;
                
                if (response.content && response.content["application/json"] && 
                    response.content["application/json"].schema) {
                  markdown += "Response schema:\n";
                  markdown += "```json\n";
                  markdown += JSON.stringify(response.content["application/json"].schema, null, 2);
                  markdown += "\n```\n\n";
                }
              });
            }
          });
        });
      }
      
      return markdown;
    } catch (error) {
      return `Failed to convert Swagger data to markdown: ${error}. Please use JSON format instead.`;
    }
  }
}

export default SwaggerTool; 