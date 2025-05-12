import { MCPTool } from "mcp-framework";
import { MongoClient, ObjectId } from "mongodb";
import { z } from "zod";

interface MongoDBToolInput {
  action: "listCollections" | "describeCollection" | "sampleData" | "query";
  collection?: string;
  query?: string;
  options?: {
    format?: string;
    limit?: number;
  };
}

// Interfaces for MongoDB response data
interface MongoCollection {
  name: string;
  count: number;
  size: number;
}

interface MongoField {
  name: string;
  type: string;
  count: number;
}

class MongoDBTool extends MCPTool<MongoDBToolInput> {
  name = "mongodb_explorer";
  description = "Explore MongoDB database information including collections, schemas, and sample data.";
  private mongoClient: MongoClient | null = null;

  schema = {
    action: {
      type: z.enum(["listCollections", "describeCollection", "sampleData", "query"]),
      description: "Action to perform: list collections, describe collection schema, view sample data, or run a query",
    },
    collection: {
      type: z.string().optional(),
      description: "MongoDB collection name to operate on"
    },
    query: {
      type: z.string().optional(),
      description: "MongoDB query in JSON format. Required when action is 'query'."
    },
    options: {
      type: z.object({
        format: z.enum(["json", "markdown"]).optional().default("json"),
        limit: z.number().optional().default(10),
      }).optional(),
      description: "Response format and result limit options",
    },
  };

  private async getClient(): Promise<MongoClient> {
    if (!this.mongoClient) {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_CONNECTION_STRING;
      
      if (!mongoUri) {
        throw new Error("MongoDB connection string not found in environment variables. Please set MONGODB_URI or MONGODB_CONNECTION_STRING");
      }
      
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
    }
    return this.mongoClient;
  }

  async execute(input: MongoDBToolInput) {
    try {
      const format = input.options?.format || "json";
      const limit = input.options?.limit || 10;
      
      let result;

      try {
        const client = await this.getClient();
        
        switch (input.action) {
          case "listCollections":
            result = await this.listCollections(client);
            break;
          case "describeCollection":
            if (!input.collection) {
              return {
                error: true,
                message: "Collection name is required."
              };
            }
            result = await this.describeCollection(client, input.collection);
            break;
          case "sampleData":
            if (!input.collection) {
              return {
                error: true,
                message: "Collection name is required."
              };
            }
            result = await this.getSampleData(client, input.collection, limit);
            break;
          case "query":
            if (!input.collection) {
              return {
                error: true,
                message: "Collection name is required."
              };
            }
            if (!input.query) {
              return {
                error: true,
                message: "Query is required."
              };
            }
            
            let query;
            try {
              query = JSON.parse(input.query);
            } catch (e) {
              return {
                error: true,
                message: `Invalid query format: ${e}`
              };
            }
            
            result = await this.runQuery(client, input.collection, query, limit);
            break;
          default:
            return {
              error: true,
              message: "Unknown action"
            };
        }
      } catch (err) {
        return {
          error: true,
          message: `MongoDB operation failed: ${err}`
        };
      }
      
      if (format === "markdown") {
        return this.convertToMarkdown(result, input.action, input.collection);
      }
      
      return result;
    } catch (error) {
      return {
        error: true,
        message: `Failed to retrieve MongoDB information: ${error}`,
      };
    }
  }

  // Real MongoDB operations
  private async listCollections(client: MongoClient): Promise<any> {
    const db = client.db();
    const collections = await db.listCollections().toArray();
    
    // Get additional information about each collection
    const collectionsWithInfo = await Promise.all(
      collections.map(async (collection) => {
        const name = collection.name;
        const count = await db.collection(name).countDocuments();
        const stats = await db.command({ collStats: name });
        
        return {
          name,
          count,
          size: stats.size
        };
      })
    );
    
    return { collections: collectionsWithInfo };
  }

