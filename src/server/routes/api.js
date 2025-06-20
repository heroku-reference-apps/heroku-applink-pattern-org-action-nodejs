import { generateQuote } from '../services/pricingEngine.js';

// Request/Response schemas matching the OpenAPI spec
const quoteGenerationSchema = {
  tags: ['Pricing Engine'],
  summary: 'Generate a Quote for a given Opportunity',
  description: 'Calculate pricing and generate an associated Quote.',
  operationId: 'generateQuote',
  'x-sfdc': {
    heroku: {
      authorization: {
        connectedApp: 'GenerateQuoteConnectedApp',
        permissionSet: 'GenerateQuotePermissions'
      }
    }
  },  
  body: {
    $ref: 'QuoteGenerationRequest#'
  },
  response: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            $ref: 'QuoteGenerationResponse#'
          }
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: { type: 'boolean' },
              message: {
                type: 'string',
                description: 'Error message when client context is missing or invalid'
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Internal Server Error',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: { type: 'boolean' },
              message: {
                type: 'string',
                description: 'Error message when an unexpected error occurs'
              }
            }
          }
        }
      }
    }
  }
};

const apiRoutes = async (fastify) => {
  // Register schema components
  fastify.addSchema({
    $id: 'QuoteGenerationRequest',
    type: 'object',
    required: ['opportunityId'],
    description: 'Request to generate a quote, includes the opportunity ID to extract product information',
    properties: {
      opportunityId: {
        type: 'string',
        description: 'A record Id for the opportunity'
      }
    }
  });

  fastify.addSchema({
    $id: 'QuoteGenerationResponse',
    type: 'object',
    description: 'Response includes the record Id of the generated quote.',
    properties: {
      quoteId: {
        type: 'string',
        description: 'A record Id for the generated quote'
      }
    }
  });

  fastify.post('/generatequote', {
    schema: quoteGenerationSchema,
    handler: async (request, reply) => {
      const { opportunityId } = request.body;

      try {
        if (!request.salesforce) {
          const error = new Error('Salesforce client not initialized');
          reply.code(401).send({
            error: true,
            message: error.message
          });
          return;
        }

        // Delegate to pricing engine service
        const result = await generateQuote({ opportunityId }, request.salesforce);
        return result;
      } catch (error) {
        reply.code(error.statusCode || 500).send({
          error: true,
          message: error.message
        });
      }
    }
  });
};

export default apiRoutes;
