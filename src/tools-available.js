/**
 * MCP Server - Tools Available Endpoint
 * 
 * This standalone file provides a comprehensive tool listing endpoint
 * that can be imported and used in the main server.js file.
 */
const asyncHandler = require('express-async-handler');
const yaml = require('js-yaml');

// Export the route handler function
module.exports = function(tools, databaseService) {
  return asyncHandler(async (req, res) => {
    const { 
      format = 'json', 
      category, 
      enabled = 'true',
      search,
      provider,
      limit,
      offset = 0
    } = req.query;
    
    try {
      // Parse query parameters
      const options = {
        category: category || undefined,
        enabledOnly: enabled === 'true'
      };
      
      // Get tools from database or fall back to in-memory
      let allTools = await databaseService.getAllTools(options);
      
      // Apply additional filters that aren't supported by the database layer
      
      // Filter by search term
      if (search) {
        const searchTerm = search.toLowerCase();
        allTools = allTools.filter(tool => 
          tool.name.toLowerCase().includes(searchTerm) || 
          tool.description.toLowerCase().includes(searchTerm) ||
          (tool.tags && tool.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
      }
      
      // Filter by provider
      if (provider) {
        allTools = allTools.filter(tool => {
          // Check in provider field if exists
          if (tool.provider && typeof tool.provider === 'string') {
            return tool.provider.toLowerCase() === provider.toLowerCase();
          }
          // Check in metadata if exists
          if (tool.metadata && tool.metadata.provider) {
            return tool.metadata.provider.toLowerCase() === provider.toLowerCase();
          }
          return false;
        });
      }
      
      // Apply pagination if limit is provided
      let paginatedTools = allTools;
      if (limit) {
        const limitNum = parseInt(limit, 10);
        const offsetNum = parseInt(offset, 10);
        paginatedTools = allTools.slice(offsetNum, offsetNum + limitNum);
      }
      
      // Collect metadata
      const categories = [...new Set(allTools.map(tool => tool.category || 'other'))];
      
      // Collect providers from tools 
      const providers = [...new Set(allTools.map(tool => {
        if (tool.provider && typeof tool.provider === 'string') {
          return tool.provider;
        }
        if (tool.metadata && tool.metadata.provider) {
          return tool.metadata.provider;
        }
        return 'internal';
      }).filter(Boolean))];
      
      // Format tools for response
      const formattedTools = paginatedTools.map(tool => {
        // Get parameters as parameter name -> details map
        const parameters = {};
        
        if (tool.parameters && tool.parameters.properties) {
          Object.entries(tool.parameters.properties).forEach(([paramName, paramDetails]) => {
            parameters[paramName] = {
              type: paramDetails.type,
              description: paramDetails.description,
              required: tool.parameters.required && tool.parameters.required.includes(paramName),
              default: paramDetails.default
            };
          });
        }
        
        // Determine endpoint based on name pattern
        let endpoint = null;
        let method = "POST";
        
        if (tool.name.startsWith('web_')) {
          endpoint = `/tools/web/${tool.name.replace('web_', '')}`;
        } else if (tool.name.startsWith('generate_')) {
          endpoint = `/tools/image/generate`;
        } else if (tool.name.startsWith('edit_')) {
          endpoint = `/tools/image/edit`;
        } else if (tool.name.startsWith('create_image_')) {
          endpoint = `/tools/image/variation`;
        }
        
        return {
          name: tool.name,
          description: tool.description,
          category: tool.category || 'other',
          version: tool.version || '1.0.0',
          provider: tool.provider || (tool.metadata && tool.metadata.provider) || 'internal',
          enabled: tool.enabled !== false, // Default to true if not specified
          parameters: parameters,
          usage: endpoint ? {
            endpoint,
            method,
            parameters
          } : undefined,
          metadata: {
            createdAt: tool.metadata && tool.metadata.createdAt,
            updatedAt: tool.metadata && tool.metadata.updatedAt,
            usageCount: tool.metadata && tool.metadata.usageCount
          }
        };
      });
      
      // Prepare response
      const response = {
        success: true,
        count: formattedTools.length,
        metadata: {
          categories,
          providers,
          totalCount: allTools.length,
          offset: parseInt(offset, 10),
          limit: limit ? parseInt(limit, 10) : allTools.length
        },
        tools: formattedTools
      };
      
      // Return based on requested format
      if (format === 'yaml') {
        res.header('Content-Type', 'text/yaml');
        return res.send(yaml.dump(response));
      } else if (format === 'table') {
        // Simple ASCII table
        let table = '| Name | Description | Category | Version |\n';
        table += '|------|-------------|----------|--------|\n';
        
        formattedTools.forEach(tool => {
          table += `| ${tool.name} | ${tool.description} | ${tool.category} | ${tool.version} |\n`;
        });
        
        res.header('Content-Type', 'text/plain');
        return res.send(table);
      } else if (format === 'html') {
        let html = '<html><head><title>Available MCP Tools</title>';
        html += '<style>body{font-family:sans-serif;max-width:1000px;margin:0 auto;padding:20px}' +
                'h1{color:#333}table{width:100%;border-collapse:collapse;margin:20px 0}' +
                'th{background:#f4f4f4;padding:8px;text-align:left;border:1px solid #ddd}' +
                'td{padding:8px;border:1px solid #ddd}tr:nth-child(even){background:#f9f9f9}' +
                '.tool-name{font-weight:bold;color:#0066cc}</style>';
        html += '</head><body>';
        html += '<h1>Available MCP Tools</h1>';
        html += `<p>Total tools: ${allTools.length}</p>`;
        
        // Add table
        html += '<table>';
        html += '<tr><th>Name</th><th>Description</th><th>Category</th><th>Version</th><th>Provider</th></tr>';
        
        formattedTools.forEach(tool => {
          html += '<tr>';
          html += `<td class="tool-name">${tool.name}</td>`;
          html += `<td>${tool.description}</td>`;
          html += `<td>${tool.category}</td>`;
          html += `<td>${tool.version}</td>`;
          html += `<td>${tool.provider}</td>`;
          html += '</tr>';
        });
        
        html += '</table>';
        html += '</body></html>';
        
        res.header('Content-Type', 'text/html');
        return res.send(html);
      } else {
        // Default JSON response
        return res.json(response);
      }
    } catch (error) {
      console.error('Error fetching available tools:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
};