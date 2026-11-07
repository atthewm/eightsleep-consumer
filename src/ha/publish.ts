/**
 * Turn Eight Sleep nightly trends into Home Assistant sensor states.
 *
 * The HACS integration already reports live values (presence, bed temperature,
 * current scores). What it does not report is the finished-night breakdown the
 * trends endpoint returns: deep, REM and light sleep, toss-and-turns, and the
 * night's averages. `ha:publish` pushes those as `sensor.eight_sleep_last_night_*`
 * so they can drive dashboards and HA automations.
 *
 * Two of them (average bed and room temperature) carry the `temperature`
 * device class, so a HomeKit Bridge can show them. Apple Home has no accessory
 * type for a sleep score or a duration, so the rest stay in Home Assistant.
 */

import type { SleepDay } from "eightsleep-client";

export interface PublishedState {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
}

const PREFIX = "sensor.eight_sleep_last_night";

/** Latest day with a finished score, or the latest day with any sleep. */
export function pickLastNight(days: SleepDay[]): SleepDay | undefined {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const scored = sorted.filter((d) => d.score != null && !d.processing);
  return scored.at(-1) ?? sorted.filter((d) => (d.sleepDuration ?? 0) > 0).at(-1);
}

const hours = (s: number | undefined) => (s == null ? undefined : Math.round((s / 3600) * 100) / 100);
const round1 = (n: number | undefined) => (n == null ? undefined : Math.round(n * 10) / 10);

export function toStates(day: SleepDay): PublishedState[] {
  const q = day.sleepQualityScore;
  const common = { night_of: day.day, attribution: "Eight Sleep trends via eightsleep-consumer" };

  const rows: Array<{
    key: string;
    name: string;
    value: number | undefined;
    unit?: string;
    deviceClass?: string;
    icon: string;
  }> = [
    { key: "score", name: "Last Night Sleep Score", value: day.score, unit: "%", icon: "mdi:sleep" },
    { key: "sleep", name: "Last Night Time Asleep", value: hours(day.sleepDuration), unit: "h", deviceClass: "duration", icon: "mdi:bed-clock" },
    { key: "in_bed", name: "Last Night Time In Bed", value: hours(day.presenceDuration), unit: "h", deviceClass: "duration", icon: "mdi:bed" },
    { key: "deep", name: "Last Night Deep Sleep", value: hours(day.deepDuration), unit: "h", deviceClass: "duration", icon: "mdi:waves" },
    { key: "rem", name: "Last Night REM Sleep", value: hours(day.remDuration), unit: "h", deviceClass: "duration", icon: "mdi:eye" },
    { key: "light", name: "Last Night Light Sleep", value: hours(day.lightDuration), unit: "h", deviceClass: "duration", icon: "mdi:weather-night" },
    { key: "toss_and_turn", name: "Last Night Toss And Turns", value: day.tnt, icon: "mdi:rotate-3d-variant" },
    { key: "hrv", name: "Last Night HRV", value: round1(q?.hrv?.current), unit: "ms", icon: "mdi:heart-pulse" },
    { key: "breath_rate", name: "Last Night Breath Rate", value: round1(q?.respiratoryRate?.current), unit: "br/min", icon: "mdi:lungs" },
    { key: "bed_temperature", name: "Last Night Bed Temperature", value: round1(q?.tempBedC?.average), unit: "°C", deviceClass: "temperature", icon: "mdi:thermometer" },
    { key: "room_temperature", name: "Last Night Room Temperature", value: round1(q?.tempRoomC?.average), unit: "°C", deviceClass: "temperature", icon: "mdi:home-thermometer" },
    { key: "routine_score", name: "Last Night Routine Score", value: day.sleepRoutineScore?.total?.score, unit: "%", icon: "mdi:calendar-check" },
  ];

  return rows
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .map((r) => ({
      entityId: `${PREFIX}_${r.key}`,
      state: String(r.value),
      attributes: {
        ...common,
        friendly_name: `Eight Sleep ${r.name}`,
        icon: r.icon,
        state_class: "measurement",
        ...(r.unit ? { unit_of_measurement: r.unit } : {}),
        ...(r.deviceClass ? { device_class: r.deviceClass } : {}),
      },
    }));
}
