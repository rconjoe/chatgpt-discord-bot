import { GPTAPIError } from "../error/gpt/api.js";
import { Bot } from "../bot/bot.js";

type TuringAPIPath = `cache/${string}` | "imgs/filter"

interface TuringAPIFilterResult {
    isNsfw: boolean;
    isYoung: boolean;
    isCP: boolean;
}

export class TuringAPI {
    private readonly bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

    public async setCache(key: string, value: string): Promise<void> {
        return void await this.request(`cache/${key}`, "POST", { value });
    }

    public async getCache(key: string): Promise<string> {
        const { response }: { response: string } = await this.request(`cache/${key}`, "GET");
        return response;
    }

    public async filter(prompt: string, model: string): Promise<TuringAPIFilterResult> {
        return this.request("imgs/filter", "POST", {
            prompt, model
        });
    }

    private async request<T>(path: TuringAPIPath, method: "GET" | "POST" | "DELETE" = "GET", data?: { [key: string]: any }): Promise<T> {
        /* Make the actual request. */
        const response = await fetch(this.url(path), {
            method,
            
            body: data !== undefined ? JSON.stringify(data) : undefined,
            headers: this.headers()
        });

        /* If the request wasn't successful, throw an error. */
        if (!response.status.toString().startsWith("2")) await this.error(response, path);

        /* Get the response body. */
        const body: T = await response.json() as T;
        return body;
    }

    private url(path: TuringAPIPath): string {
        return `https://api.turingai.tech/${path}`;
    }

    private async error(response: Response, path: TuringAPIPath): Promise<void> {
        const body: any | null = await response.json().catch(() => null);
    
        throw new GPTAPIError({
            code: response.status,
            endpoint: `/${path}`,
            id: null,
            message: body !== null && body.error ? body.error : null
        });
    }

    private headers(): HeadersInit {
        return {
            Authorization: `Bearer ${this.bot.app.config.turing.key}`,
            "x-captcha-token": this.bot.app.config.turing.captchas.turnstile,
            "Content-Type": "application/json"
        };
    }
}