import { DatabaseManager, DatabaseManagerBot } from "../manager.js";
import { BotClusterManager } from "../../bot/manager.js";
import { Bot } from "../../bot/bot.js";
import { App } from "../../app.js";

type MetricsUpdateValue = `+${string | number}` | `-${string | number}` | string | number | Object
type MetricsUpdateObject<T extends MetricsEntry> = Record<keyof T["data"], MetricsUpdateValue>

type MetricsData = { [key: string]: any }
type MetricsType = "cooldown" | "guilds" | "users" | "chat"

interface MetricsEntry<T extends MetricsType = MetricsType, U extends MetricsData = MetricsData> {
    /* Type of metric */
    type: T;

    /* When this metric data was saved */
    time: string;

    /* The actual data, varies from type to type */
    data: U;
}

type CooldownMetricsEntry = MetricsEntry<"cooldown", {
    /* A cool-down entry for each command */
    [key: string]: number;

    /* Cool-down for chat messages */
    chat: number;
}>

type GuildsMetricsEntry = MetricsEntry<"cooldown", {
    /* To how many servers the bot was added */
    joins: number;

    /* How many servers removed the bot */
    leaves: number;

    /* How many servers the bot is in, in total */
    total: number;
}>

interface UserMetric {
    /* New users for this time frame */
    additional: number;

    /* Total amount of users now */
    total: number;
}

type UsersMetricsEntry = MetricsEntry<"users", {
    discord: UserMetric;
    db: UserMetric;
}>

type ChatMetricsEntry = MetricsEntry<"chat", {
    models: {
        [key: string]: number;
    };

    tones: {
        [key: string]: number;
    }
}>

export class DatabaseMetricsManager<T extends DatabaseManagerBot> {
    protected readonly db: DatabaseManager<T>;

    constructor(db: DatabaseManager<T>) {
        this.db = db;
    }
}

export class ClusterDatabaseMetricsManager extends DatabaseMetricsManager<Bot> {
    constructor(db: DatabaseManager<Bot>) {
        super(db);
    }

    public changeGuildsMetric(updates: Partial<MetricsUpdateObject<GuildsMetricsEntry>>): Promise<GuildsMetricsEntry["data"]> {
        return this.change("guilds", updates);
    }

    public changeUsersMetric(updates: Partial<MetricsUpdateObject<UsersMetricsEntry>>): Promise<UsersMetricsEntry["data"]> {
        return this.change("users", updates);
    }

    public changeCooldownMetric(updates: Partial<MetricsUpdateObject<CooldownMetricsEntry>>): Promise<CooldownMetricsEntry["data"]> {
        return this.change("cooldown", updates);
    }

    public changeChatMetric(updates: Partial<MetricsUpdateObject<ChatMetricsEntry>>): Promise<ChatMetricsEntry["data"]> {
        return this.change("chat", updates);
    }

    private async change<T extends MetricsEntry>(
        type: MetricsType, updates: Partial<MetricsUpdateObject<T>>
    ): Promise<T["data"]> {
        const result: T["data"] = await this.db.bot.client.cluster.evalOnManager(((manager: BotClusterManager, context: { type: MetricsType, updates: MetricsUpdateObject<T> }) =>
            manager.bot.app.db.metrics.change(context.type, context.updates)
        ) as any, {
            context: { type, updates }
        });

        return result;
    }

    public async save(): Promise<void> {
        await this.db.bot.client.cluster.evalOnManager((async (manager: BotClusterManager) =>
            await manager.bot.app.db.metrics.save()
        ) as any);
    }
}

export class AppDatabaseMetricsManager extends DatabaseMetricsManager<App> {
    /* Pending metric entries */
    private readonly pending: Map<MetricsType, MetricsData>;

    constructor(db: DatabaseManager<App>) {
        super(db);

        this.pending = new Map();
    }

    /**
     * Calculate/transform the given value for a metric.
     * 
     * @param type Type of metric
     * @param key Which key this value is for
     * @param existing The existing metric, if available
     * 
     * @returns New value for the key
     */
    private newValue<T extends MetricsType, U extends MetricsEntry>(
        type: T, key: keyof U["data"], value: MetricsUpdateValue, existing: U["data"] | null
    ): Object | string | number {
        if (typeof value === "string") {
            if ([ "+", "-" ].includes(value.slice(undefined, 1))) {
                /* Previous number value for this metric */
                const previousValue: number = existing !== null && existing[key] != undefined ? parseInt(existing[key].toString()) : 0;

                const operator: "+" | "-" = value.slice(undefined, 1) as any;
                const newNumber: string = value.slice(1);

                const updated: number = eval(`${previousValue} ${operator} ${newNumber}`);
                return updated;
            }

            return value;

        } else if (typeof value === "number") {
            return value;

        } else if (typeof value === "object") {
            const newObject: any = existing ? existing[key] : {};

            for (const [ objectKey, objectValue ] of Object.entries(value)) {
                newObject[objectKey] = this.newValue(
                    type, objectKey, objectValue as MetricsUpdateValue, newObject
                );
            }

            return newObject;
        }

        throw new Error("This shouldn't happen");
    }

    public change<T extends MetricsEntry>(
        type: MetricsType, updates: Partial<MetricsUpdateObject<T>>
    ): T["data"] {
        /* Existing metrics entry for this time frame */
        const existing: MetricsData | null = this.pending.get(type) ?? null;
        const updated: Partial<MetricsData> = existing ?? {};

        for (const [ key, updatedValue ] of Object.entries(updates)) {
            /* The new, formatted metric value */
            const newValue = this.newValue(type, key, updatedValue!, existing);
            updated[key] = newValue;
        }

        this.pending.set(type, updated);
        return updated;
    }

    /**
     * Save all queued metrics to the database.
     */
    public async save(): Promise<void> {
        /* If metrics are disabled, don't save them. */
        if (!this.db.bot.config.metrics) return;

        /* All new metric entries */
        const entries: MetricsEntry[] = [];

        for (const [ key, data ] of this.pending.entries()) {
            entries.push({
                type: key, time: new Date().toISOString(),
                data
            });
        }

        /* Insert the updated metric entries into the collection. */
        await this.db.client
            .from("metrics")
            .insert(entries);
    }
}