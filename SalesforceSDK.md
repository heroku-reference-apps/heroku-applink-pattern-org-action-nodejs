# Heroku Salesforce SDK Documentation

## Overview

The Heroku Salesforce SDK (`@heroku/salesforce-sdk-nodejs` version 0.3.4-ea) enables secure communication between Heroku applications and Salesforce orgs . This SDK is specifically designed for use with the Heroku AppLink, providing a seamless way to perform Salesforce operations from Heroku apps without storing Salesforce credentials.

## Installation

```bash
pnpm add @heroku/salesforce-sdk-nodejs
```

## Core Concepts

### Client Context

The SDK uses a client context mechanism for secure authentication:

- Passed from Salesforce to Heroku via the `x-client-context` header
- Contains authentication tokens and org information
- Automatically managed by the SDK
- Temporary and request-specific

Example client context structure:
```javascript
{
  "requestId": "org-alias-timestamp",
  "accessToken": "access-token",
  "apiVersion": "59.0",
  "namespace": "",
  "orgId": "org-id",
  "orgDomainUrl": "instance-url",
  "userContext": {
    "userId": "user-id",
    "username": "username"
  }
}
```

### Request Parsing

The SDK provides a `parseRequest` method to handle incoming requests from Salesforce:

```javascript
const parsedRequest = sdk.salesforce.parseRequest(
  headers,    // Request headers containing x-client-context
  body,       // Request body (optional)
  logger      // Logger instance (optional)
);
```

Key features of `parseRequest`:

1. **Header Processing**
   - Extracts and validates the `x-client-context` header
   - Decodes and verifies the client context
   - Handles authentication token validation

2. **Request Body Handling**
   - Processes incoming request payload
   - Validates request structure
   - Handles both JSON and raw body formats

3. **Logging Integration**
   - Supports custom logging implementations
   - Provides debug information during parsing
   - Helps with request troubleshooting

Example usage with error handling:

```javascript
try {
  const parsedRequest = sdk.salesforce.parseRequest(
    request.headers,
    request.body,
    request.log
  );
  
  // Access parsed information
  const { event, context, logger } = parsedRequest;
  const org = context.org;
  
  // Use the parsed request
  const result = await org.dataApi.query('SELECT Id FROM Account');
} catch (error) {
  if (error.name === 'InvalidHeaderError') {
    // Handle missing or invalid x-client-context header
    throw new Error('Invalid request headers');
  } else if (error.name === 'InvalidBodyError') {
    // Handle invalid request body
    throw new Error('Invalid request format');
  }
}
```

Integration with middleware:

```javascript
const preHandler = async (request, reply) => {
  try {
    // Initialize SDK
    const sdk = AppLinkClient.init();
    
    // Parse the request
    const parsedRequest = sdk.salesforce.parseRequest(
      request.headers,
      request.body,
      request.log
    );
    
    // Attach parsed request to the SDK instance
    request.salesforce = Object.assign(sdk, parsedRequest);
  } catch (error) {
    // Handle parsing errors
    const wrappedError = new Error('Failed to parse Salesforce request');
    wrappedError.statusCode = 401;
    throw wrappedError;
  }
};
```

Common parsing errors:

1. `InvalidHeaderError`: Missing or malformed `x-client-context` header
2. `InvalidBodyError`: Request body doesn't match expected format
3. `InvalidContextError`: Client context validation failed
4. `AuthenticationError`: Invalid or expired authentication token

Best practices:

1. **Error Handling**
   - Always wrap parseRequest in try/catch
   - Handle specific error types appropriately
   - Provide meaningful error messages

2. **Logging**
   - Pass a logger instance for debugging
   - Log parsing errors for troubleshooting
   - Don't log sensitive information

3. **Security**
   - Validate all parsed data before use
   - Don't store parsed request information
   - Handle authentication errors securely

### AppLink Client

The main interface for interacting with Salesforce:

```javascript
import { AppLinkClient } from '@heroku/salesforce-sdk-nodejs';

// Initialize from request headers
const client = AppLinkClient.init();
```

### Data API

The Data API provides methods for CRUD operations:

```javascript
const org = client.context.org;

// Query records
const result = await org.dataApi.query('SELECT Id, Name FROM Account');

// Create record
const createResult = await org.dataApi.create({
  type: 'Account',
  fields: { Name: 'Test Account' }
});

// Update record
const updateResult = await org.dataApi.update({
  type: 'Account',
  fields: { 
    Id: '001xxx...',
    Name: 'Updated Account' 
  }
});

// Delete record
const deleteResult = await org.dataApi.delete('Account', '001xxx...');
```

### Unit of Work Pattern

For handling multiple related operations in a single transaction:

