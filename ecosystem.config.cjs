module.exports = {
  apps: [
    {
      name: "mycliniq",
      script: "dist/index.cjs",
      cwd: "/opt/mycliniq",
      env_file: "/opt/mycliniq/.env",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
