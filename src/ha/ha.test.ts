import assert from "node:assert/strict";
import { test } from "node:test";
import type { SleepDay } from "eightsleep-client";
import type { HaState } from "./api.js";
import { discoverEightSleep, labelFromPresence, parseSideOverrides, slugify } from "./discover.js";
import { pickLastNight, toStates } from "./publish.js";
import {
  DEFAULT_RENDER_OPTIONS,
  bridgeEntities,
  homekitSafeName,
  renderBridge,
  renderPackage,
} from "./render.js";

const st = (entity_id: string, friendly_name?: string, extra: Record<string, unknown> = {}): HaState => ({
  entity_id,
  state: "unknown",
  attributes: { ...(friendly_name ? { friendly_name } : {}), ...extra },
});

// Entity ids as the lukas-clarke/eight_sleep integration creates them for two sides.
const twoSides: HaState[] = [
  st("binary_sensor.matt_s_eight_sleep_side_bed_presence", "Matt's Eight Sleep Side Bed Presence", { device_class: "occupancy" }),
  st("climate.matt_s_eight_sleep_side_climate", "Matt's Eight Sleep Side Climate"),
  st("climate.matt_s_eight_sleep_side_pillow", "Matt's Eight Sleep Side Pillow"),
  st("sensor.matt_s_eight_sleep_side_bed_temperature"),
  st("sensor.matt_s_eight_sleep_side_next_alarm"),
  st("button.matt_s_eight_sleep_side_snooze_alarm"),
  st("button.matt_s_eight_sleep_side_dismiss_alarm"),
  st("switch.matt_s_eight_sleep_side_alarm_2"),
  st("switch.matt_s_eight_sleep_side_alarm_10"),
  st("switch.matt_s_eight_sleep_side_alarm_1"),
  st("binary_sensor.guest_s_eight_sleep_side_bed_presence", "Guest's Eight Sleep Side Bed Presence"),
  st("climate.guest_s_eight_sleep_side_climate"),
  st("sensor.home_eight_sleep_hub_room_temperature"),
  st("select.home_base_bed_preset"),
  // Unrelated entities that must be ignored.
  st("binary_sensor.office_bed_presence", "Office Bed Presence"),
  st("sensor.living_room_temperature"),
];

test("slugify and labels", () => {
  assert.equal(slugify("Matt's Side"), "matt_s_side");
  assert.equal(slugify("José"), "jose");
  assert.equal(labelFromPresence(twoSides[0]!, "matt_s_eight_sleep_side"), "Matt");
  assert.equal(labelFromPresence(st("binary_sensor.x"), "left_s_eight_sleep_side"), "Left");
  assert.equal(labelFromPresence(st("binary_sensor.y", "left's Eight Sleep Side Bed Presence"), "y"), "Left");
});

test("discovers both sides and the hub", () => {
  const found = discoverEightSleep(twoSides);
  assert.equal(found.sides.length, 2);
  const [matt, guest] = found.sides;
  assert.equal(matt!.label, "Matt");
  assert.equal(matt!.climate, "climate.matt_s_eight_sleep_side_climate");
  assert.equal(matt!.pillow, "climate.matt_s_eight_sleep_side_pillow");
  assert.equal(matt!.nextAlarm, "sensor.matt_s_eight_sleep_side_next_alarm");
  assert.deepEqual(matt!.alarmSwitches, [
    "switch.matt_s_eight_sleep_side_alarm_1",
    "switch.matt_s_eight_sleep_side_alarm_2",
    "switch.matt_s_eight_sleep_side_alarm_10",
  ]);
  assert.equal(guest!.label, "Guest");
  assert.equal(guest!.pillow, undefined);
  assert.equal(guest!.nextAlarm, undefined);
  assert.equal(found.roomTemperature, "sensor.home_eight_sleep_hub_room_temperature");
  assert.equal(found.basePreset, "select.home_base_bed_preset");
});

test("side overrides and duplicate labels", () => {
  const overrides = parseSideOverrides("matt_s_eight_sleep_side=Me, guest_s_eight_sleep_side=Me");
  const found = discoverEightSleep(twoSides, overrides);
  assert.deepEqual(found.sides.map((s) => [s.label, s.slug]), [["Me", "me"], ["Me 2", "me_2"]]);
  assert.throws(() => discoverEightSleep(twoSides, parseSideOverrides("nope=X")), /No entity/);
});