```javascript
const unitOfWork = org.dataApi.newUnitOfWork();

// Register operations
const accountRef = unitOfWork.registerCreate({
  type: 'Account',
  fields: { Name: 'New Account' }
});

const contactRef = unitOfWork.registerCreate({
  type: 'Contact',
  fields: {
    AccountId: accountRef.toApiString(),
    LastName: 'Test Contact'
  }
});

// Commit all operations atomically
const results = await org.dataApi.commitUnitOfWork(unitOfWork);
```

### Unit of Work Response Handling

The `commitUnitOfWork` method returns a `Map` containing results for each registered operation:

```javascript
try {
  const results = await org.dataApi.commitUnitOfWork(unitOfWork);
  
  // Get result for a specific reference
  const accountResult = results.get(accountRef);
  if (accountResult) {
    console.log('Created Account ID:', accountResult.id);
    console.log('Success:', accountResult.success);
  }
  
  // Check all results
  for (const [ref, result] of results.entries()) {
    if (result.success) {
      console.log(`Operation succeeded for ${ref.type}:`, result.id);
    } else {
      console.log(`Operation failed for ${ref.type}:`, result.errors);
    }
  }
} catch (error) {
  // Handle transaction failure
  console.error('Transaction failed:', error);
}
```

### Unit of Work Error Handling

1. **Transaction Failures**
   ```javascript
   try {
     const results = await org.dataApi.commitUnitOfWork(unitOfWork);
   } catch (error) {
     if (error.name === 'SalesforceError') {
       // Handle Salesforce API errors
       console.error('Transaction failed:', error.message);
       // Check if it's a limit error
       if (error.message.includes('LIMIT_EXCEEDED')) {
         throw new Error('Salesforce governor limits exceeded');
       }
     } else {
       // Handle unexpected errors
       console.error('Unexpected error:', error);
     }
   }
   ```

2. **Partial Success Handling**
   ```javascript
   const results = await org.dataApi.commitUnitOfWork(unitOfWork);
   
   // Track success/failure
   const succeeded = [];
   const failed = [];
   
   for (const [ref, result] of results.entries()) {
     if (result.success) {
       succeeded.push({
         type: ref.type,
         id: result.id
       });
     } else {
       failed.push({
         type: ref.type,
         errors: result.errors
       });
     }
   }
   
   // Handle partial success scenario
   if (failed.length > 0) {
     console.error('Some operations failed:', failed);
     // Optionally rollback or compensate
     await handlePartialFailure(succeeded, failed);
   }
   ```

3. **Reference Dependencies**
   ```javascript
   // Check if parent operation succeeded before processing children
   const quoteResult = results.get(quoteRef);
   if (!quoteResult?.success) {
     throw new Error('Failed to create parent Quote');
   }
   
   // Process child results only if parent succeeded
   const lineItemResults = [];
   for (const [ref, result] of results.entries()) {
     if (ref.type === 'QuoteLineItem') {
       if (result.success) {
         lineItemResults.push(result.id);
       } else {
         console.error('Failed to create line item:', result.errors);
       }
     }
   }
   ```

### Common Unit of Work Errors

1. **Validation Errors**
   ```javascript
   try {
     const results = await org.dataApi.commitUnitOfWork(unitOfWork);
   } catch (error) {
     if (error.name === 'ValidationError') {
       // Handle field-level validation errors
       error.details.forEach(detail => {
         console.error(`Field ${detail.field}: ${detail.message}`);
       });
     }
   }
   ```

2. **Limit Errors**
   ```javascript
   // Check number of operations before commit
   const operationCount = unitOfWork.getOperationCount();
   if (operationCount > 10000) { // Salesforce DML limit
     throw new Error('Too many operations in single transaction');
   }
   
   try {
     const results = await org.dataApi.commitUnitOfWork(unitOfWork);
   } catch (error) {
     if (error.message.includes('LIMIT_EXCEEDED')) {
       // Handle limit errors
       console.error('Transaction exceeds Salesforce limits');
     }
   }
   ```

### Best Practices

1. **Pre-commit Validation**
   ```javascript
   // Validate before commit
   function validateUnitOfWork(unitOfWork) {
     const operations = unitOfWork.getOperations();
     
     // Check required fields
     for (const op of operations) {
       if (op.type === 'Contact' && !op.fields.LastName) {
         throw new Error('LastName is required for Contact');
       }
     }
     
     // Check operation count
     if (operations.length > 10000) {
       throw new Error('Too many operations');
     }
   }
   
   // Use in transaction
   try {
     validateUnitOfWork(unitOfWork);
     const results = await org.dataApi.commitUnitOfWork(unitOfWork);
   } catch (error) {
     handleError(error);
   }
   ```

