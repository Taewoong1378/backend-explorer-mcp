import { MCPTool } from "mcp-framework";
import { z } from "zod";
import ERDTool from "./ERDTool";
import MongoDBTool from "./MongoDBTool";
import SwaggerTool from "./SwaggerTool";

interface DataExplorerToolInput {
  query: string;
  options?: {
    format?: string;
    limit?: number;
  };
}

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
    
    console.log("Available data sources:", 
      Object.entries(this.availableDataSources)
        .filter(([_, available]) => available)
        .map(([source]) => source)
        .join(", ")
    );
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

  async execute(input: DataExplorerToolInput) {
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
        return {
          error: true,
          message: "Could not determine which data entity you're asking about. Please specify a collection/table/entity name in your query."
        };
      }
      
      // Prepare promises for data retrieval based on available sources
      const promises: Promise<any>[] = [];
      const sources: string[] = [];
      
      if (this.availableDataSources.erd) {
        promises.push(this.getERDInfo(entityName, format));
        sources.push('erd');
      } else {
        promises.push(Promise.resolve({ message: "ERD data source is not configured. Set ERD_API_URL in environment variables." }));
        sources.push('erd');
      }
      
      if (this.availableDataSources.swagger) {
        promises.push(this.getSwaggerInfo(entityName, format));
        sources.push('swagger');
      } else {
        promises.push(Promise.resolve({ message: "Swagger data source is not configured. Set SWAGGER_API_URL in environment variables." }));
        sources.push('swagger');
      }
      
      if (this.availableDataSources.mongodb) {
        promises.push(this.getMongoDBInfo(entityName, format, input.options?.limit || 10));
        sources.push('mongodb');
      } else {
        promises.push(Promise.resolve({ message: "MongoDB data source is not configured. Set MONGODB_URI or MONGODB_CONNECTION_STRING in environment variables." }));
        sources.push('mongodb');
      }
      
      // Execute the prepared promises
      const results = await Promise.all(promises);
      
      // Combine results
      const result: any = {
        query: input.query,
        entityName,
        sources: {}
      };
      
      sources.forEach((source, index) => {
        result.sources[source] = results[index];
      });
      
      if (format === "markdown") {
        return this.combineMarkdownResults(
          input.query, 
          entityName, 
          results[sources.indexOf('erd')], 
          results[sources.indexOf('swagger')], 
          results[sources.indexOf('mongodb')]
        );
      }
      
      return result;
    } catch (error) {
      return {
        error: true,
        message: `Failed to retrieve comprehensive data information: ${error}`,
      };
    }
  }
  
  private async getERDInfo(entityName: string, format: string): Promise<any> {
    try {
      // Get all ERD data
      const allErd = await this.erdTool.execute({ options: { format } });
      
      // If in error state, return as is
      if (allErd.error) {
        return allErd;
      }
      
      // For JSON format, extract the relevant entity
      if (format === "json" && allErd.tables) {
        const relevantTable = allErd.tables.find((table: any) => 
          table.name.toLowerCase() === entityName.toLowerCase() || 
          table.name.toLowerCase().includes(entityName.toLowerCase())
        );
        
        if (relevantTable) {
          return { table: relevantTable };
        }
        
        return { message: `No ERD information found for '${entityName}'` };
      }
      
      // For markdown, we'll need to parse and extract the relevant section
      if (format === "markdown" && typeof allErd === "string") {
        const tableSection = this.extractMarkdownSection(allErd, entityName);
        if (tableSection) {
          return tableSection;
        }
        
        return `No ERD information found for '${entityName}'`;
      }
      
      return allErd;
    } catch (error) {
      return { error: true, message: `ERD information retrieval failed: ${error}` };
    }
  }
  
  private async getSwaggerInfo(entityName: string, format: string): Promise<any> {
    try {
      // First try to find a path directly matching the entity name
      const directPathResult = await this.swaggerTool.execute({ 
        options: { 
          format,
          path: `/${entityName}`
        } 
      });
      
      // If a direct path was found and it's not an error, return it
      if (!directPathResult.error && 
          !(directPathResult.paths && Object.keys(directPathResult.paths).length === 0)) {
        return directPathResult;
      }
      
      // Otherwise, get all paths and filter
      const allSwagger = await this.swaggerTool.execute({ options: { format } });
      
      // If in error state, return as is
      if (allSwagger.error) {
        return allSwagger;
      }
      
      // For JSON format, extract the relevant paths and schemas
      if (format === "json") {
        const relevantPaths: Record<string, any> = {};
        const relevantSchemas: Record<string, any> = {};
        
        // Find paths that contain the entity name
        if (allSwagger.paths) {
          for (const [path, methods] of Object.entries(allSwagger.paths)) {
            if (path.toLowerCase().includes(entityName.toLowerCase())) {
              relevantPaths[path] = methods;
            }
          }
        }
        
        // Find schemas that match the entity name
        if (allSwagger.components && allSwagger.components.schemas) {
          for (const [schemaName, schema] of Object.entries(allSwagger.components.schemas)) {
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
      }
      
      // For markdown, we'll need to parse and extract the relevant sections
      if (format === "markdown" && typeof allSwagger === "string") {
        const relevantSections = this.extractMarkdownSection(allSwagger, entityName);
        if (relevantSections) {
          return relevantSections;
        }
        
        return `No Swagger information found for '${entityName}'`;
      }
      
      return allSwagger;
    } catch (error) {
      return { error: true, message: `Swagger information retrieval failed: ${error}` };
    }
  }
  
  private async getMongoDBInfo(entityName: string, format: string, limit: number): Promise<any> {
    try {
      // First try to describe the collection
      const schemaResult = await this.mongodbTool.execute({
        action: "describeCollection",
        collection: entityName,
        options: { format, limit }
      });
      
      // If we couldn't find the collection or there was an error
      if (schemaResult.error) {
        return { message: `No MongoDB collection found with name '${entityName}'` };
      }
      
      // Get sample data
      const sampleResult = await this.mongodbTool.execute({
        action: "sampleData",
        collection: entityName,
        options: { format, limit: 2 } // Limit to just 2 samples for brevity
      });
      
      return {
        schema: schemaResult,
        samples: sampleResult.error ? { message: "Could not retrieve sample data" } : sampleResult
      };
    } catch (error) {
      return { error: true, message: `MongoDB information retrieval failed: ${error}` };
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
  
  private combineMarkdownResults(query: string, entityName: string, erdResult: any, swaggerResult: any, mongoResult: any): string {
    let markdown = `# Comprehensive Information about '${entityName}'\n\n`;
    markdown += `Query: "${query}"\n\n`;
    
    // List available data sources
    const availableSources = [];
    if (this.availableDataSources.erd) availableSources.push("ERD");
    if (this.availableDataSources.swagger) availableSources.push("Swagger");
    if (this.availableDataSources.mongodb) availableSources.push("MongoDB");
    
    if (availableSources.length < 3) {
      markdown += `> **Note:** Only the following data sources are configured: ${availableSources.join(", ")}.\n\n`;
    }
    
    // Add ERD information
    markdown += "## Database Schema (ERD)\n\n";
    if (!this.availableDataSources.erd) {
      markdown += "ERD data source is not configured. Please set ERD_API_URL in environment variables.\n\n";
    } else if (typeof erdResult === "string") {
      markdown += erdResult + "\n\n";
    } else if (erdResult.error) {
      markdown += `Error retrieving ERD information: ${erdResult.message}\n\n`;
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
    }
    
    // Add Swagger information
    markdown += "## API Documentation (Swagger)\n\n";
    if (!this.availableDataSources.swagger) {
      markdown += "Swagger data source is not configured. Please set SWAGGER_API_URL in environment variables.\n\n";
    } else if (typeof swaggerResult === "string") {
      markdown += swaggerResult + "\n\n";
    } else if (swaggerResult.error) {
      markdown += `Error retrieving Swagger information: ${swaggerResult.message}\n\n`;
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
    }
    
    // Add MongoDB information
    markdown += "## MongoDB Data\n\n";
    if (!this.availableDataSources.mongodb) {
      markdown += "MongoDB data source is not configured. Please set MONGODB_URI or MONGODB_CONNECTION_STRING in environment variables.\n\n";
    } else {
      // Add schema information
      if (mongoResult.schema) {
        markdown += "### Collection Schema\n\n";
        
        if (mongoResult.schema.error) {
          markdown += `Error retrieving MongoDB schema: ${mongoResult.schema.message}\n\n`;
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
      if (mongoResult.samples && mongoResult.samples.data && mongoResult.samples.data.length > 0) {
        markdown += "### Sample Documents\n\n";
        
        mongoResult.samples.data.forEach((doc: any, index: number) => {
          markdown += `#### Document ${index + 1}\n\n`;
          markdown += "```json\n";
          markdown += JSON.stringify(doc, null, 2);
          markdown += "\n```\n\n";
        });
      } else if (mongoResult.message) {
        markdown += mongoResult.message + "\n\n";
      }
    }
    
    return markdown;
  }
}

export default DataExplorerTool; 