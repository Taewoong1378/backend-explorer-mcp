import axios from "axios";
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ERDToolInput {
  options?: {
    format?: string;
  };
}

class ERDTool extends MCPTool<ERDToolInput> {
  name = "get_erd";
  description = "Retrieves Entity-Relationship Diagram (ERD) information to understand backend database schema and relationships.";

  schema = {
    options: {
      type: z.object({
        format: z.enum(["json", "markdown"]).optional().default("json"),
      }).optional(),
      description: "Response format options: 'json' or 'markdown'",
    },
  };

  async execute(input: ERDToolInput): Promise<any> {
    try {
      const format = input.options?.format || "json";
      const erdApiUrl = process.env.ERD_API_URL;
      
      if (!erdApiUrl) {
        const errorResponse = {
          content: [
            {
              type: "text",
              text: "ERD_API_URL is not set in the environment variables"
            }
          ]
        };
        return errorResponse;
      }
      
      try {
        const response = await axios.get(erdApiUrl);
        
        if (format === "markdown") {
          const markdown = this.convertToMarkdown(response.data);
          const successResponse = {
            content: [
              {
                type: "text", 
                text: markdown
              }
            ]
          };
          return successResponse;
        }
        
        const jsonResponse = {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
        return jsonResponse;
      } catch (requestError) {
        console.error("ERDTool axios error:", requestError);
        let errorMessage = "Unknown error";
        
        if (axios.isAxiosError(requestError)) {
          errorMessage = `Failed to retrieve ERD information: ${requestError.message}`;
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
      console.error("ERDTool unexpected error:", error);
      let errorMessage = "Unknown error";
      
      if (error instanceof Error) {
        errorMessage = `Failed to retrieve ERD information: ${error.message}`;
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

  private convertToMarkdown(data: any): string {
    // Logic to convert ERD data to markdown format
    // Implementation may vary based on actual data structure
    try {
      let markdown = "# Database ERD\n\n";
      
      // Convert data based on its structure
      if (Array.isArray(data.tables)) {
        markdown += "## Tables\n\n";
        
        data.tables.forEach((table: any) => {
          markdown += `### ${table.name}\n\n`;
          markdown += `${table.description || 'No description'}\n\n`;
          
          if (Array.isArray(table.columns)) {
            markdown += "| Column | Type | Description | Required | Key |\n";
            markdown += "|--------|------|-------------|----------|-----|\n";
            
            table.columns.forEach((column: any) => {
              markdown += `| ${column.name} | ${column.type} | ${column.description || ''} | ${column.required ? 'Yes' : 'No'} | ${column.isPrimaryKey ? 'PK' : (column.isForeignKey ? 'FK' : '')} |\n`;
            });
            
            markdown += "\n";
          }
          
          if (Array.isArray(table.relations)) {
            markdown += "#### Relations\n\n";
            
            table.relations.forEach((relation: any) => {
              markdown += `- ${relation.description || relation.type}: ${relation.sourceTable}.${relation.sourceColumn} → ${relation.targetTable}.${relation.targetColumn}\n`;
            });
            
            markdown += "\n";
          }
        });
      } else {
        markdown += "ERD data could not be converted to markdown format. Please use JSON format instead.\n";
      }
      
      return markdown;
    } catch (error) {
      return `Failed to convert ERD data to markdown: ${error}. Please use JSON format instead.`;
    }
  }
}

export default ERDTool; 