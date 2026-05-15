const pool = require('../db/pool');

async function tileRoutes(fastify) {
  // GET /tiles — all current claims (public, for map display)
  fastify.get('/tiles', async () => {
    const result = await pool.query(
      `SELECT tc.user_id,
              COALESCE(h.save_data->'hero'->>'name', u.username) AS username,
              tc.node_id, tc.ring,
              tc.claimed_at, tc.protected_until, tc.last_active
       FROM tile_claims tc
       JOIN users u ON u.id = tc.user_id
       LEFT JOIN heroes h ON h.user_id = tc.user_id
       WHERE tc.last_active > NOW() - INTERVAL '5 days'`
    );
    return { claims: result.rows };
  });

  // GET /tiles/mine — current user's claim
  fastify.get('/tiles/mine', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;
    const result = await pool.query(
      `SELECT tc.node_id, tc.ring, tc.claimed_at, tc.protected_until
       FROM tile_claims tc WHERE tc.user_id = $1`,
      [id]
    );
    return { claim: result.rows[0] || null };
  });

  // POST /tiles/claim — claim a free ring tile
  fastify.post('/tiles/claim', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.user;
    const { nodeId, ring } = request.body;

    if (!nodeId || ring == null) return reply.status(400).send({ error: 'Missing nodeId or ring' });
    if (![0, 1, 2].includes(ring)) return reply.status(400).send({ error: 'Invalid ring' });

    // Check if tile is free
    const occupied = await pool.query(
      `SELECT user_id FROM tile_claims WHERE node_id = $1 AND ring = $2
       AND last_active > NOW() - INTERVAL '5 days'`,
      [nodeId, ring]
    );

    if (occupied.rows.length > 0) {
      const occupant = occupied.rows[0];
      if (occupant.user_id === id) return reply.status(409).send({ error: 'You already own this tile' });
      return reply.status(409).send({ error: 'occupied', occupantId: occupant.user_id });
    }

    // Release any existing claim the user has, then claim new tile
    await pool.query('DELETE FROM tile_claims WHERE user_id = $1', [id]);
    await pool.query(
      `INSERT INTO tile_claims (user_id, node_id, ring, claimed_at, last_active)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [id, nodeId, ring]
    );

    return { ok: true, nodeId, ring };
  });

  // POST /tiles/heartbeat — update last_active so tile doesn't expire
  fastify.post('/tiles/heartbeat', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;
    await pool.query(
      'UPDATE tile_claims SET last_active = NOW() WHERE user_id = $1',
      [id]
    );
    return { ok: true };
  });

  // DELETE /tiles/claim — release your tile
  fastify.delete('/tiles/claim', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;
    await pool.query('DELETE FROM tile_claims WHERE user_id = $1', [id]);
    return { ok: true };
  });
}

module.exports = tileRoutes;
