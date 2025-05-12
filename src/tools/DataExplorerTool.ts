import { MCPTool } from "mcp-framework";
import { z } from "zod";
import ERDTool from "./ERDTool.js";
import MongoDBTool from "./MongoDBTool.js";
import SwaggerTool from "./SwaggerTool.js";

interface DataExplorerToolInput {
  query: string;
  options?: {
    format?: string;
    limit?: number;
  };
}

type SourceData = {
  [key: string]: {
    available: boolean;
    result: any;
  };
};

class DataExplorerTool extends MCPTool<DataExplorerToolInput> {
  name = "data_explorer";
  description = "Explore and analyze data from multiple sources (MongoDB, ERD, Swagger) to provide comprehensive information about data structures and APIs.";
  
  private erdTool: ERDTool;
  private swaggerTool: SwaggerTool;
  private mongodbTool: MongoDBTool;
  
  // Track which data sources are available
  private availableDataSources: {
    erd: boolean;
    swagger: boolean;
    mongodb: boolean;
  };

  constructor() {
    super();
    this.erdTool = new ERDTool();
    this.swaggerTool = new SwaggerTool();
    this.mongodbTool = new MongoDBTool();
    
    // Check if environment variables are set
    this.availableDataSources = {
      erd: !!process.env.ERD_API_URL,
      swagger: !!process.env.SWAGGER_API_URL,
      mongodb: !!process.env.MONGODB_URI || !!process.env.MONGODB_CONNECTION_STRING,
    };
  }

  schema = {
    query: {
      type: z.string(),
      description: "The query string describing what information you are looking for (e.g., 'users table properties', 'talktalkInfo structure')",
    },
    options: {
      type: z.object({
        format: z.enum(["json", "markdown"]).optional().default("json"),
        limit: z.number().optional().default(10),
      }).optional(),
      description: "Response format and limit options",
    },
  };

