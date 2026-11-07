# eightsleep-consumer

Node CLI built on [`eightsleep-client`](../eightsleep-client). It prints recent sleep days, and it connects the Pod to Apple Home through Home Assistant.

## Apple Home (HomeKit) through Home Assistant

`npm run ha:generate` reads your Home Assistant entities and writes a ready-to-install package and a dedicated HomeKit Bridge for the Pod: a thermostat per side (and pillow), in-bed sensors, a Wake Up sensor that turns on at your Eight Sleep alarm so Apple Home can run a morning scene, snooze and dismiss switches, per-alarm switches, and Bedtime and Off switches.

Setup, end to end: [docs/homekit.md](docs/homekit.md).

| Command | What it does |
|--|--|
| `npm run ha:check` | Checks `HA_URL` and `HA_TOKEN` |
| `npm run ha:discover` | Lists the Eight Sleep entities Home Assistant has |
| `npm run ha:generate` | Writes `homeassistant/eight_sleep_homekit.yaml` and `homeassistant/homekit_bridge.yaml` |
| `npm run ha:publish` | Pushes last night's sleep breakdown to `sensor.eight_sleep_last_night_*` |
| `npm run ha:watch` | Same, every `HA_PUBLISH_INTERVAL_MIN` minutes |
| `npm test` | Unit tests for discovery, YAML generation and publishing |

## Setup

```bash
npm install
cp .env.example .env
# fill in EIGHT_SLEEP_EMAIL / EIGHT_SLEEP_PASSWORD
```

## Run

```bash
npm run dev            # same as: node --env-file=.env dist/main.js trends
```

Output:

```
Authenticated as user <uuid>
Fetching trends 2026-05-04 to 2026-05-10 (tz=America/Chicago)

day         score  sleep    presence
----------  -----  -------  --------
2026-05-04   82     7.10h    7.85h
...
```

## Env vars

| Var | Default | Description |
|--|--|--|
| `EIGHT_SLEEP_EMAIL` | — | Account email |
| `EIGHT_SLEEP_PASSWORD` | — | Account password |
| `EIGHT_SLEEP_TZ` | `America/Chicago` | IANA timezone |
| `EIGHT_SLEEP_DAYS` | `7` | Lookback window (days) |
| `HA_URL` | — | Home Assistant URL, for the `ha:*` commands |
| `HA_TOKEN` | — | Home Assistant long-lived access token |

The `ha:check`, `ha:discover` and `ha:generate` commands only need `HA_URL` and `HA_TOKEN`. More options are in [docs/homekit.md](docs/homekit.md).

## Dependency

This consumer pulls `eightsleep-client` from the sibling directory via `file:../eightsleep-client`. Run `npm run build` in that repo before installing here, or after pulling updates.
