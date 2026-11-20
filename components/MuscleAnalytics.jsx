"use client";

import { useEffect, useState } from "react";
import MuscleAnatomy from "./MuscleAnatomy";
import { aggregateMuscles } from "../lib/muscle-analytics.mjs";

export default function MuscleAnalytics({ studentId, planId, draftEntries, catalog = [] }) {
  const [mode, setMode] = useState("planned");
  const [days, setDays] = useState(7);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (draftEntries) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ mode, days: String(days) });
    if (studentId) params.set("studentId", studentId);
    if (planId) params.set("planId", planId);
    setState({ loading: true });
    fetch(`/api/muscle-analytics?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha na consulta muscular.");
        return body;
      })
      .then((data) => { if (!controller.signal.aborted) setState({ data }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [studentId, planId, mode, days, draftEntries]);

  const data = draftEntries ? aggregateMuscles(draftEntries, catalog, { mode: "planned" }) : state.data;
  return <MuscleAnatomy
    groups={data?.groups || []}
    restrictions={data?.restrictions || []}
    totals={data?.totals}
    mode={mode}
    onModeChange={setMode}
    days={days}
    onDaysChange={setDays}
    isDraft={Boolean(draftEntries)}
    loading={!draftEntries && state.loading}
    error={!draftEntries && state.error}
  />;
}