2. **Rollback Handling**
   ```javascript
   async function handleRollback(results, unitOfWork) {
     const successfulIds = [];
     for (const [ref, result] of results.entries()) {
       if (result.success) {
         successfulIds.push({
           type: ref.type,
           id: result.id
         });
       }
     }
     
     // Create rollback unit of work
     const rollbackUow = org.dataApi.newUnitOfWork();
     for (const record of successfulIds) {
       rollbackUow.registerDelete(record.type, record.id);
     }
     
     try {
       await org.dataApi.commitUnitOfWork(rollbackUow);
       console.log('Rollback successful');
     } catch (rollbackError) {
       console.error('Rollback failed:', rollbackError);
       // Manual intervention may be needed
     }
   }
   ```

3. **Chunking Large Operations**
   ```javascript
   async function commitLargeDataSet(records, chunkSize = 9500) {
     const results = [];
     
     // Split into chunks
     for (let i = 0; i < records.length; i += chunkSize) {
       const chunk = records.slice(i, i + chunkSize);
       const uow = org.dataApi.newUnitOfWork();
       
       // Register operations for chunk
       for (const record of chunk) {
         uow.registerCreate(record);
       }
       
       try {
         const chunkResults = await org.dataApi.commitUnitOfWork(uow);
         results.push(...Array.from(chunkResults.values()));
       } catch (error) {
         console.error(`Chunk ${i / chunkSize + 1} failed:`, error);
         // Handle chunk failure
       }
     }
     
     return results;
   }
   ```

## Integration with Web Frameworks

### Fastify Integration

Example middleware setup with complete error handling and logging:

```javascript
import fp from 'fastify-plugin';
import { AppLinkClient } from '@heroku/salesforce-sdk-nodejs';

export const salesforcePlugin = fp(async function (fastify, opts) {
  console.log('🔌 Registering Salesforce middleware plugin...');
  
  // Decorate request with salesforce object
  fastify.decorateRequest('salesforce', null);
  
  // Add preHandler hook
  fastify.addHook('onRoute', (routeOptions) => {
    console.log('📝 Registering preHandler for route:', routeOptions.path);
    
    const preHandler = async (request, reply) => {
      console.log('🔄 Initializing SDK...');
      const sdk = AppLinkClient.init();
      try {
        console.log('🔄 Parsing request...');
        const parsedRequest = sdk.salesforce.parseRequest(
          request.headers, 
          request.body,
          request.log
        );
        console.log('✅ Request parsed successfully');
        request.salesforce = Object.assign(sdk, parsedRequest);        
        console.log('✨ Salesforce client initialized successfully');
      } catch (error) {
        console.error('❌ Failed to parse request:', error.message);
        const wrappedError = new Error('Failed to initialize Salesforce client');
        wrappedError.statusCode = 401;
        throw wrappedError;
      }
    };
    
    // Add to route handlers
    if (!routeOptions.preHandler) {
      routeOptions.preHandler = [preHandler];
    } else if (Array.isArray(routeOptions.preHandler)) {
      routeOptions.preHandler.push(preHandler);
    } else {
      routeOptions.preHandler = [routeOptions.preHandler, preHandler];
    }
  });
});
```

### Route Handler Example

```javascript
fastify.post('/api/generatequote', {
  schema: {
    body: {
      type: 'object',
      required: ['opportunityId'],
      properties: {
        opportunityId: {
          type: 'string',
          description: 'A record Id for the opportunity'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          quoteId: {
            type: 'string',
            description: 'A record Id for the generated quote'
          }
        }
      }
    }
  },
  handler: async (request, reply) => {
    try {
      if (!request.salesforce) {
        reply.code(500).send({
          error: true,
          message: 'Salesforce client not initialized'
        });
        return;
      }

      const result = await generateQuote(request.body, request.salesforce);
      return result;
    } catch (error) {
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: true,
        message: error.message
      });
    }
  }
});
```

## Security Best Practices

1. **Client Context Management**
   - Never store client context between requests
   - Always obtain fresh context from request headers
   - Handle context expiration appropriately
   - Validate context before use

2. **Error Handling**
   - Implement proper error handling for SDK operations
   - Handle specific error types appropriately
   - Log errors securely without exposing sensitive information
   - Use custom error classes with status codes

3. **Permission Management**
   - Use permission sets for elevated access when needed
   - Follow principle of least privilege
   - Handle permission-related errors gracefully
   - Implement session-based permission elevation

Example permission elevation:
```javascript
// Activate session-based permission set
const activationResult = await sf.org.assign.permset({
  name: 'GenerateQuoteAuthorization',
  onBehalfOf: orgAlias
});

// Use elevated permissions
try {
  // Your code here
} finally {
  // Deactivate permission set
  await sf.org.permset.deactivate({
    id: activationResult.activationId,
    org: orgAlias
  });
}
```

## Error Handling

