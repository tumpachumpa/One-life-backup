import { CAST_TICKS, TICK_MS } from './types.js';

let _nextId = 0;

export function createActionQueue() {
  return [];
}

// Enqueue a basic attack or dodge/block-type action with the default CAST_TICKS cast time.
export function enqueueAction(queue, actorId, type, startTick, damage, spellId = null, castTicks = CAST_TICKS, meta = {}) {
  const impactTick = Math.ceil(startTick + castTicks);
  return [
    ...queue,
    {
      id: `${actorId}_${++_nextId}`,
      actorId,
      type,
      startTick,
      impactTick,
      damage,
      spellId,
      ...meta,
    },
  ];
}

// Enqueue an ability action with a variable cast time and the full ability definition attached.
export function enqueueAbility(queue, actorId, actionType, castTicks, startTick, damage, ability, meta = {}) {
  const projectileDurationMs = ability?.visual?.projectile?.durationMs || ability?.projectile?.durationMs || 0;
  const projectileTravelTicks = ability?.type === 'spell_attack' && projectileDurationMs > 0
    ? Math.max(1, Math.round(projectileDurationMs / TICK_MS))
    : 0;
  const rawCastEndTick = startTick + castTicks;
  const canResolveFractionalTick = ability?.type === 'front_swap';
  const castEndTick = canResolveFractionalTick ? rawCastEndTick : Math.ceil(rawCastEndTick);
  const projectileLaunchTick = projectileTravelTicks > 0 ? castEndTick : null;
  const impactTick = projectileTravelTicks > 0 ? projectileLaunchTick + projectileTravelTicks : castEndTick;
  return [
    ...queue,
    {
      id: `${actorId}_${++_nextId}`,
      actorId,
      type: actionType,
      startTick,
      castEndTick,
      impactTick,
      projectileLaunchTick,
      projectileTravelTicks,
      damage,
      ability, // full ability definition for resolution
      ...meta,
    },
  ];
}

export function getImpactsAtTick(queue, tick) {
  return queue.filter(a => a.impactTick <= tick);
}

// Remove actions that have already resolved
export function removePastActions(queue, tick) {
  return queue.filter(a => a.impactTick > tick);
}

// True if the actor has an action still in flight
export function isCasting(queue, actorId, currentTick) {
  return queue.some(a => a.actorId === actorId && (a.castEndTick ?? a.impactTick) > currentTick);
}

// First in-flight action for a given actor (used for cast bar)
export function getActiveCast(queue, actorId, currentTick) {
  return queue.find(a => a.actorId === actorId && (a.castEndTick ?? a.impactTick) > currentTick) || null;
}
