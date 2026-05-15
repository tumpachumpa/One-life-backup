export function getTalentLevels(tree) {
  return tree?.levels || [];
}

export function getTalentBranches(tree) {
  return tree?.branches || [];
}

export function getChosenTalent(level, talents = {}) {
  return (level?.choices || []).find(choice => talents[choice.id]);
}

function getPreviousTierUnlockRequirement(tree, branch) {
  return Math.max(0, branch?.rules?.minPreviousTierUnlocks ?? tree?.rules?.minPreviousTierUnlocks ?? 0);
}

function shouldMatchLowerTierUnlocks(tree, branch) {
  return !!(branch?.rules?.matchLowerTierUnlocks ?? tree?.rules?.matchLowerTierUnlocks ?? false);
}

function countUnlockedChoices(tier, talents = {}) {
  return (tier?.choices || []).filter(choice => talents[choice.id]).length;
}

function countBranchUnlocks(branch, talents = {}) {
  return (branch?.tiers || [])
    .flatMap(tier => tier?.choices || [])
    .filter(choice => talents[choice.id])
    .length;
}

function getBranchChoices(branch) {
  return (branch?.tiers || []).flatMap(tier => tier?.choices || []);
}

function getMinBranchPointsBeforeBranching(tree, branch) {
  return Math.max(0, branch?.rules?.minBranchPointsBeforeBranching ?? tree?.rules?.minBranchPointsBeforeBranching ?? 0);
}

function getMaxActiveBranches(tree, branch) {
  const value = branch?.rules?.maxActiveBranches ?? tree?.rules?.maxActiveBranches ?? Infinity;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : Infinity;
}

export function getBranchingRequirement(tree, targetBranch, talents = {}) {
  const required = getMinBranchPointsBeforeBranching(tree, targetBranch);
  const maxBranches = getMaxActiveBranches(tree, targetBranch);
  if (!targetBranch || (required <= 0 && !Number.isFinite(maxBranches))) {
    return { locked: false, required: 0, learned: 0, sourceBranch: null, maxBranches };
  }

  const branches = getTalentBranches(tree);
  const branchCounts = branches
    .map(branch => ({ branch, learned: countBranchUnlocks(branch, talents) }))
    .filter(entry => entry.learned > 0);
  const targetEntry = branchCounts.find(entry => entry.branch.id === targetBranch.id);
  if (!branchCounts.length || targetEntry?.learned > 0) {
    return { locked: false, required, learned: targetEntry?.learned || 0, sourceBranch: targetBranch, maxBranches };
  }

  if (Number.isFinite(maxBranches) && branchCounts.length >= maxBranches) {
    return {
      locked: true,
      reason: "max_active_branches",
      required,
      learned: branchCounts.length,
      sourceBranch: null,
      maxBranches,
    };
  }

  const committedBranch = branchCounts.find(entry => entry.learned >= required);
  if (committedBranch) {
    return { locked: false, required, learned: committedBranch.learned, sourceBranch: committedBranch.branch, maxBranches };
  }

  const source = branchCounts[0] || null;
  return {
    locked: true,
    reason: "branch_commitment",
    required,
    learned: source?.learned || 0,
    sourceBranch: source?.branch || null,
    maxBranches,
  };
}

export function getBranchTierRequirement(tree, branch, tierIndex, talents = {}) {
  const tiers = branch?.tiers || [];
  if (!branch || tierIndex <= 0) {
    return {
      locked: false,
      accessLocked: false,
      matchingLocked: false,
      required: 0,
      learned: 0,
      matchingRequired: 0,
      previousTier: null,
      lowerTiers: [],
    };
  }
  const required = getPreviousTierUnlockRequirement(tree, branch);
  const previousTier = tiers[tierIndex - 1] || null;
  const learned = countUnlockedChoices(previousTier, talents);
  const accessLocked = required > 0 && learned < required;
  const currentTier = tiers[tierIndex] || null;
  const matchingRequired = shouldMatchLowerTierUnlocks(tree, branch)
    ? countUnlockedChoices(currentTier, talents) + 1
    : 0;
  const lowerTiers = matchingRequired > 0
    ? tiers.slice(0, tierIndex).map(tier => {
      const lowerLearned = countUnlockedChoices(tier, talents);
      return {
        tier,
        learned: lowerLearned,
        required: matchingRequired,
        locked: lowerLearned < matchingRequired,
      };
    })
    : [];
  const matchingLocked = lowerTiers.some(tier => tier.locked);
  return {
    locked: accessLocked || matchingLocked,
    accessLocked,
    matchingLocked,
    required,
    learned,
    matchingRequired,
    previousTier,
    lowerTiers,
  };
}

