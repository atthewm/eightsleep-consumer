/**
 * Find the entities created by the Eight Sleep custom integration
 * (github.com/lukas-clarke/eight_sleep, installed through HACS) in a list of
 * Home Assistant states.
 *
 * That integration names entities `<device>_<entity>`, where each side of the
 * bed is its own device called "<First name>'s Eight Sleep Side". So one side
 * produces, for example:
 *
 *   binary_sensor.matt_s_eight_sleep_side_bed_presence   (occupancy)
 *   climate.matt_s_eight_sleep_side_climate              (bed temperature control)
 *   climate.matt_s_eight_sleep_side_pillow               (Pod 5 pillow, when present)
 *   sensor.matt_s_eight_sleep_side_bed_temperature       (°C)
 *   sensor.matt_s_eight_sleep_side_next_alarm            (timestamp)
 *   button.matt_s_eight_sleep_side_snooze_alarm
 *   button.matt_s_eight_sleep_side_dismiss_alarm
 *   switch.matt_s_eight_sleep_side_alarm_1               (one per alarm)
 *
 * Discovery starts from each `*_bed_presence` binary sensor and derives the
 * side's prefix from it, so renamed devices still work as long as the entity
 * suffixes are left alone. Sides can also be given explicitly.
 */

import type { HaState } from "./api.js";

export interface SideEntities {
  /** Human label used for HomeKit names, e.g. "Matt" or "Left". */
  label: string;
  /** Lower-case slug of the label, used in generated entity ids. */
  slug: string;
  /** Entity id prefix without domain, e.g. `matt_s_eight_sleep_side`. */
  prefix: string;
  presence: string;
  climate?: string;
  pillow?: string;
  bedTemperature?: string;
  nextAlarm?: string;
  snoozeButton?: string;
  dismissButton?: string;
  alarmSwitches: string[];
}

export interface EightSleepEntities {
  sides: SideEntities[];
  roomTemperature?: string;
  basePreset?: string;
}

export interface SideOverride {
  prefix: string;
  label: string;
}

const PRESENCE_SUFFIX = "_bed_presence";

export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "side";
}

function friendlyName(state: HaState | undefined): string | undefined {
  const name = state?.attributes?.friendly_name;
  return typeof name === "string" ? name : undefined;
}

/** "Matt's Eight Sleep Side Bed Presence" -> "Matt". Falls back to the prefix. */
export function labelFromPresence(state: HaState, prefix: string): string {
  const name = friendlyName(state);
  if (name) {
    const cleaned = name
      .replace(/\s*bed presence\s*$/i, "")
      .replace(/['’]s eight sleep side$/i, "")
      .replace(/\s*eight sleep side$/i, "")
      .trim();
    if (cleaned) return cleaned[0]!.toUpperCase() + cleaned.slice(1);
  }
  const fromPrefix = prefix.replace(/_s_eight_sleep_side$/, "").replace(/_eight_sleep_side$/, "");
  return fromPrefix
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function isEightSleepPresence(state: HaState): boolean {
  if (!state.entity_id.startsWith("binary_sensor.")) return false;
  if (!state.entity_id.endsWith(PRESENCE_SUFFIX)) return false;
  const name = friendlyName(state) ?? "";
  return state.entity_id.includes("eight_sleep") || /eight sleep/i.test(name);
}

export function parseSideOverrides(raw: string | undefined): SideOverride[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [prefix, label] = part.split("=").map((s) => s.trim());
      if (!prefix) throw new Error(`Bad side override "${part}". Use prefix=Label.`);
      return { prefix, label: label || prefix };
    });
}

export function discoverEightSleep(
  states: HaState[],
  overrides: SideOverride[] = [],
): EightSleepEntities {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const has = (id: string) => (byId.has(id) ? id : undefined);

  const sideSeeds: SideOverride[] = overrides.length
    ? overrides
    : states.filter(isEightSleepPresence).map((s) => {
        const prefix = s.entity_id.slice("binary_sensor.".length, -PRESENCE_SUFFIX.length);
        return { prefix, label: labelFromPresence(s, prefix) };
      });

  const usedSlugs = new Set<string>();
  const sides: SideEntities[] = [];

  for (const seed of sideSeeds) {
    const presence = `binary_sensor.${seed.prefix}${PRESENCE_SUFFIX}`;
    if (!byId.has(presence)) {
      throw new Error(`No entity ${presence} in Home Assistant for side "${seed.label}".`);
    }

    // Keep label and slug unique together, so generated names map to the
    // entity ids Home Assistant derives from them.
    let label = seed.label;
    for (let n = 2; usedSlugs.has(slugify(label)); n++) label = `${seed.label} ${n}`;
    const slug = slugify(label);
    usedSlugs.add(slug);

    const alarmPattern = new RegExp(`^switch\\.${seed.prefix}_alarm_\\d+$`);
    const alarmSwitches = states
      .map((s) => s.entity_id)
      .filter((id) => alarmPattern.test(id))
      .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()));

    sides.push({
      label,
      slug,
      prefix: seed.prefix,
      presence,
      climate: has(`climate.${seed.prefix}_climate`),
      pillow: has(`climate.${seed.prefix}_pillow`),
      bedTemperature: has(`sensor.${seed.prefix}_bed_temperature`),
      nextAlarm: has(`sensor.${seed.prefix}_next_alarm`),
      snoozeButton: has(`button.${seed.prefix}_snooze_alarm`),
      dismissButton: has(`button.${seed.prefix}_dismiss_alarm`),
      alarmSwitches,
    });
  }

  const allIds = states.map((s) => s.entity_id);

  return {
    sides,
    // The hub device is "<account> Eight Sleep Hub", so its ids contain eight_sleep.
    roomTemperature: allIds.find((id) => /^sensor\..*eight_sleep.*_room_temperature$/.test(id)),
    // The Base device is "<account> Base", which need not contain eight_sleep.
    basePreset: allIds.find((id) => /^select\..*_base_bed_preset$/.test(id)),
  };
}

/** Plain-text summary for `ha:discover`. */
export function describeDiscovery(found: EightSleepEntities): string {
  if (found.sides.length === 0) {
    return [
      "No Eight Sleep sides found.",
      "Install the Eight Sleep integration from HACS (github.com/lukas-clarke/eight_sleep),",
      "or pass HA_EIGHT_SLEEP_SIDES=<entity_prefix>=<Label> if you renamed the entities.",
    ].join("\n");
  }
  const lines: string[] = [];
  for (const side of found.sides) {
    lines.push(`Side "${side.label}" (prefix ${side.prefix})`);
    const rows: Array<[string, string | undefined]> = [
      ["bed presence", side.presence],
      ["bed climate", side.climate],
      ["pillow climate", side.pillow],
      ["bed temperature", side.bedTemperature],
      ["next alarm", side.nextAlarm],
      ["snooze button", side.snoozeButton],
      ["dismiss button", side.dismissButton],
      ["alarm switches", side.alarmSwitches.join(", ") || undefined],
    ];
    for (const [k, v] of rows) lines.push(`  ${k.padEnd(16)} ${v ?? "(not found)"}`);
  }
  lines.push(`Room temperature   ${found.roomTemperature ?? "(not found)"}`);
  lines.push(`Base preset        ${found.basePreset ?? "(not found, no Base)"}`);
  return lines.join("\n");
}
