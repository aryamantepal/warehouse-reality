"use client";

import { useState } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import {
  type ScoutResponse,
  ScoutResponse as ScoutResponseSchema,
} from "@/lib/external/disruption-types";
import {
  ILLUSTRATIVE_INJECTION_NOTE,
  toDisruptionBody,
} from "@/lib/external/to-disruption-body";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import { ProvenanceBadge } from "./provenance-badge";

// The D-108 scenario trailer an external delay applies to (scenario value).
const TARGET_TRAILER = "T-2291";

interface NewsScoutProps {
  onInject: (body: DisruptionBody) => void;
}

type ScoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; response: ScoutResponse };

export const NewsScout = ({ onInject }: NewsScoutProps) => {
  const [state, setState] = useState<ScoutState>({ status: "idle" });

  const search = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/disruptions/live", { method: "POST" });
      if (res.status === 429) {
        setState({
          status: "error",
          message: "Rate limited, try again shortly.",
        });
        return;
      }
      const parsed = ScoutResponseSchema.safeParse(await res.json());
      setState(
        parsed.success
          ? { status: "ready", response: parsed.data }
          : {
              status: "error",
              message: "Search returned an unexpected reply.",
            },
      );
    } catch {
      setState({ status: "error", message: "Search failed." });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-sky-500/40 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">News scout (Tavily)</span>
        <TextureButton
          variant="minimal"
          size="sm"
          className="w-auto"
          disabled={state.status === "loading"}
          onClick={search}
        >
          {state.status === "loading" ? "Searching…" : "Search news"}
        </TextureButton>
      </div>
      {state.status === "error" && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            {state.response.source === "external_search"
              ? "Live search results. Context only, not evidence this facility was hit."
              : `Illustrative examples, not a live search (${state.response.reason}).`}
          </p>
          {state.response.results.map((r) => (
            <div
              key={r.id}
              className="rounded border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-medium">{r.title}</span>
                <ProvenanceBadge kind="hyp">
                  {r.label === "external_search"
                    ? "external_search"
                    : "illustrative"}
                </ProvenanceBadge>
              </div>
              <p className="mb-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                {r.impactHypothesis}
              </p>
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-1 block truncate text-[11px] text-sky-600 underline dark:text-sky-400"
                >
                  {r.url}
                </a>
              ) : (
                <p className="mb-1 text-[11px] italic text-zinc-500">
                  {ILLUSTRATIVE_INJECTION_NOTE}
                </p>
              )}
              <TextureButton
                variant="destructive"
                size="sm"
                onClick={() => onInject(toDisruptionBody(r, TARGET_TRAILER))}
              >
                Inject as external delay · {TARGET_TRAILER}
              </TextureButton>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
