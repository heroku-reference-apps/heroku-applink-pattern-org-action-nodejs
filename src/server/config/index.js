import 'dotenv/config';

export const config = {
  // Server configuration
  port: process.env.APP_PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Feature flags
  features: {
    enableDiscountOverrides: process.env.ENABLE_DISCOUNT_OVERRIDES === 'True'
  }
};
