# eightsleep-consumer

Minimal Node CLI that exercises [`eightsleep-client`](../eightsleep-client). Authenticates, then prints a table of recent sleep days.

## Setup

```bash
npm install
cp .env.example .env
# fill in EIGHT_SLEEP_EMAIL / EIGHT_SLEEP_PASSWORD
```

## Run

```bash
npm run dev
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

## Dependency

This consumer pulls `eightsleep-client` from the sibling directory via `file:../eightsleep-client`. Run `npm run build` in that repo before installing here, or after pulling updates.