const opts = { ...DEFAULT_RENDER_OPTIONS, generatedAt: "2026-11-07" };

test("package has wake-up only for sides with an alarm sensor", () => {
  const yaml = renderPackage(discoverEightSleep(twoSides), opts);
  assert.match(yaml, /at: sensor\.matt_s_eight_sleep_side_next_alarm/);
  assert.match(yaml, /name: "Eight Sleep Matt Wake Up"/);
  assert.doesNotMatch(yaml, /Guest Wake Up/);
  assert.match(yaml, /name: "Eight Sleep Guest Up For The Day"/);
  assert.match(yaml, /is_state\('binary_sensor\.matt_s_eight_sleep_side_bed_presence', 'on'\) or is_state\('binary_sensor\.guest_s_eight_sleep_side_bed_presence', 'on'\)/);
  assert.match(yaml, /bedtime_temperature: 68/);
  const [bedtime, allOff] = yaml.split("eight_sleep_all_off:");
  assert.doesNotMatch(bedtime!, /climate\.matt_s_eight_sleep_side_pillow/);
  assert.match(allOff!, /- climate\.matt_s_eight_sleep_side_pillow/);
  assert.equal(yaml.includes("\t"), false);
});

test("bridge lists every accessory once with a safe name", () => {
  const found = discoverEightSleep(twoSides);
  const entities = bridgeEntities(found);
  const ids = entities.map((e) => e.entityId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("binary_sensor.eight_sleep_matt_wake_up"));
  assert.ok(ids.includes("binary_sensor.eight_sleep_anyone_in_bed"));
  assert.ok(ids.includes("script.eight_sleep_bedtime"));
  assert.ok(!ids.includes("binary_sensor.office_bed_presence"));
  const yaml = renderBridge(found, opts);
  assert.match(yaml, /port: 21065/);
  assert.match(yaml, /climate\.matt_s_eight_sleep_side_climate:\n {8}name: "Matt Bed"/);
  assert.equal(homekitSafeName("Matt's Bed 🛏️"), "Matt's Bed");
});

test("one side skips the anyone-in-bed sensor", () => {
  const found = discoverEightSleep(twoSides, parseSideOverrides("matt_s_eight_sleep_side=Matt"));
  assert.doesNotMatch(renderPackage(found, opts), /Anyone In Bed/);
  assert.ok(!bridgeEntities(found).some((e) => e.entityId.endsWith("anyone_in_bed")));
});

test("rejects a bedtime temperature outside the Pod range", () => {
  const found = discoverEightSleep(twoSides);
  assert.throws(() => renderPackage(found, { ...opts, bedtimeTemperature: 120 }), /outside the Pod range/);
  assert.throws(() => renderPackage(found, { ...opts, unit: "C", bedtimeTemperature: 68 }), /outside/);
});

test("publish picks the last finished night and maps units", () => {
  const days: SleepDay[] = [
    { day: "2026-11-05", score: 80, sleepDuration: 25200 },
    { day: "2026-11-06", score: 85, sleepDuration: 27000, deepDuration: 5400, tnt: 12,
      sleepQualityScore: { hrv: { current: 48.26 }, tempBedC: { average: 27.04 } } },
    { day: "2026-11-07", processing: true, sleepDuration: 3600 },
  ];
  const night = pickLastNight(days)!;
  assert.equal(night.day, "2026-11-06");
  const states = toStates(night);
  const get = (k: string) => states.find((s) => s.entityId === `sensor.eight_sleep_last_night_${k}`);
  assert.equal(get("score")?.state, "85");
  assert.equal(get("sleep")?.state, "7.5");
  assert.equal(get("deep")?.state, "1.5");
  assert.equal(get("hrv")?.state, "48.3");
  assert.equal(get("bed_temperature")?.attributes.device_class, "temperature");
  assert.equal(get("rem"), undefined);
  assert.equal(get("score")?.attributes.night_of, "2026-11-06");
});
