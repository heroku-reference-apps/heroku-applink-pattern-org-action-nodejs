import { config } from '../config/index.js';

// Region-based discount mapping (for demo purposes)
const discounts = {
  US: 0.10, // 10% discount
  EU: 0.15, // 15% discount
  APAC: 0.12 // 12% discount
};

/**
 * Get the discount rate for a given region
 * @param {string} region - The region code (US, EU, APAC)
 * @returns {number} The discount rate as a decimal
 */
function getDiscountForRegion (region) {
  return discounts[region] || 0.0;
}

/**
 * Generate a quote for a given opportunity
 * @param {Object} request - The quote generation request
 * @param {string} request.opportunityId - The opportunity ID
 * @param {import('@heroku/salesforce-sdk-nodejs').AppLinkClient} client - The Salesforce client
 * @returns {Promise<Object>} The generated quote response
 */
export async function generateQuote (request, client) {
  try {
    // Query opportunity line items
    const fields = ['Id', 'Product2Id', 'Quantity', 'UnitPrice', 'PricebookEntryId'];
    if (config.features.enableDiscountOverrides) {
      fields.push('DiscountOverride__c');
    }

    const { context } = client;
    const org = context.org;
    const soql = `SELECT ${fields.join(', ')} FROM OpportunityLineItem WHERE OpportunityId = '${request.opportunityId}'`;
    const queryResult = await org.dataApi.query(soql);

    if (!queryResult.records.length) {
      const error = new Error(`No OpportunityLineItems found for Opportunity ID: ${request.opportunityId}`);
      error.statusCode = 404;
      throw error;
    }

    // Default discount rate based on region
    const discountRate = getDiscountForRegion('US'); // Hardcoded region logic for demo

    // Create Quote using Unit of Work
    const unitOfWork = org.dataApi.newUnitOfWork();

    // Register Quote creation
    const quoteRef = unitOfWork.registerCreate({
      type: 'Quote',
      fields: {
        Name: 'New Quote',
        OpportunityId: request.opportunityId
      }
    });

    // Register QuoteLineItems
    queryResult.records.forEach(record => {
      const quantity = parseFloat(record.fields.Quantity);
      const unitPrice = parseFloat(record.fields.UnitPrice);

      // Use DiscountOverride__c if available and enabled
      let effectiveDiscountRate = discountRate;
      if (config.enableDiscountOverrides && record.fields.DiscountOverride__c) {
        effectiveDiscountRate = parseFloat(record.fields.DiscountOverride__c) / 100.0;
      }

      // Calculate discount price
      const discountedPrice = (quantity * unitPrice) * (1 - effectiveDiscountRate);

      unitOfWork.registerCreate({
        type: 'QuoteLineItem',
        fields: {
          QuoteId: quoteRef.toApiString(),
          PricebookEntryId: record.fields.PricebookEntryId,
          Quantity: quantity,
          UnitPrice: discountedPrice / quantity // Apply discount per unit price
        }
      });
    });

    // Commit all operations in one transaction
    try {
      const results = await org.dataApi.commitUnitOfWork(unitOfWork);
      // Get the Quote result using the reference
      const quoteResult = results.get(quoteRef);
      if (!quoteResult) {
        throw new Error('Quote creation result not found in response');
      }
      return { quoteId: quoteResult.id };
    } catch (commitError) {
      // Salesforce API errors will be formatted as "ERROR_CODE: Error message"
      const error = new Error(`Failed to create quote: ${commitError.message}`);
      error.statusCode = 400; // Bad Request for validation/data errors
      throw error;
    }
  } catch (error) {
    if (error.statusCode) {
      throw error; // Preserve custom errors with status codes
    }

    console.error('Unexpected error generating quote:', error);
    const wrappedError = new Error(`An unexpected error occurred: ${error.message}`);
    wrappedError.statusCode = 500;
    throw wrappedError;
  }
}
