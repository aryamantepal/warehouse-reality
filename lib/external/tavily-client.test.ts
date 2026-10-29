import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisruptionBody } from "@/lib/run/api-schemas";
import { toDisruptionBody } from "./disruption-types";
import { searchFreightDisruptions } from "./tavily-client";

const hit = (title: string, content: string) => ({
  title,
  content,
  url: `https://news.example/${encodeURIComponent(title)}`,
  published_date: "2026-10-25",
});

const okFetch = (results: unknown[]) =>
  vi.fn(async () => Response.json({ results })) as unknown as typeof fetch;

const status = (code: number) =>
  vi.fn(
    async () => new Response("no", { status: code }),
  ) as unknown as typeof fetch;

describe("searchFreightDisruptions", () => {
  beforeEach(() => vi.stubEnv("TAVILY_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it('labels fixture results "illustrative", never live, with no key', async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const res = await searchFreightDisruptions(undefined, fetchFn);
    expect(res.source).toBe("illustrative");
    expect(res.fallbackReason).toMatch(/TAVILY_API_KEY/);
    expect(fetchFn).not.toHaveBeenCalled();
    for (const d of res.disruptions) {
      expect(d.title).toMatch(/^\[Illustrative\]/);
      expect(d.url).toBeNull();
      expect(toDisruptionBody(res.source, d).sources).toBeUndefined();
    }
  });

  it("maps weather and highway hits, drops unrelated ones, keeps the key in a header", async () => {
    const fetchFn = okFetch([
      hit("Tornado warning for Tarrant County", "Severe storm expected"),
      hit("I-35 lane closure in Dallas", "Traffic backed up"),
      hit("Port earnings beat estimates", "Revenue rose"),
    ]);
    const res = await searchFreightDisruptions("dfw", fetchFn);
    expect(res.source).toBe("tavily");
    expect(res.disruptions.map((d) => d.category)).toEqual([
      "weather",
      "highway",
    ]);
    const init = vi.mocked(fetchFn).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key",
    );
    expect(String(init.body)).not.toContain("test-key");
  });

  it("live results carry source URLs into DisruptionBody.sources", async () => {
    const res = await searchFreightDisruptions(
      undefined,
      okFetch([hit("Tornado warning for Tarrant County", "storm")]),
    );
    const body = toDisruptionBody(res.source, res.disruptions[0]);
    expect(DisruptionBody.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      type: "dock_closure",
      targetId: "D-108",
      sources: [
        {
          title: "Tornado warning for Tarrant County",
          url: expect.stringContaining("https://news.example/"),
        },
      ],
    });
  });

  it("states no quantity the source did not give", async () => {
    const res = await searchFreightDisruptions(
      undefined,
      okFetch([hit("I-35 crash", "traffic")]),
    );
    expect(res.disruptions[0].suggestedAction.impactHypothesis).toMatch(
      /unknown/,
    );
  });

  it("falls back to illustrative on HTTP errors, throws and empty matches", async () => {
    const boom = vi.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    for (const fetchFn of [
      status(500),
      boom,
      okFetch([hit("Earnings", "rose")]),
    ]) {
      const res = await searchFreightDisruptions(undefined, fetchFn);
      expect(res.source).toBe("illustrative");
    }
  });
});
