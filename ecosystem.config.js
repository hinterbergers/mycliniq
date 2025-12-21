module.exports = {
  apps: [
    {
      name: "mycliniq",
      script: "dist/index.cjs",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL,
        SESSION_SECRET: process.env.SESSION_SECRET,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    },
  ],
};