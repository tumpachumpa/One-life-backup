require('dotenv').config();
const fastify = require('fastify')({ logger: true });

fastify.register(require('@fastify/cors'), {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
});

fastify.register(require('./src/plugins/auth'));
fastify.register(require('./src/routes/auth'));
fastify.register(require('./src/routes/hero'));

fastify.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
