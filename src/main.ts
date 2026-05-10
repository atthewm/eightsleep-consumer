import { EightSleep, EightSleepError } from "eightsleep-client";

const DEFAULT_TZ = "America/Chicago";
const DEFAULT_DAYS = 7;

interface Env {
  email: string;
  password: string;
  tz: string;
  days: number;
}

function loadEnv(): Env {
  const email = process.env.EIGHT_SLEEP_EMAIL;
  const password = process.env.EIGHT_SLEEP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing EIGHT_SLEEP_EMAIL or EIGHT_SLEEP_PASSWORD. Copy .env.example to .env and fill it in.",
    );
  }

  const days = Number.parseInt(process.env.EIGHT_SLEEP_DAYS ?? "", 10);

  return {
    email,
    password,
    tz: process.env.EIGHT_SLEEP_TZ || DEFAULT_TZ,
    days: Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatHours(seconds: number | null | undefined): string {
  if (seconds == null) return "  --  ";
  const hours = seconds / 3600;
  return `${hours.toFixed(2)}h`;
}

async function main(): Promise<void> {
  const env = loadEnv();

  const client = new EightSleep({
    email: env.email,
    password: env.password,
  });

  const userId = await client.whoAmI();
  console.log(`Authenticated as user ${userId}`);

  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (env.days - 1));

  const fromStr = isoDate(from);
  const toStr = isoDate(to);
  console.log(`Fetching trends ${fromStr} to ${toStr} (tz=${env.tz})`);

  const days = await client.getTrends({
    from: fromStr,
    to: toStr,
    tz: env.tz,
  });

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

main().catch((error: unknown) => {
  if (error instanceof EightSleepError) {
    console.error(`Eight Sleep API error (${error.status ?? "?"}): ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("Unexpected error:", error);
  }
  process.exit(1);
});
