'use strict';

const pool = require('../db/pool');

const contentModP = import('../game/logic/content.js');

// Mirrors src/logic/encounterCharges.js — kept inline so no shared ESM dependency
function getAvailable(max, rechargeMs, current, lastRechargeAt, nowMs) {
  return Math.min(max, current + Math.floor((nowMs - lastRechargeAt) / rechargeMs));
}

function consume(max, rechargeMs, current, lastRechargeAt, nowMs) {
  const elapsed = nowMs - lastRechargeAt;
  const recharges = Math.floor(elapsed / rechargeMs);
  return {
    current: Math.min(max, current + recharges) - 1,
    lastRechargeAt: lastRechargeAt + recharges * rechargeMs,
  };
}

async function encounterRoutes(fastify) {

  // GET /encounter/charges — return all charge states for this user
  fastify.get('/encounter/charges', { preHandler: fastify.authenticate }, async (request) => {
    const { id: userId } = request.user;
    const result = await pool.query(
      'SELECT region_id, current_charges, last_recharge_at FROM encounter_charges WHERE user_id = $1',
      [userId]
    );
    const charges = {};
    for (const row of result.rows) {
      charges[row.region_id] = {
        current: row.current_charges,
        lastRechargeAt: new Date(row.last_recharge_at).getTime(),
      };
    }
    return { charges };
  });

  // POST /encounter/consume-charge — validate and consume 1 charge
  fastify.post('/encounter/consume-charge', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id: userId } = request.user;
    const { regionId } = request.body;
    if (!regionId) return reply.status(400).send({ error: 'Missing regionId' });

    const { regionById } = await contentModP;
    const region = regionById?.[regionId];
    if (!region?.singleEncounter || !region?.charges) {
      return reply.status(404).send({ error: 'Region not found or not a single encounter' });
    }

    const { max, rechargeSeconds } = region.charges;
    const rechargeMs = rechargeSeconds * 1000;
    const nowMs = Date.now();

    const existing = await pool.query(
      'SELECT current_charges, last_recharge_at FROM encounter_charges WHERE user_id = $1 AND region_id = $2',
      [userId, regionId]
    );

    let current, lastRechargeAt;
    if (existing.rows.length === 0) {
      current = max;
      lastRechargeAt = nowMs;
    } else {
      current = existing.rows[0].current_charges;
      lastRechargeAt = new Date(existing.rows[0].last_recharge_at).getTime();
    }

    const available = getAvailable(max, rechargeMs, current, lastRechargeAt, nowMs);
    if (available <= 0) {
      return reply.status(403).send({ error: 'No charges available' });
    }

    const next = consume(max, rechargeMs, current, lastRechargeAt, nowMs);

    await pool.query(
      `INSERT INTO encounter_charges (user_id, region_id, current_charges, last_recharge_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, region_id) DO UPDATE
         SET current_charges = EXCLUDED.current_charges,
             last_recharge_at = EXCLUDED.last_recharge_at`,
      [userId, regionId, next.current, new Date(next.lastRechargeAt)]
    );

    return {
      regionId,
      current: next.current,
      lastRechargeAt: next.lastRechargeAt,
    };
  });
}

module.exports = encounterRoutes;
