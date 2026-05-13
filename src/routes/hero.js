const pool = require('../db/pool');

async function heroRoutes(fastify) {
  // GET /hero — load hero save
  fastify.get('/hero', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;
    const result = await pool.query(
      'SELECT save_data FROM heroes WHERE user_id = $1',
      [id]
    );
    if (!result.rows[0]) return { hero: null };
    return { hero: result.rows[0].save_data };
  });

  // POST /hero — save hero
  fastify.post('/hero', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.user;
    const { hero } = request.body;
    if (!hero) return reply.status(400).send({ error: 'Missing hero data' });
    await pool.query(
      `INSERT INTO heroes (user_id, save_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET save_data = $2, updated_at = NOW()`,
      [id, hero]
    );
    return { ok: true };
  });
}

module.exports = heroRoutes;
