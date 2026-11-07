/**
 * Minimal Home Assistant REST API client.
 *
 * Uses a long-lived access token (HA profile page -> Security -> Long-lived
 * access tokens). Only the endpoints this tool needs are wrapped:
 *
 *   GET  /api/                 connection check
 *   GET  /api/config           version and unit system
 *   GET  /api/states           every entity state (used for discovery)
 *   POST /api/states/<entity>  create or update a state (used by `ha:publish`)
 */

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HaConfig {
  version?: string;
  location_name?: string;
  time_zone?: string;
  unit_system?: { temperature?: string };
}

export class HomeAssistantError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HomeAssistantError";
    this.status = status;
  }
}

export interface HomeAssistantOptions {
  /** Base URL, e.g. `http://homeassistant.local:8123`. No trailing `/api`. */
  url: string;
  /** Long-lived access token. */
  token: string;
}

export class HomeAssistant {
  private base: string;
  private token: string;

  constructor(opts: HomeAssistantOptions) {
    if (!opts.url || !opts.token) {
      throw new HomeAssistantError("Home Assistant url and token are required");
    }
    this.base = opts.url.replace(/\/+$/, "").replace(/\/api$/, "");
    this.token = opts.token;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new HomeAssistantError(
        `Home Assistant ${method} ${path} ${res.status}: ${await res.text()}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  /** Returns `{ message: "API running." }` when the URL and token work. */
  async ping(): Promise<{ message?: string }> {
    return this.request("GET", "/api/");
  }

  async getConfig(): Promise<HaConfig> {
    return this.request("GET", "/api/config");
  }

  async getStates(): Promise<HaState[]> {
    return this.request("GET", "/api/states");
  }

  /**
   * Create or update a state. States set this way have no unique_id, are not
   * in the entity registry, and are cleared on HA restart until the next push.
   */
  async setState(
    entityId: string,
    state: string,
    attributes: Record<string, unknown>,
  ): Promise<HaState> {
    return this.request("POST", `/api/states/${entityId}`, { state, attributes });
  }
}
