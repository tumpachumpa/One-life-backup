const pool = require('../db/pool');

const ESSENCE_PER_HOUR = 100;

function reduceOrRemoveSlot(grid, idx, qty) {
  const slot = grid[idx];
  const current = slot?.qty || 1;
  if (current <= qty) {
    grid.splice(idx, 1);
  } else {
    grid[idx] = { ...slot, qty: current - qty };
  }
}

function removeItemFromSave(saveData, entry) {
  const hero = saveData?.hero || {};

  // When a UID is available, search all locations — the item may have moved since
  // the loot pool was recorded (e.g. defender unequipped it before the removal fired).
  if (entry.itemUid) {
    for (const [slot, item] of Object.entries(hero.equip || {})) {
      if (item && typeof item === 'object' && item.uid === entry.itemUid) {
        hero.equip[slot] = null;
        return;
      }
    }
    if (hero.inventory) {
      const idx = hero.inventory.findIndex(p => {
        const item = typeof p?.itemId === 'object' ? p.itemId : null;
        return item?.uid === entry.itemUid;
      });
      if (idx !== -1) { reduceOrRemoveSlot(hero.inventory, idx, entry.qty || 1); return; }
    }
    if (saveData.stash) {
      const idx = saveData.stash.findIndex(p => {
        const item = typeof p?.itemId === 'object' ? p.itemId : null;
        return item?.uid === entry.itemUid;
      });
      if (idx !== -1) { reduceOrRemoveSlot(saveData.stash, idx, entry.qty || 1); return; }
    }
    return;
  }

  // No UID — fall back to location-based removal
  if (entry.source === 'equip') {
    if (hero.equip) hero.equip[entry.slot] = null;
  } else if (entry.source === 'inventory') {
    if (!hero.inventory) return;
    let idx = hero.inventory.findIndex(p => {
      const id = typeof p?.itemId === 'object' ? p.itemId?.id : p?.itemId;
      return id === entry.itemId && p?.x === entry.x && p?.y === entry.y;
    });
    if (idx === -1) {
      idx = hero.inventory.findIndex(p => {
        const id = typeof p?.itemId === 'object' ? p.itemId?.id : p?.itemId;
        return id === entry.itemId;
      });
      console.log(`[PvP] inventory pos-match failed for ${entry.itemId}, fallback id-only idx=${idx}`);
    }
    if (idx !== -1) reduceOrRemoveSlot(hero.inventory, idx, entry.qty || 1);
  } else if (entry.source === 'stash') {
    if (!saveData.stash) return;
    let idx = saveData.stash.findIndex(p => {
      const id = typeof p?.itemId === 'object' ? p.itemId?.id : p?.itemId;
      return id === entry.itemId && p?.x === entry.x && p?.y === entry.y;
    });
    if (idx === -1) {
      idx = saveData.stash.findIndex(p => {
        const id = typeof p?.itemId === 'object' ? p.itemId?.id : p?.itemId;
        return id === entry.itemId;
      });
      console.log(`[PvP] stash pos-match failed for ${entry.itemId}, fallback id-only idx=${idx}`);
    }
    if (idx !== -1) reduceOrRemoveSlot(saveData.stash, idx, entry.qty || 1);
  }
}

// Apply any pending PvP item removals to saveData and mark them applied atomically.
// The UPDATE ... RETURNING pattern ensures concurrent POST /hero calls can't both claim the same rows.
async function applyPendingRemovals(saveData, userId) {
  const pending = await pool.query(
    `UPDATE pvp_pending_removals SET applied = TRUE WHERE user_id = $1 AND applied = FALSE RETURNING id, entry`,
    [userId]
  );
  if (!pending.rows.length) return false;

  for (const row of pending.rows) {
    removeItemFromSave(saveData, row.entry);
  }
  return true;
}

// Apply any pending PvP item grants to saveData and mark them applied atomically.
async function applyPendingLoot(saveData, userId) {
  const pending = await pool.query(
    `UPDATE pvp_pending_loot SET applied = TRUE WHERE user_id = $1 AND applied = FALSE RETURNING id, item`,
    [userId]
  );
  if (!pending.rows.length) return false;

  if (!saveData.pendingLoot) saveData.pendingLoot = [];
  for (const row of pending.rows) {
    saveData.pendingLoot.push(row.item);
  }
  return true;
}

async function heroRoutes(fastify) {
  // GET /hero — load hero save and apply passive income
  fastify.get('/hero', { preHandler: fastify.authenticate }, async (request) => {
    const { id } = request.user;
    const result = await pool.query('SELECT save_data FROM heroes WHERE user_id = $1', [id]);
    if (!result.rows[0]) return { hero: null };

    const hero = result.rows[0].save_data;
    let dirty = false;

    // Apply passive essence income from tile claim
    const claimResult = await pool.query(
      `SELECT last_income_at FROM tile_claims WHERE user_id = $1 AND last_active > NOW() - INTERVAL '5 days'`,
      [id]
    );
    if (claimResult.rows[0]) {
      const lastIncome = new Date(claimResult.rows[0].last_income_at);
      const hoursElapsed = Math.floor((Date.now() - lastIncome.getTime()) / (1000 * 60 * 60));
      if (hoursElapsed > 0) {
        const earned = hoursElapsed * ESSENCE_PER_HOUR;
        hero.hero = hero.hero || {};
        hero.hero.gold = (hero.hero?.gold || 0) + earned;
        await pool.query(
          `UPDATE tile_claims SET last_income_at = last_income_at + ($1 * INTERVAL '1 hour') WHERE user_id = $2`,
          [hoursElapsed, id]
        );
        dirty = true;
      }
    }

    if (dirty) {
      await pool.query('UPDATE heroes SET save_data = $1, updated_at = NOW() WHERE user_id = $2', [hero, id]);
    }

    return { hero };
  });

  // POST /hero — save hero, applying any pending PvP changes before persisting.
  // Returns appliedHero (inner hero object) when pending removals were applied so
  // the client can update its state and avoid overwriting the removal on the next save.
  fastify.post('/hero', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.user;
    const { hero } = request.body;
    if (!hero) return reply.status(400).send({ error: 'Missing hero data' });

    // encounterCharges is now server-managed — strip it so old clients can't overwrite server state
    if (hero.hero) delete hero.hero.encounterCharges;

    const removalsApplied = await applyPendingRemovals(hero, id);
    const lootApplied = await applyPendingLoot(hero, id);

    await pool.query(
      `INSERT INTO heroes (user_id, save_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET save_data = $2, updated_at = NOW()`,
      [id, hero]
    );
    return {
      ok: true,
      ...(removalsApplied ? { appliedHero: hero.hero } : {}),
      ...(lootApplied ? { appliedPendingLoot: hero.pendingLoot || [] } : {}),
    };
  });
}

module.exports = heroRoutes;