  async execute(input: DataExplorerToolInput): Promise<any> {
    try {
      const format = input.options?.format || "json";
      const query = input.query.toLowerCase();
      
      // Extract entity name from the query
      // This is a simple extraction - in a real implementation, you'd want to use NLP
      const entityMatches = query.match(/\b(\w+)\b/g);
      let entityName = "";
      
      if (entityMatches) {
        // Filter out common words
        const commonWords = ['the', 'about', 'what', 'how', 'is', 'are', 'in', 'of', 'to', 'for', 'on', 'with', 'properties', 'structure', 'schema', 'fields', 'data', 'info', 'information', 'internal', 'property', 'field'];
        const potentialEntities = entityMatches.filter(word => !commonWords.includes(word));
        
        if (potentialEntities.length > 0) {
          entityName = potentialEntities[0];
        }
      }
      
      if (!entityName) {
        const errorResponse = {
          content: [
            {
              type: "text",
              text: "Could not determine which data entity you're asking about. Please specify a collection/table/entity name in your query."
            }
          ]
        };
        return errorResponse;
      }
      
      
      const sources: SourceData = {
        erd: { available: this.availableDataSources.erd, result: null },
        swagger: { available: this.availableDataSources.swagger, result: null },
        mongodb: { available: this.availableDataSources.mongodb, result: null }
      };
      
      // Gather data from available sources
      if (sources.erd.available) {
        sources.erd.result = await this.getERDInfo(entityName, format);
      }
      
      if (sources.swagger.available) {
        sources.swagger.result = await this.getSwaggerInfo(entityName, format);
      }
      
      if (sources.mongodb.available) {
        sources.mongodb.result = await this.getMongoDBInfo(entityName, format, input.options?.limit || 10);
      }
      
      if (format === "markdown") {
        const markdown = this.combineMarkdownResults(input.query, entityName, sources);
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
      
      // Combine results for JSON response
      const resultObj: { query: string, entityName: string, sources: { [key: string]: any } } = {
        query: input.query,
        entityName,
        sources: {}
      };
      
      for (const [source, data] of Object.entries(sources)) {
        if (data.available) {
          resultObj.sources[source] = data.result;
        } else {
          resultObj.sources[source] = { 
            message: `${source.toUpperCase()} data source is not configured. Set appropriate environment variables.` 
          };
        }
      }
      
      const jsonResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultObj, null, 2)
          }
        ]
      };
      return jsonResponse;
    } catch (error) {
      console.error("DataExplorerTool unexpected error:", error);
      const errorResponse = {
        content: [
          {
            type: "text",
            text: `Failed to retrieve comprehensive data information: ${error instanceof Error ? error.message : error}`
          }
        ]
      };
      return errorResponse;
    }
  }
  
  private async getERDInfo(entityName: string, format: string): Promise<any> {
    try {
      // Get all ERD data
      const response = await this.erdTool.execute({ options: { format } });
      
      if (!response?.content || !Array.isArray(response.content) || response.content.length === 0) {
        return { message: "Failed to retrieve ERD data: Invalid response format" };
      }
      
      const content = response.content[0];
      if (content.type !== 'text') {
        return { message: "Failed to retrieve ERD data: Response not in text format" };
      }
      
      try {
        if (format === 'json') {
          const erdData = JSON.parse(content.text);
          
          // Extract relevant table if present
          if (erdData.tables) {
            const relevantTable = erdData.tables.find((table: any) => 
              table.name.toLowerCase() === entityName.toLowerCase() || 
              table.name.toLowerCase().includes(entityName.toLowerCase())
            );
            
            if (relevantTable) {
              return { table: relevantTable };
            }
            
            return { message: `No ERD information found for '${entityName}'` };
          }
          
          return erdData;
        } else if (format === 'markdown') {
          // For markdown, we'll need to parse and extract the relevant section
          const tableSection = this.extractMarkdownSection(content.text, entityName);
          if (tableSection) {
            return tableSection;
          }
          
          return `No ERD information found for '${entityName}'`;
        }
      } catch (e) {
        return { message: `Failed to parse ERD data: ${e}` };
      }
      
      return { message: "Could not process ERD information" };
    } catch (error) {
      return { message: `ERD information retrieval failed: ${error}` };
    }
  }
  
  private async getSwaggerInfo(entityName: string, format: string): Promise<any> {
    try {
      // First try to find a path directly matching the entity name
      const directPathResponse = await this.swaggerTool.execute({ 
        options: { 
          format,
          path: `/${entityName}`
        } 
      });
      
      if (!directPathResponse?.content || !Array.isArray(directPathResponse.content) || directPathResponse.content.length === 0) {
        return { message: "Failed to retrieve Swagger data: Invalid response format" };
      }
      
      const directPathContent = directPathResponse.content[0];
      if (directPathContent.type !== 'text') {
        return { message: "Failed to retrieve Swagger data: Response not in text format" };
      }
      
      // Get all paths
      const allResponse = await this.swaggerTool.execute({ options: { format } });
      
      if (!allResponse?.content || !Array.isArray(allResponse.content) || allResponse.content.length === 0) {
        return { message: "Failed to retrieve Swagger data: Invalid response format" };
      }
      
      const allContent = allResponse.content[0];
      if (allContent.type !== 'text') {
        return { message: "Failed to retrieve Swagger data: Response not in text format" };
      }
      
      try {
        if (format === 'json') {
          // Try to use the direct path result first
          try {
            const directPathData = JSON.parse(directPathContent.text);
            if (directPathData.paths && Object.keys(directPathData.paths).length > 0) {
              return directPathData;
            }
          } catch (e) {
            // Ignore error and continue with all paths
          }
          
          // Process all swagger data
          const swaggerData = JSON.parse(allContent.text);
          
          const relevantPaths: Record<string, any> = {};
          const relevantSchemas: Record<string, any> = {};
          
          // Find paths that contain the entity name
          if (swaggerData.paths) {
            for (const [path, methods] of Object.entries(swaggerData.paths)) {
              if (path.toLowerCase().includes(entityName.toLowerCase())) {
                relevantPaths[path] = methods;
              }
            }
          }
          
          // Find schemas that match the entity name
          if (swaggerData.components && swaggerData.components.schemas) {
            for (const [schemaName, schema] of Object.entries(swaggerData.components.schemas)) {
              if (schemaName.toLowerCase().includes(entityName.toLowerCase())) {
                relevantSchemas[schemaName] = schema;
              }
            }
          }
          
          if (Object.keys(relevantPaths).length === 0 && Object.keys(relevantSchemas).length === 0) {
            return { message: `No Swagger information found for '${entityName}'` };
          }
          
          return {
            paths: relevantPaths,
            schemas: relevantSchemas
          };
        } else if (format === 'markdown') {
          // For markdown, extract the relevant sections
          // Try direct path first
          const directPathSection = this.extractMarkdownSection(directPathContent.text, entityName);
          if (directPathSection) {
            return directPathSection;
          }
          
          // Try all paths
          const relevantSections = this.extractMarkdownSection(allContent.text, entityName);
          if (relevantSections) {
            return relevantSections;
          }
          
          return `No Swagger information found for '${entityName}'`;
        }
      } catch (e) {
        return { message: `Failed to parse Swagger data: ${e}` };
      }
      
      return { message: "Could not process Swagger information" };
    } catch (error) {
      return { message: `Swagger information retrieval failed: ${error}` };
    }
  }
  
  private async getMongoDBInfo(entityName: string, format: string, limit: number): Promise<any> {
    try {
      // First try to describe the collection
      const schemaResponse = await this.mongodbTool.execute({
        action: "describeCollection",
        collection: entityName,
        options: { format, limit }
      });
      
      if (!schemaResponse?.content || !Array.isArray(schemaResponse.content) || schemaResponse.content.length === 0) {
        return { message: "Failed to retrieve MongoDB schema: Invalid response format" };
      }
      
      const schemaContent = schemaResponse.content[0];
      if (schemaContent.type !== 'text') {
        return { message: "Failed to retrieve MongoDB schema: Response not in text format" };
      }
      
      let schemaData;
      try {
        schemaData = format === 'json' ? JSON.parse(schemaContent.text) : schemaContent.text;
      } catch (e) {
        return { message: `Failed to parse MongoDB schema: ${e}` };
      }
      
      // Check if we found a valid collection
      if (format === 'json' && (!schemaData || !schemaData.name)) {
        return { message: `No MongoDB collection found with name '${entityName}'` };
      }
      
      // Get sample data
      const sampleResponse = await this.mongodbTool.execute({
        action: "sampleData",
        collection: entityName,
        options: { format, limit: 2 } // Limit to just 2 samples for brevity
      });
      
      let sampleData = { message: "Could not retrieve sample data" };
      
      if (sampleResponse?.content && Array.isArray(sampleResponse.content) && sampleResponse.content.length > 0) {
        const sampleContent = sampleResponse.content[0];
        if (sampleContent.type === 'text') {
          try {
            sampleData = format === 'json' ? JSON.parse(sampleContent.text) : sampleContent.text;
          } catch (e) {
            sampleData = { message: `Failed to parse MongoDB sample data: ${e}` };
          }
        }
      }
      
      return {
        schema: schemaData,
        samples: sampleData
      };
    } catch (error) {
      return { message: `MongoDB information retrieval failed: ${error}` };
    }
  }
  
  private extractMarkdownSection(markdown: string, entityName: string): string | null {
    // This is a simple implementation - a real one would be more sophisticated
    const lines = markdown.split('\n');
    let capturing = false;
    let capturedSection = "";
    let currentIndentLevel = 0;
    const targetPattern = new RegExp(`\\b${entityName}\\b`, 'i');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for headers that mention the entity
      if (/^#{1,6}\s/.test(line) && targetPattern.test(line)) {
        capturing = true;
        currentIndentLevel = line.match(/^(#{1,6})\s/)?.[1].length || 0;
        capturedSection = line + "\n";
        continue;
      }
      
      // If we're capturing and encounter a header of same or lower level, stop
      if (capturing && /^#{1,6}\s/.test(line)) {
        const headerLevel = line.match(/^(#{1,6})\s/)?.[1].length || 0;
        if (headerLevel <= currentIndentLevel) {
          break;
        }
      }
      
      // Add the line if we're capturing
      if (capturing) {
        capturedSection += line + "\n";
      }
    }
    
    return capturing ? capturedSection : null;
  }
  
  private combineMarkdownResults(
    query: string, 
    entityName: string, 
    sources: { [key: string]: { available: boolean, result: any } }
  ): string {
    let markdown = `# Comprehensive Information about '${entityName}'\n\n`;
    markdown += `Query: "${query}"\n\n`;
    
    // List available data sources
    const availableSources = Object.entries(sources)
      .filter(([_, data]) => data.available)
      .map(([name, _]) => name.toUpperCase());
    
    if (availableSources.length < 3) {
      markdown += `> **Note:** Only the following data sources are configured: ${availableSources.join(", ")}.\n\n`;
    }
    
    // Add ERD information
    markdown += "## Database Schema (ERD)\n\n";
    if (!sources.erd.available) {
      markdown += "ERD data source is not configured. Please set ERD_API_URL in environment variables.\n\n";
    } else {
      const erdResult = sources.erd.result;
      
      if (typeof erdResult === "string") {
        markdown += erdResult + "\n\n";
      } else if (erdResult.message) {
        markdown += erdResult.message + "\n\n";
      } else if (erdResult.table) {
        markdown += `### ${erdResult.table.name}\n\n`;
        markdown += `${erdResult.table.description || 'No description'}\n\n`;
        
        if (erdResult.table.columns && erdResult.table.columns.length > 0) {
          markdown += "| Column | Type | Description | Required | Key |\n";
          markdown += "|--------|------|-------------|----------|-----|\n";
          
          erdResult.table.columns.forEach((column: any) => {
            markdown += `| ${column.name} | ${column.type} | ${column.description || ''} | ${column.required ? 'Yes' : 'No'} | ${column.isPrimaryKey ? 'PK' : (column.isForeignKey ? 'FK' : '')} |\n`;
          });
          
          markdown += "\n";
        }
        
        if (erdResult.table.relations && erdResult.table.relations.length > 0) {
          markdown += "#### Relations\n\n";
          
          erdResult.table.relations.forEach((relation: any) => {
            markdown += `- ${relation.description || relation.type}: ${relation.sourceTable}.${relation.sourceColumn} → ${relation.targetTable}.${relation.targetColumn}\n`;
          });
          
          markdown += "\n";
        }
      } else {
        markdown += "No ERD information available for this entity.\n\n";
      }
    }
    
    // Add Swagger information
    markdown += "## API Documentation (Swagger)\n\n";
    if (!sources.swagger.available) {
      markdown += "Swagger data source is not configured. Please set SWAGGER_API_URL in environment variables.\n\n";
    } else {
      const swaggerResult = sources.swagger.result;
      
      if (typeof swaggerResult === "string") {
        markdown += swaggerResult + "\n\n";
      } else if (swaggerResult.message) {
        markdown += swaggerResult.message + "\n\n";
      } else {
        // If we have paths
        if (swaggerResult.paths && Object.keys(swaggerResult.paths).length > 0) {
          markdown += "### API Endpoints\n\n";
          
          for (const [path, methods] of Object.entries(swaggerResult.paths)) {
            markdown += `#### ${path}\n\n`;
            
            for (const [method, info] of Object.entries(methods as Record<string, any>)) {
              markdown += `##### ${method.toUpperCase()}\n\n`;
              
              if (info.summary) {
                markdown += `**Summary**: ${info.summary}\n\n`;
              }
              
              if (info.description) {
                markdown += `**Description**: ${info.description}\n\n`;
              }
              
              // Add more Swagger details as needed...
            }
          }
        }
        
        // If we have schemas
        if (swaggerResult.schemas && Object.keys(swaggerResult.schemas).length > 0) {
          markdown += "### API Models\n\n";
          
          for (const [schemaName, schema] of Object.entries(swaggerResult.schemas)) {
            markdown += `#### ${schemaName}\n\n`;
            
            if ((schema as any).properties) {
              markdown += "| Property | Type | Required | Description |\n";
              markdown += "|----------|------|----------|-------------|\n";
              
              for (const [propName, propDetails] of Object.entries((schema as any).properties)) {
                const required = (schema as any).required && (schema as any).required.includes(propName);
                markdown += `| ${propName} | ${(propDetails as any).type || ''} | ${required ? 'Yes' : 'No'} | ${(propDetails as any).description || ''} |\n`;
              }
              
              markdown += "\n";
            }
          }
        }
        
        if ((!swaggerResult.paths || Object.keys(swaggerResult.paths).length === 0) &&
            (!swaggerResult.schemas || Object.keys(swaggerResult.schemas).length === 0)) {
          markdown += "No Swagger information available for this entity.\n\n";
        }
      }
    }
    
    // Add MongoDB information
    markdown += "## MongoDB Data\n\n";
    if (!sources.mongodb.available) {
      markdown += "MongoDB data source is not configured. Please set MONGODB_URI or MONGODB_CONNECTION_STRING in environment variables.\n\n";
    } else {
      const mongoResult = sources.mongodb.result;
      
      if (mongoResult.message) {
        markdown += mongoResult.message + "\n\n";
      } else {
        // Add schema information
        if (mongoResult.schema) {
          markdown += "### Collection Schema\n\n";
          
          if (mongoResult.schema.message) {
            markdown += `${mongoResult.schema.message}\n\n`;
          } else if (mongoResult.schema.fields && mongoResult.schema.fields.length > 0) {
            markdown += "| Field Name | Type | Document Count |\n";
            markdown += "|------------|------|----------------|\n";
            
            mongoResult.schema.fields.forEach((field: any) => {
              markdown += `| ${field.name} | ${field.type} | ${field.count} |\n`;
            });
            
            markdown += "\n";
          }
        }
        
        // Add sample data
        if (mongoResult.samples) {
          if (mongoResult.samples.message) {
            markdown += `### Sample Data: ${mongoResult.samples.message}\n\n`;
          } else if (mongoResult.samples.data && mongoResult.samples.data.length > 0) {
            markdown += "### Sample Documents\n\n";
            
            mongoResult.samples.data.forEach((doc: any, index: number) => {
              markdown += `#### Document ${index + 1}\n\n`;
              markdown += "```json\n";
              markdown += JSON.stringify(doc, null, 2);
              markdown += "\n```\n\n";
            });
          }
        }
      }
    }
    
    return markdown;
  }
}

export default DataExplorerTool; 