```javascript
try {
  const result = await client.query('SELECT Id FROM Account');
} catch (error) {
  if (error.name === 'InvalidClientContextError') {
    // Handle invalid or expired context
    console.error('Invalid client context:', error.message);
    throw new Error('Authentication failed');
  } else if (error.name === 'SalesforceError') {
    // Handle Salesforce API errors
    console.error('Salesforce API error:', error.message);
    throw new Error('Failed to access Salesforce');
  } else {
    // Handle unexpected errors
    console.error('Unexpected error:', error);
    throw new Error('Internal server error');
  }
}
```

## Performance Optimization

1. **Query Optimization**
   - Select only necessary fields
   - Use appropriate WHERE clauses
   - Consider SOQL query limits
   - Use LIMIT when appropriate

Example optimized query:
```javascript
const fields = ['Id', 'Product2Id', 'Quantity', 'UnitPrice', 'PricebookEntryId'];
if (config.enableDiscountOverrides) {
  fields.push('DiscountOverride__c');
}

const soql = `SELECT ${fields.join(', ')} 
              FROM OpportunityLineItem 
              WHERE OpportunityId = '${opportunityId}'`;
```

2. **Batch Operations**
   - Use Unit of Work for related records
   - Batch similar operations together
   - Handle partial success/failure scenarios
   - Implement proper error handling for batch operations

3. **Connection Management**
   - Reuse client instance within request scope
   - Don't store clients between requests
   - Handle connection timeouts
   - Implement proper connection pooling

## Environment Configuration

The SDK does not require any Salesforce-specific environment variables since all authentication and connection information is provided through the client context header from Salesforce.

Basic server configuration (optional):

```bash
# Server Configuration
PORT=8080          # Default port for the application
NODE_ENV=development   # Environment mode
```

Feature flags (if used in your application):

```bash
# Feature Flags (example)
ENABLE_DISCOUNT_OVERRIDES=false
```

Note: The SDK automatically handles:
- Authentication tokens
- API versions
- Org domains
- User context

You do not need to configure:
- `SF_ACCESS_TOKEN`
- `SF_API_VERSION`
- `SF_DOMAIN_URL`
- Any other Salesforce credentials

All necessary Salesforce connection information is securely passed through the `x-client-context` header with each request.

## Testing and Development

1. **Local Development**
   - Use `invoke.sh` script for local testing
   - Simulate Salesforce headers
   - Test with different permission scenarios
   - Use environment-specific configuration

Example `invoke.sh` usage:
```bash
# Basic invocation
./bin/invoke.sh my-org '{"opportunityId": "006xxx..."}'

# With elevated permissions
./bin/invoke.sh my-org '{"opportunityId": "006xxx..."}' GenerateQuoteAuthorization
```

2. **Error Simulation**
   - Test invalid client contexts
   - Simulate permission issues
   - Test network failures
   - Validate error handling paths

## Deployment Considerations

1. **Heroku Configuration**
   - Install required buildpacks:
     ```bash
     heroku buildpacks:add https://github.com/heroku/heroku-buildpack-heroku-integration-service-mesh
     ```
   - Configure environment variables
   - Set appropriate dyno types
   - Enable Heroku Integration add-on:
     ```bash
     heroku addons:create heroku-integration
     ```

2. **Salesforce Setup**
   - Configure Connected App settings
   - Set up permission sets
   - Configure API access
   - Import API specifications:
     ```bash
     heroku salesforce:import api-docs.yaml --org-name my-org
     ```

## API Reference

### Client Initialization
```javascript
AppLinkClient.init()
```

### Data API Methods
```javascript
// Query
org.dataApi.query(soql: string)

// Create
org.dataApi.create(record: {
  type: string,
  fields: Record<string, any>
})

// Update
org.dataApi.update(record: {
  type: string,
  fields: Record<string, any>
})

// Delete
org.dataApi.delete(type: string, id: string)

// Unit of Work
org.dataApi.newUnitOfWork()
org.dataApi.commitUnitOfWork(unitOfWork)
```

### Error Types
- `InvalidClientContextError`: Invalid or expired context
- `SalesforceError`: General Salesforce API errors
- `NetworkError`: Connection issues
- `ValidationError`: Invalid operation parameters

## Version Compatibility

- Node.js: >=20.x
- Salesforce API: v59.0+
- Heroku Integration Pilot required
- SDK Version: 0.3.4-ea (Early Access)

## Additional Resources

- [Heroku Integration Pattern Documentation](https://devcenter.heroku.com/categories/heroku-integration)
- [Salesforce API Documentation](https://developer.salesforce.com/docs/apis)
- [Heroku Integration Pilot Guide](https://devcenter.heroku.com/articles/heroku-integration-pilot)
- [Sample Application Repository](https://github.com/heroku-examples/heroku-integration-pattern-org-action-nodejs) 