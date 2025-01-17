import { DatabaseCampaign, PartialDatabaseCampaign } from "../managers/campaign.js";
import { type AppDatabaseManager } from "../app.js";
import { DatabaseSchema } from "./schema.js";
import { Awaitable } from "discord.js";

export class CampaignSchema extends DatabaseSchema<DatabaseCampaign, PartialDatabaseCampaign> {
    constructor(db: AppDatabaseManager) {
        super(db, {
            collection: "campaigns"
        });
    }

    public template(id: string, source?: PartialDatabaseCampaign | undefined): Awaitable<DatabaseCampaign | null> {
        if (!source) return null;

        return {
            stats: { clicks: { geo: {}, total: 0 } }, active: false, 
            ...source
        };
    }
}