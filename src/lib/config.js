/**
 * Centralized configuration for the local BYOK product studio.
 */

const config = {
  appName: "灵图电商工作室",
  app: {
    mode: process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || "production",
    defaultLocalUserId: process.env.DEFAULT_LOCAL_USER_ID || "local-user",
  },
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    webhook_url: process.env.WEBHOOK_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    plans: {
      basic: {
        id: "basic",
        name: "Basic Pack",
        credits: 1000,
        price: 500, // $5.00
      },
      standard: {
        id: "standard",
        name: "Standard Pack",
        credits: 2000,
        price: 1000, // $10.00
      },
      pro: {
        id: "pro",
        name: "Pro Pack",
        credits: 4000,
        price: 2000, // $20.00
      },
      business: {
        id: "business",
        name: "Business Pack",
        credits: 10000,
        price: 5000, // $50.00
      }
    }
  },
  ai: {
    apiKey: process.env.MU_API_KEY,
    submitEndpoint: "https://api.muapi.ai/api/v1/nano-banana-2-edit",
    uploadEndpoint: "https://api.muapi.ai/api/v1/upload_file",
    pollEndpoint: (requestId) => `https://api.muapi.ai/api/v1/predictions/${requestId}/result`,
    creditCost: 18,
  },
  db: {
    url: process.env.DATABASE_URL,
  }
};

export default config;
