const pool = require('../db/pool');

async function worldRoutes(fastify) {
  // POST /world/position — record where the authenticated player currently is
  fastify.post('/world/position', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.user;
    const { regionId, locationId } = request.body;
    if (!regionId || !locationId) return reply.status(400).send({ error: 'Missing regionId or locationId' });

    await pool.query(
      `INSERT INTO player_world_state (user_id, region_id, location_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET region_id = $2, location_id = $3, updated_at = NOW()`,
      [id, regionId, locationId]
    );
    return { ok: true };
  });

  // GET /world/nearby — all other players in the same region, active in the last 5 minutes
  fastify.get('/world/nearby', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;

    const selfResult = await pool.query(
      'SELECT region_id FROM player_world_state WHERE user_id = $1',
      [id]
    );
    if (!selfResult.rows[0]) return { players: [] };

    const regionId = selfResult.rows[0].region_id;

    const result = await pool.query(
      `SELECT pw.user_id, pw.location_id,
              COALESCE(h.save_data->'hero'->>'name', u.username) AS name
       FROM player_world_state pw
       JOIN users u ON u.id = pw.user_id
       LEFT JOIN heroes h ON h.user_id = pw.user_id
       WHERE pw.region_id = $1
         AND pw.user_id != $2
         AND pw.updated_at > NOW() - INTERVAL '5 minutes'`,
      [regionId, id]
    );
    return { players: result.rows };
  });
}

module.exports = worldRoutes;
