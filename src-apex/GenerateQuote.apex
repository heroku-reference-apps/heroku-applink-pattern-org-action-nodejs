HerokuAppLink.GenerateQuote service = new HerokuAppLink.GenerateQuote();
HerokuAppLink.GenerateQuote.generateQuote_Request request = new HerokuAppLink.GenerateQuote.generateQuote_Request();
HerokuAppLink.GenerateQuote_QuoteGenerationRequest body = new HerokuAppLink.GenerateQuote_QuoteGenerationRequest();
body.opportunityId = '006am000006pS6P';
request.body = body;
System.debug('Quote Id: ' + service.generateQuote(request).Code200.quoteId);