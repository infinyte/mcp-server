module.exports = {
  apps: [
    {
      name: 'mcp-server',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        SKIP_ENV_CHECK: true
      }
    }
  ],
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:username/testmcp.git',
      path: '/var/www/testmcp',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};