export function findTalentPosition(tree, nodeId) {
  const levels = getTalentLevels(tree);
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
    const choiceIndex = levels[levelIndex].choices.findIndex(choice => choice.id === nodeId);
    if (choiceIndex >= 0) return { levelIndex, choiceIndex, level: levels[levelIndex] };
  }
  const branches = getTalentBranches(tree);
  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    for (let tierIndex = 0; tierIndex < (branch.tiers || []).length; tierIndex += 1) {
      const tier = branch.tiers[tierIndex];
      const choiceIndex = (tier.choices || []).findIndex(choice => choice.id === nodeId);
      if (choiceIndex >= 0) {
        return { branchIndex, tierIndex, choiceIndex, branch, tier, level: tier };
      }
    }
  }
  return null;
}

export function getTalentPrerequisiteIds(node = {}) {
  return [
    ...(Array.isArray(node.requiresTalentIds) ? node.requiresTalentIds : []),
    node.requiresTalentId,
  ].filter(Boolean);
}

export function canLearnTalent(hero, tree, nodeId) {
  if (tree?.classId && tree.classId !== "shared" && hero?.heroClass && hero.heroClass !== tree.classId) return false;
  if ((tree?.classIds || []).length && hero?.heroClass && !tree.classIds.includes(hero.heroClass) && !tree.classIds.includes("shared")) return false;
  const position = findTalentPosition(tree, nodeId);
  if (!position) return false;
  const talents = hero?.talents || {};
  if (talents[nodeId]) return false;
  if ((hero?.talentPoints || 0) <= 0) return false;
  const node = (position.level?.choices || [])[position.choiceIndex] || null;
  if (getTalentPrerequisiteIds(node).some(requiredId => !talents[requiredId])) return false;
  if (position.branch) {
    if (getBranchingRequirement(tree, position.branch, talents).locked) return false;
    return !getBranchTierRequirement(tree, position.branch, position.tierIndex, talents).locked;
  }
  if (getChosenTalent(position.level, talents)) return false;
  if (position.levelIndex === 0) return true;
  return !!getChosenTalent(getTalentLevels(tree)[position.levelIndex - 1], talents);
}

function getValidationBranchOrder(tree, talents = {}) {
  const branches = getTalentBranches(tree);
  const required = Math.max(0, tree?.rules?.minBranchPointsBeforeBranching ?? 0);
  return branches
    .map((branch, index) => ({ branch, index, learned: countBranchUnlocks(branch, talents) }))
    .sort((a, b) => {
      const aCommitted = required > 0 && a.learned >= required ? 1 : 0;
      const bCommitted = required > 0 && b.learned >= required ? 1 : 0;
      if (aCommitted !== bCommitted) return bCommitted - aCommitted;
      if (a.learned !== b.learned) return b.learned - a.learned;
      return a.index - b.index;
    })
    .map(entry => entry.branch);
}

export function normalizeTalentSelections(hero, tree) {
  if (!hero || !tree) return hero;
  const originalTalents = hero.talents || {};
  const knownIds = new Set([
    ...getTalentLevels(tree).flatMap(level => (level.choices || []).map(choice => choice.id)),
    ...getTalentBranches(tree).flatMap(branch => getBranchChoices(branch).map(choice => choice.id)),
  ]);
  const selectedKnownIds = Object.keys(originalTalents).filter(id => knownIds.has(id) && originalTalents[id]);
  if (!selectedKnownIds.length) return hero;

  const keptTalents = {};
  let removedCount = 0;
  const validatorHero = { ...hero, talentPoints: 1, talents: keptTalents };

  for (const level of getTalentLevels(tree)) {
    for (const choice of level.choices || []) {
      if (!originalTalents[choice.id]) continue;
      validatorHero.talents = keptTalents;
      if (canLearnTalent(validatorHero, tree, choice.id)) keptTalents[choice.id] = originalTalents[choice.id];
      else removedCount += 1;
    }
  }

  for (const branch of getValidationBranchOrder(tree, originalTalents)) {
    for (const tier of branch.tiers || []) {
      for (const choice of tier.choices || []) {
        if (!originalTalents[choice.id]) continue;
        validatorHero.talents = keptTalents;
        if (canLearnTalent(validatorHero, tree, choice.id)) keptTalents[choice.id] = originalTalents[choice.id];
        else removedCount += 1;
      }
    }
  }

  if (removedCount <= 0) return hero;
  return {
    ...hero,
    talents: {
      ...Object.fromEntries(Object.entries(originalTalents).filter(([id]) => !knownIds.has(id))),
      ...keptTalents,
    },
    talentPoints: Math.max(0, Math.floor(hero.talentPoints || 0)) + removedCount,
  };
}

export function learnTalent(hero, tree, nodeId) {
  if (!canLearnTalent(hero, tree, nodeId)) return hero;
  const paidHero = { ...hero, talentPoints: Math.max(0, (hero.talentPoints || 0) - 1) };
  return {
    ...paidHero,
    talents: { ...(paidHero.talents || {}), [nodeId]: 1 },
  };
}

export function resetTalentSelections(hero, tree) {
  const refundedPoints = Object.keys(hero?.talents || {})
    .filter(nodeId => findTalentPosition(tree, nodeId))
    .length;
  return {
    ...hero,
    talentPoints: Math.max(0, Math.floor(hero?.talentPoints || 0)) + refundedPoints,
    talents: {},
  };
}