  private async describeCollection(client: MongoClient, collectionName: string): Promise<any> {
    const db = client.db();
    const collection = db.collection(collectionName);
    
    // Sample documents to infer schema
    const sampleDocs = await collection.find().limit(100).toArray();
    
    if (sampleDocs.length === 0) {
      return {
        name: collectionName,
        fields: []
      };
    }
    
    // Extract field information
    const fields: Record<string, { type: string, count: number }> = {};
    const docCount = await collection.countDocuments();
    
    const extractFields = (obj: any, prefix = "") => {
      for (const [key, value] of Object.entries(obj)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        
        if (value === null) {
          fields[fieldName] = fields[fieldName] || { type: "null", count: 0 };
          fields[fieldName].count++;
          continue;
        }
        
        if (value instanceof ObjectId) {
          fields[fieldName] = fields[fieldName] || { type: "ObjectId", count: 0 };
          fields[fieldName].count++;
          continue;
        }
        
        const type = Array.isArray(value) ? "array" : typeof value;
        
        fields[fieldName] = fields[fieldName] || { type, count: 0 };
        fields[fieldName].count++;
        
        if (type === "object" && !Array.isArray(value)) {
          extractFields(value, fieldName);
        }
      }
    };
    
    sampleDocs.forEach(doc => extractFields(doc));
    
    // Convert to array for response
    const fieldArray = Object.entries(fields).map(([name, info]) => ({
      name,
      type: info.type,
      count: info.count
    }));
    
    return {
      name: collectionName,
      fields: fieldArray
    };
  }

  private async getSampleData(client: MongoClient, collectionName: string, limit: number): Promise<any> {
    const db = client.db();
    const collection = db.collection(collectionName);
    
    // Get random sample of documents
    const data = await collection.aggregate([{ $sample: { size: limit } }]).toArray();
    
    return { data };
  }

  private async runQuery(client: MongoClient, collectionName: string, query: any, limit: number): Promise<any> {
    const db = client.db();
    const collection = db.collection(collectionName);
    
    const total = await collection.countDocuments(query);
    const data = await collection.find(query).limit(limit).toArray();
    
    return {
      data,
      count: data.length,
      total,
      query
    };
  }

  private convertToMarkdown(data: any, action: string, collection?: string): string {
    try {
      let markdown = "# MongoDB Explorer Results\n\n";
      
      switch (action) {
        case "listCollections":
          markdown += "## Collections\n\n";
          markdown += "| Collection Name | Document Count | Size (bytes) |\n";
          markdown += "|-----------------|---------------|---------------|\n";
          
          if (data.collections && Array.isArray(data.collections)) {
            data.collections.forEach((col: MongoCollection) => {
              markdown += `| ${col.name} | ${col.count} | ${col.size} |\n`;
            });
          }
          break;
          
        case "describeCollection":
          markdown += `## Collection Schema: ${collection}\n\n`;
          markdown += "| Field Name | Type | Document Count |\n";
          markdown += "|------------|------|----------------|\n";
          
          if (data.fields && Array.isArray(data.fields)) {
            data.fields.forEach((field: MongoField) => {
              markdown += `| ${field.name} | ${field.type} | ${field.count} |\n`;
            });
          }
          break;
          
        case "sampleData":
          markdown += `## Sample Data: ${collection}\n\n`;
          
          if (data.data && Array.isArray(data.data)) {
            data.data.forEach((doc: Record<string, any>, index: number) => {
              markdown += `### Document ${index + 1}\n\n`;
              markdown += "```json\n";
              markdown += JSON.stringify(doc, null, 2);
              markdown += "\n```\n\n";
            });
          }
          break;
          
        case "query":
          markdown += `## Query Results: ${collection}\n\n`;
          markdown += `Executed query: \`${JSON.stringify(data.query)}\`\n\n`;
          markdown += `Total results: ${data.total}\n\n`;
          
          if (data.data && Array.isArray(data.data)) {
            markdown += "### Results\n\n";
            markdown += "```json\n";
            markdown += JSON.stringify(data.data, null, 2);
            markdown += "\n```\n\n";
          }
          break;
      }
      
      return markdown;
    } catch (error) {
      return `Failed to convert MongoDB data to markdown: ${error}. Please use JSON format instead.`;
    }
  }
}

export default MongoDBTool; 