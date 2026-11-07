import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EightSleep, EightSleepError, type SleepDay } from "eightsleep-client";
import { HomeAssistant, HomeAssistantError } from "./ha/api.js";
import { describeDiscovery, discoverEightSleep, parseSideOverrides } from "./ha/discover.js";
import { pickLastNight, toStates } from "./ha/publish.js";
import {
  DEFAULT_RENDER_OPTIONS,
  bridgeEntities,
  renderBridge,
  renderPackage,
  type RenderOptions,
  type TempUnit,
} from "./ha/render.js";

const DEFAULT_TZ = "America/Chicago";
const DEFAULT_DAYS = 7;

const USAGE = `Usage: node --env-file=.env dist/main.js <command>

Commands:
  trends        Print recent nightly sleep (default)
  ha:check      Check the Home Assistant URL and token
  ha:discover   List the Eight Sleep entities Home Assistant has
  ha:generate   Write the HomeKit package and bridge YAML to ./homeassistant
  ha:publish    Push last night's sleep breakdown to Home Assistant sensors
                (add --watch to repeat every HA_PUBLISH_INTERVAL_MIN minutes)
`;

// ─── Env ─────────────────────────────────────────────────────────────────────

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return v;
}

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function eightSleepClient(): EightSleep {
  return new EightSleep({
    email: required("EIGHT_SLEEP_EMAIL"),
    password: required("EIGHT_SLEEP_PASSWORD"),
  });
}

function homeAssistant(): HomeAssistant {
  return new HomeAssistant({ url: required("HA_URL"), token: required("HA_TOKEN") });
}

const tz = () => process.env.EIGHT_SLEEP_TZ || DEFAULT_TZ;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatHours(seconds: number | null | undefined): string {
  if (seconds == null) return "  --  ";
  return `${(seconds / 3600).toFixed(2)}h`;
}

async function fetchDays(client: EightSleep, days: number): Promise<SleepDay[]> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return client.getTrends({ from: isoDate(from), to: isoDate(to), tz: tz() });
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function trends(): Promise<void> {
  const client = eightSleepClient();
  const userId = await client.whoAmI();
  console.log(`Authenticated as user ${userId}`);

  const window = intEnv("EIGHT_SLEEP_DAYS", DEFAULT_DAYS);
  console.log(`Fetching the last ${window} days (tz=${tz()})`);
  const days = await fetchDays(client, window);

  if (days.length === 0) {
    console.log("No sleep days returned.");
    return;
  }

  console.log("");
  console.log("day         score  sleep    presence");
  console.log("----------  -----  -------  --------");
  for (const d of days) {
    const score = d.score != null ? String(d.score).padStart(3) : " --";
    const sleep = formatHours(d.sleepDuration).padStart(7);
    const presence = formatHours(d.presenceDuration).padStart(8);
    console.log(`${d.day}   ${score}    ${sleep}  ${presence}`);
  }
}

async function haCheck(): Promise<void> {
  const ha = homeAssistant();
  const ping = await ha.ping();
  const config = await ha.getConfig();
  console.log(`${ping.message ?? "Connected."} Home Assistant ${config.version ?? "?"}`);
  console.log(`Temperature unit: ${config.unit_system?.temperature ?? "?"}`);
}

async function discover() {
  const ha = homeAssistant();
  const [states, config] = await Promise.all([ha.getStates(), ha.getConfig()]);
  const found = discoverEightSleep(states, parseSideOverrides(process.env.HA_EIGHT_SLEEP_SIDES));
  const unit: TempUnit = config.unit_system?.temperature === "°C" ? "C" : "F";
  return { found, unit };
}

async function haDiscover(): Promise<void> {
  const { found } = await discover();
  console.log(describeDiscovery(found));
}

async function haGenerate(): Promise<void> {
  const { found, unit } = await discover();
  console.log(describeDiscovery(found));
  if (found.sides.length === 0) process.exit(1);

  const fallbackTemp = unit === "F" ? DEFAULT_RENDER_OPTIONS.bedtimeTemperature : 20;
  const opts: RenderOptions = {
    ...DEFAULT_RENDER_OPTIONS,
    unit,
    bedtimeTemperature: intEnv("HA_BEDTIME_TEMPERATURE", fallbackTemp),
    wakeUpMinutes: intEnv("HA_WAKE_UP_MINUTES", DEFAULT_RENDER_OPTIONS.wakeUpMinutes),
    bridgePort: intEnv("HA_HOMEKIT_PORT", DEFAULT_RENDER_OPTIONS.bridgePort),
    generatedAt: new Date().toISOString().slice(0, 10),
  };

  const outDir = resolve(process.env.HA_OUTPUT_DIR || "homeassistant");
  await mkdir(outDir, { recursive: true });
  const pkg = join(outDir, "eight_sleep_homekit.yaml");
  const bridge = join(outDir, "homekit_bridge.yaml");
  await writeFile(pkg, renderPackage(found, opts));
  await writeFile(bridge, renderBridge(found, opts));

  console.log("");
  console.log(`Wrote ${pkg}`);
  console.log(`Wrote ${bridge}`);
  console.log(`The bridge exposes ${bridgeEntities(found).length} accessories (HomeKit allows 150 per bridge).`);
  console.log("Next: follow docs/homekit.md to install both files and pair the bridge.");
}

async function publishOnce(client: EightSleep, ha: HomeAssistant): Promise<void> {
  const night = pickLastNight(await fetchDays(client, 3));
  if (!night) {
    console.log("No finished night in the last 3 days. Nothing published.");
    return;
  }
  const states = toStates(night);
  for (const s of states) await ha.setState(s.entityId, s.state, s.attributes);
  console.log(`${new Date().toISOString()} published ${states.length} sensors for the night of ${night.day}`);
}

async function haPublish(watch: boolean): Promise<void> {
  const client = eightSleepClient();
  const ha = homeAssistant();
  await publishOnce(client, ha);
  if (!watch) return;

  const minutes = intEnv("HA_PUBLISH_INTERVAL_MIN", 60);
  console.log(`Watching: publishing every ${minutes} minutes. Ctrl+C to stop.`);
  setInterval(() => {
    publishOnce(client, ha).catch(report);
  }, minutes * 60_000);
}

// ─── Entry ───────────────────────────────────────────────────────────────────

function report(error: unknown): void {
  if (error instanceof EightSleepError) {
    console.error(`Eight Sleep API error (${error.status ?? "?"}): ${error.message}`);
  } else if (error instanceof HomeAssistantError) {
    console.error(`Home Assistant error (${error.status ?? "?"}): ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("Unexpected error:", error);
  }
}

async function main(argv: string[]): Promise<void> {
  const [command = "trends", ...flags] = argv;
  switch (command) {
    case "trends":
      return trends();
    case "ha:check":
      return haCheck();
    case "ha:discover":
      return haDiscover();
    case "ha:generate":
      return haGenerate();
    case "ha:publish":
      return haPublish(flags.includes("--watch"));
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(USAGE);
      process.exit(2);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  report(error);
  process.exit(1);
});
