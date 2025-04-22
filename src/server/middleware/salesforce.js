import fp from 'fastify-plugin';

export const salesforcePlugin = fp(async function (fastify, opts) {
  console.log('🔌 Registering Salesforce middleware plugin...');
  // Dynamic import of SDK
  const salesforceSdk = await import('@heroku/salesforce-sdk-nodejs');
  // Decorate request with salesforce object only
  fastify.decorateRequest('salesforce', null);

  // Add preHandler hook to all routes
  fastify.addHook('onRoute', (routeOptions) => {
    console.log('📝 Registering preHandler for route:', routeOptions.path);

    const preHandler = async (request, reply) => {
      console.log('🔄 Initializing SDK...');
      const sdk = salesforceSdk.init();
      try {
        console.log('🔄 Parsing request...');
        const parsedRequest = sdk.salesforce.parseRequest(request.headers, request.body, request.log);
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

    if (!routeOptions.preHandler) {
      routeOptions.preHandler = [preHandler];
    } else if (Array.isArray(routeOptions.preHandler)) {
      routeOptions.preHandler.push(preHandler);
    } else {
      routeOptions.preHandler = [routeOptions.preHandler, preHandler];
    }
  });
}, { name: 'salesforce-middleware', fastify: '5.x' });
