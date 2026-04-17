import {
  Room,
  BedConfiguration,
  RoomSleepResult,
  SleepOptimizationResult,
} from "./types";

// ── Bed configuration templates ──
// Each template describes a possible bed setup with space requirements.

const CONFIGS: Omit<BedConfiguration, "id">[] = [
  // ── High capacity (prioritized for max sleeping) ──
  {
    name: "2x Queen/Queen Bunk",
    beds: [{ type: "queen-over-queen-bunk", quantity: 2, sleepsPerUnit: 4 }],
    totalSleeps: 8,
    minWidthFt: 15,
    minLengthFt: 10,
    minCeilingFt: 9,
    description: "Two queen-over-queen bunks — maximum capacity for large rooms",
    priority: 100,
  },
  {
    name: "Queen + Queen/Queen Bunk",
    beds: [
      { type: "queen", quantity: 1, sleepsPerUnit: 2 },
      { type: "queen-over-queen-bunk", quantity: 1, sleepsPerUnit: 4 },
    ],
    totalSleeps: 6,
    minWidthFt: 14,
    minLengthFt: 10,
    minCeilingFt: 9,
    description:
      "Queen bed plus queen bunk — good mix of comfort and capacity",
    priority: 90,
  },
  {
    name: "Queen/Queen Bunk",
    beds: [{ type: "queen-over-queen-bunk", quantity: 1, sleepsPerUnit: 4 }],
    totalSleeps: 4,
    minWidthFt: 10,
    minLengthFt: 10,
    minCeilingFt: 9,
    description: "Queen-over-queen bunk bed — sleeps 4 in one footprint",
    priority: 85,
  },
  {
    name: "2 Queen Beds",
    beds: [{ type: "queen", quantity: 2, sleepsPerUnit: 2 }],
    totalSleeps: 4,
    minWidthFt: 14,
    minLengthFt: 10,
    minCeilingFt: 8,
    description: "Two queen beds — hotel-style setup",
    priority: 70,
  },
  {
    name: "Queen + Twin/Twin Bunk",
    beds: [
      { type: "queen", quantity: 1, sleepsPerUnit: 2 },
      { type: "twin-over-twin-bunk", quantity: 1, sleepsPerUnit: 2 },
    ],
    totalSleeps: 4,
    minWidthFt: 13,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Queen bed plus twin bunk — adults + kids",
    priority: 65,
  },

  // ── Standard bedroom ──
  {
    name: "King Bed",
    beds: [{ type: "king", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 11,
    minLengthFt: 10,
    minCeilingFt: 8,
    description: "King bed — spacious primary suite feel",
    priority: 60,
  },
  {
    name: "Queen Bed",
    beds: [{ type: "queen", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 10,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Queen bed — comfortable standard room",
    priority: 55,
  },
  {
    name: "Twin/Twin Bunk",
    beds: [{ type: "twin-over-twin-bunk", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 8,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Twin bunk — compact, great for kids",
    priority: 40,
  },
  {
    name: "Twin/Full Bunk",
    beds: [{ type: "twin-over-full-bunk", quantity: 1, sleepsPerUnit: 3 }],
    totalSleeps: 3,
    minWidthFt: 9,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Twin over full — flexible for mixed groups",
    priority: 50,
  },
  {
    name: "Daybed + Trundle",
    beds: [{ type: "daybed-trundle", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 8,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Daybed with trundle — doubles as a sofa during the day",
    priority: 35,
  },

  // ── Living / flex space ──
  {
    name: "Sofa Bed",
    beds: [{ type: "sofa-bed", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 10,
    minLengthFt: 10,
    minCeilingFt: 8,
    description: "Sleeper sofa — extra beds without losing living space",
    priority: 25,
  },
  {
    name: "Murphy Bed",
    beds: [{ type: "murphy-bed", quantity: 1, sleepsPerUnit: 2 }],
    totalSleeps: 2,
    minWidthFt: 9,
    minLengthFt: 9,
    minCeilingFt: 8,
    description: "Murphy bed — folds away to reclaim floor space",
    priority: 30,
  },

  // ── No sleeping ──
  {
    name: "No Beds",
    beds: [],
    totalSleeps: 0,
    minWidthFt: 0,
    minLengthFt: 0,
    minCeilingFt: 0,
    description: "No sleeping arrangement — use room for other purposes",
    priority: 0,
  },
];

// Which room types can have beds?
const SLEEPABLE_TYPES = new Set([
  "primary-bedroom",
  "bedroom",
  "loft",
  "bonus-room",
  "den",
  "office",
  "living-room",
  "media-room",
  "game-room",
]);

const LIVING_FLEX_TYPES = new Set([
  "living-room",
  "den",
  "office",
  "media-room",
  "game-room",
]);

/**
 * Return every bed configuration that physically fits in the room.
 */
export function getConfigsForRoom(room: Room): BedConfiguration[] {
  if (!SLEEPABLE_TYPES.has(room.type)) {
    return [withId(CONFIGS[CONFIGS.length - 1])]; // "No Beds" only
  }

  const isFlexRoom = LIVING_FLEX_TYPES.has(room.type);

  return CONFIGS.filter((c) => {
    // Flex rooms should only get sofa-bed, murphy-bed, daybed, or no-beds
    if (isFlexRoom) {
      const flexAllowed = new Set(["Sofa Bed", "Murphy Bed", "Daybed + Trundle", "No Beds"]);
      if (!flexAllowed.has(c.name)) return false;
    }

    return (
      room.widthFt >= c.minWidthFt &&
      room.lengthFt >= c.minLengthFt &&
      room.ceilingHeightFt >= c.minCeilingFt
    );
  }).map(withId);
}

function withId(c: Omit<BedConfiguration, "id">): BedConfiguration {
  return { ...c, id: slugify(c.name) };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Core optimization algorithm.
 *
 * Strategy:
 * 1. The primary bedroom always gets a king or queen (comfort first).
 * 2. Other bedrooms prefer queen-over-queen bunks for max capacity.
 * 3. Flex rooms (living, den, office) get sofa/murphy beds for bonus capacity.
 * 4. If we've already hit the target, remaining bedrooms get single queens
 *    to avoid over-bunking.
 */
export function optimizeSleeping(
  rooms: Room[],
  targetGuests: number
): SleepOptimizationResult {
  const results: RoomSleepResult[] = [];
  let totalSleeps = 0;

  // Sort rooms: primary bedroom first, then bedrooms by size (largest first),
  // then flex rooms last.
  const sorted = [...rooms].sort((a, b) => {
    const order = (r: Room) => {
      if (r.type === "primary-bedroom") return 0;
      if (r.type === "bedroom" || r.type === "loft" || r.type === "bonus-room")
        return 1;
      if (LIVING_FLEX_TYPES.has(r.type)) return 3;
      return 4;
    };
    const diff = order(a) - order(b);
    if (diff !== 0) return diff;
    // Larger rooms first within same priority
    return b.widthFt * b.lengthFt - a.widthFt * a.lengthFt;
  });

  // First pass: assign high-capacity configs to bedrooms
  const roomConfigs = new Map<string, BedConfiguration>();

  for (const room of sorted) {
    const configs = getConfigsForRoom(room);
    if (configs.length <= 1) continue; // only "No Beds"

    if (room.type === "primary-bedroom") {
      // Primary gets the nicest single-bed option
      const preferred =
        configs.find((c) => c.id === "king-bed") ??
        configs.find((c) => c.id === "queen-bed") ??
        configs[0];
      roomConfigs.set(room.id, preferred);
      totalSleeps += preferred.totalSleeps;
    } else if (!LIVING_FLEX_TYPES.has(room.type)) {
      // Regular bedrooms: pick highest-capacity config
      const best = configs
        .filter((c) => c.totalSleeps > 0)
        .sort((a, b) => b.totalSleeps - a.totalSleeps || b.priority - a.priority)[0];
      if (best) {
        roomConfigs.set(room.id, best);
        totalSleeps += best.totalSleeps;
      }
    }
  }

  // Second pass: if we haven't hit the target, add flex room beds
  if (totalSleeps < targetGuests) {
    for (const room of sorted) {
      if (roomConfigs.has(room.id)) continue;
      if (!LIVING_FLEX_TYPES.has(room.type)) continue;

      const configs = getConfigsForRoom(room);
      const best = configs
        .filter((c) => c.totalSleeps > 0)
        .sort((a, b) => b.totalSleeps - a.totalSleeps)[0];
      if (best) {
        roomConfigs.set(room.id, best);
        totalSleeps += best.totalSleeps;
      }
      if (totalSleeps >= targetGuests) break;
    }
  }

  // Third pass: only downgrade if we're WAY over. For Teeco's Airbnb
  // playbook, overshooting by 1-3 guests = higher revenue ceiling, so
  // we keep the bunks. Only downgrade if overshoot is unreasonable
  // (more than 4 guests OR more than 50% over target).
  const maxAcceptableOvershoot = Math.max(4, Math.ceil(targetGuests * 0.5));
  if (totalSleeps > targetGuests + maxAcceptableOvershoot) {
    const downgradeable = sorted.filter(
      (r) =>
        !LIVING_FLEX_TYPES.has(r.type) &&
        r.type !== "primary-bedroom" &&
        roomConfigs.has(r.id) &&
        (roomConfigs.get(r.id)!.totalSleeps ?? 0) > 2
    );
    downgradeable.sort(
      (a, b) => a.widthFt * a.lengthFt - b.widthFt * b.lengthFt
    );

    for (const room of downgradeable) {
      if (totalSleeps <= targetGuests + maxAcceptableOvershoot) break;
      const configs = getConfigsForRoom(room);
      const queen = configs.find((c) => c.id === "queen-bed");
      if (queen) {
        const current = roomConfigs.get(room.id)!;
        const savings = current.totalSleeps - queen.totalSleeps;
        if (totalSleeps - savings >= targetGuests) {
          totalSleeps -= savings;
          roomConfigs.set(room.id, queen);
        }
      }
    }
  }

  // Build results
  for (const room of rooms) {
    const configs = getConfigsForRoom(room);
    const recommended =
      roomConfigs.get(room.id) ??
      configs.find((c) => c.totalSleeps === 0) ??
      configs[0];

    results.push({
      roomId: room.id,
      roomName: room.name,
      recommended,
      alternatives: configs.filter((c) => c.id !== recommended.id),
    });
  }

  const targetMet = totalSleeps >= targetGuests;
  const overshoot = totalSleeps - targetGuests;
  let summary: string;
  if (!targetMet) {
    summary = `Only sleeps ${totalSleeps} of ${targetGuests} target guests. Add rooms, enlarge existing rooms, or use bunk configurations to hit target.`;
  } else if (overshoot === 0) {
    summary = `Hits target exactly: ${totalSleeps} guests across ${roomConfigs.size} rooms.`;
  } else if (overshoot <= 4) {
    summary = `Sleeps ${totalSleeps} guests (target: ${targetGuests}, +${overshoot} bonus capacity). Queen-over-queen bunks maximize revenue without cramping rooms.`;
  } else {
    summary = `Sleeps ${totalSleeps} guests — ${overshoot} over target. Consider swapping some bunks for queens if comfort matters more than capacity.`;
  }

  return { roomResults: results, totalSleeps, targetGuests, targetMet, summary };
}

/**
 * Quick helper: total sleeping capacity for a project's current config.
 */
export function getTotalSleeping(rooms: Room[]): number {
  return rooms.reduce(
    (sum, r) => sum + (r.selectedBedConfig?.totalSleeps ?? 0),
    0
  );
}
