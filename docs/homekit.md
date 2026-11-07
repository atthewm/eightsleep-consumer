# Eight Sleep in Apple Home, through Home Assistant

This guide puts your Pod in the Apple Home app as a set of accessories on a
dedicated HomeKit Bridge, so Siri, Home scenes and Home automations can use it.

## What you get in Apple Home

| In Apple Home | Comes from | Use it for |
|--|--|--|
| **Matt Bed** (thermostat) | `climate.*_climate` per side | Turn a side on or off, set its temperature, Siri ("set Matt Bed to 68") |
| **Matt Pillow** (thermostat) | `climate.*_pillow`, Pod 5 pillow only | Same, for the pillow |
| **Matt In Bed** (occupancy sensor) | `binary_sensor.*_bed_presence` | Automations when you get in or out of bed |
| **Matt Wake Up** (occupancy sensor) | Generated. On at your Eight Sleep alarm time for 15 minutes | Trigger a morning scene from the Pod alarm |
| **Matt Up For The Day** (occupancy sensor) | Generated. On when you leave the bed for 10 minutes between 4 AM and noon | A morning scene that ignores snoozes and bathroom trips at night |
| **Anyone In Bed** (occupancy sensor) | Generated, only with two sides | "Last one into bed" automations |
| **Matt Bed Temperature**, **Eight Sleep Room Temperature** (temperature sensors) | `sensor.*_bed_temperature`, hub `*_room_temperature` | Readouts, and conditions in automations |
| **Matt Snooze Alarm**, **Matt Dismiss Alarm** (switches) | Integration buttons | Snooze or stop the alarm from the Home app or Siri |
| **Matt Alarm 1, 2, ...** (switches) | One per alarm on the Eight Sleep account | Turn individual alarms on or off |
| **Eight Sleep Bedtime** (switch) | Generated script | Turns on every side at your bedtime temperature. Add it to a "Good Night" scene |
| **Eight Sleep Off** (switch) | Generated script | Turns off every side and pillow |
| **Bed Base Preset** (power strip) | Base only | Sleep, relaxing and reading presets |

Apple Home has no accessory type for a sleep score, HRV or a duration, so those
stay in Home Assistant (see `ha:publish` below).

## Before you start

- Home Assistant 2025.1.1 or newer (the Eight Sleep integration requires it).
- [HACS](https://hacs.xyz/) installed in Home Assistant.
- Node 20.6 or newer on the computer where you run this repo, with
  `eightsleep-client` built in the sibling folder (see the main README).

## Steps

### 1. Install the Eight Sleep integration in Home Assistant

1. In HACS, open the menu, choose **Custom repositories**, and add
   `https://github.com/lukas-clarke/eight_sleep` as an **Integration**.
2. Search HACS for **Eight Sleep**, install it, and restart Home Assistant.
3. **Settings > Devices & services > Add integration > Eight Sleep**, then sign
   in with your Eight Sleep account. Make sure neither side is in Away mode
   while you set it up.

You should now see one device per side, named like "Matt's Eight Sleep Side".

### 2. Make a Home Assistant token

In Home Assistant, open your profile (bottom left), **Security**, then
**Long-lived access tokens > Create token**. Copy it.

### 3. Point this repo at Home Assistant

Add these to `.env` (see `.env.example`):

```bash
HA_URL=http://homeassistant.local:8123
HA_TOKEN=paste-the-token-here
```

Then check the connection and see what was found:

```bash
npm run ha:check
npm run ha:discover
```

`ha:discover` lists each side and its entities. If it finds nothing because
you renamed the entities, tell it the prefix of each side, for example
`HA_EIGHT_SLEEP_SIDES=matt_s_eight_sleep_side=Matt,guest_s_eight_sleep_side=Guest`.

### 4. Generate the Home Assistant files

```bash
npm run ha:generate
```

This writes two files to `./homeassistant/`, using your real entity ids:

- `eight_sleep_homekit.yaml`: the helper sensors and the two scripts.
- `homekit_bridge.yaml`: a dedicated HomeKit Bridge with only the Eight Sleep
  accessories and their Apple Home names.

Options, all optional, in `.env`:

| Var | Default | What it does |
|--|--|--|
| `HA_BEDTIME_TEMPERATURE` | `68` (°F) or `20` (°C) | Temperature the Bedtime switch sets |
| `HA_WAKE_UP_MINUTES` | `15` | How long Wake Up stays on after the alarm time |
| `HA_HOMEKIT_PORT` | `21065` | Bridge port. Must differ from any other HomeKit Bridge (the first one uses 21064) |
| `HA_OUTPUT_DIR` | `./homeassistant` | Where the files go |

The generated folder is in `.gitignore` because it contains your entity ids.

### 5. Install the files in Home Assistant

Use the File editor or Studio Code Server add-on, or Samba.

1. Copy `eight_sleep_homekit.yaml` to `/config/packages/`.
2. If `configuration.yaml` does not load packages yet, add:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
3. Paste the contents of `homekit_bridge.yaml` into `configuration.yaml`.
   If it already has a `homekit:` key, add the `- name: "Eight Sleep Bridge"`
   item under that key instead of adding a second `homekit:` key.
4. **Developer tools > YAML > Check configuration**, then restart Home Assistant.

### 6. Pair the bridge with Apple Home

1. After the restart, open Home Assistant **Notifications**. The HomeKit
   integration posts a notification with the pairing QR code and PIN for
   "Eight Sleep Bridge".
2. In the Home app: **+ > Add Accessory**, scan the code, and assign the
   accessories to your bedroom.

If your existing HomeKit Bridge already includes the climate, binary sensor,
button or switch domains, the Pod will show up twice. Exclude the Eight Sleep
entities from that bridge: **Settings > Devices & services > HomeKit Bridge >
Configure** on the existing bridge.

### 7. Build the morning automation in Apple Home

1. Home app: **Automation > + > A Sensor Detects Something**.
2. Pick **Matt Wake Up**, **Detects Occupancy**.
3. Choose the scene or accessories: for example bedroom lights on and the
   thermostat to 73.

Use **Matt Up For The Day** instead if you want the scene only once you are
actually out of bed.

## Changing things later

- Re-run `npm run ha:generate` after you add an alarm in the Eight Sleep app
  (each alarm is its own switch) or add a pillow, then copy the files again and
  restart Home Assistant.
- HomeKit caches accessory names. To pick up a new name, remove that accessory
  from the bridge and add it back, or reset the bridge.

## Optional: last night's sleep in Home Assistant

```bash
npm run ha:publish        # once
npm run ha:watch          # every HA_PUBLISH_INTERVAL_MIN minutes (default 60)
```

This pushes the finished night's breakdown from the Eight Sleep trends API as
`sensor.eight_sleep_last_night_*`: score, time asleep, time in bed, deep, REM
and light sleep, toss and turns, HRV, breath rate, routine score, and the
average bed and room temperature. It needs `EIGHT_SLEEP_EMAIL` and
`EIGHT_SLEEP_PASSWORD` as well.

These sensors are pushed through the REST API, so they have no unique id and
disappear on a Home Assistant restart until the next push. Use them for
dashboards and HA automations. They are not in the bridge by default; the two
temperature ones can be added to `include_entities` if you want them in Apple
Home.

## Limits

- Eight Sleep has no public API. Both the HACS integration and this repo use the
  app's private API, which Eight Sleep can change.
- Wake Up fires at the time in the integration's Next Alarm sensor. If the Pod
  starts waking you earlier with thermal or smart wake, the scene runs at that
  reported time, not when the warming starts.
- The integration polls the cloud, so bed presence can lag by up to its
  polling interval.
