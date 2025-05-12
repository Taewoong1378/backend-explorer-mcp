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

  async execute(input: ERDToolInput) {
    try {
      const format = input.options?.format || "json";
      const erdApiUrl = process.env.ERD_API_URL;
      
      if (!erdApiUrl) {
        return {
          error: true,
          message: "ERD_API_URL is not set in the environment variables"
        };
      }
      
      const response = await axios.get(erdApiUrl);
      
      if (format === "markdown") {
        return this.convertToMarkdown(response.data);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          error: true,
          message: `Failed to retrieve ERD information: ${error.message}`,
          status: error.response?.status || 500
        };
      }
      return {
        error: true,
        message: `Failed to retrieve ERD information: ${error}`,
      };
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