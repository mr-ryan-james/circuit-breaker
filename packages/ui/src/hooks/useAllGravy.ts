import React from "react";

import { callAction } from "@/api/client";
import type { AllGravyPrFilter, AllGravyPrRow, AllGravyProposalRow, BrainDefault } from "@/app/types";
import type { WsMessage } from "@/ws/client";

type PatchesPayload = {
  patches?: Record<string, { patch?: string; numbered_lines?: string[] }>;
  omitted?: string[];
};

export function useAllGravy() {
  const [reposText, setReposText] = React.useState<string>("");
  const [repos, setRepos] = React.useState<string[]>([]);
  const [brain, setBrain] = React.useState<BrainDefault>("codex");
  const [filter, setFilter] = React.useState<AllGravyPrFilter>("review_requested");
  const [sinceDays, setSinceDays] = React.useState<number>(7);
  const [excludeBots, setExcludeBots] = React.useState<boolean>(true);

  const [loadingSettings, setLoadingSettings] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [generatingForPr, setGeneratingForPr] = React.useState<Record<string, boolean>>({});
  const [applyingProposal, setApplyingProposal] = React.useState<Record<string, boolean>>({});
  const [approvingPr, setApprovingPr] = React.useState<Record<string, boolean>>({});

  const [runId, setRunId] = React.useState<string | null>(null);
  const [prs, setPrs] = React.useState<AllGravyPrRow[]>([]);
  const [queueErrors, setQueueErrors] = React.useState<Array<{ repo: string; error: string }>>([]);

  const [selectedPrId, setSelectedPrId] = React.useState<string | null>(null);
  const [selectedPr, setSelectedPr] = React.useState<AllGravyPrRow | null>(null);
  const [selectedPatches, setSelectedPatches] = React.useState<PatchesPayload | null>(null);
  const [selectedProposals, setSelectedProposals] = React.useState<AllGravyProposalRow[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const selectedPrIdRef = React.useRef<string | null>(null);
  const selectedProposalsRef = React.useRef<AllGravyProposalRow[]>([]);
  const wsRefreshStateRef = React.useRef<{ timer: number | null; inFlight: boolean; queuedPrId: string | null }>({
    timer: null,
    inFlight: false,
    queuedPrId: null,
  });

  React.useEffect(() => {
    selectedPrIdRef.current = selectedPrId;
  }, [selectedPrId]);

  React.useEffect(() => {
    selectedProposalsRef.current = selectedProposals;
  }, [selectedProposals]);

  const clearSelectedPr = React.useCallback((): void => {
    setSelectedPrId(null);
    setSelectedPr(null);
    setSelectedPatches(null);
    setSelectedProposals([]);
  }, []);

  function parseReposTextToList(input: string): string[] {
    return input
      .split(/[\n,]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function loadSettings(): Promise<void> {
    setError(null);
    setLoadingSettings(true);
    try {
      const [r, b, f, s, eb] = await Promise.all([
        callAction<any>("allgravy.repos.get", {}),
        callAction<any>("allgravy.brain.get", {}),
        callAction<any>("allgravy.filter.get", {}),
        callAction<any>("allgravy.since.get", {}),
        callAction<any>("allgravy.exclude_bots.get", {}),
      ]);
      if (r?.ok && Array.isArray(r.repos)) {
        const list = r.repos.map(String).map((s: string) => s.trim()).filter(Boolean);
        setRepos(list);
        setReposText(list.join("\n"));
      }
      if (b?.ok && (b.brain === "codex" || b.brain === "claude")) {
        setBrain(b.brain);
      }
      if (f?.ok && (f.filter === "review_requested" || f.filter === "all_by_others" || f.filter === "all_open")) {
        setFilter(f.filter);
      }
      if (s?.ok && typeof s.since_days === "number" && Number.isFinite(s.since_days)) {
        setSinceDays(s.since_days);
      }
      if (eb?.ok && typeof eb.exclude_bots === "boolean") {
        setExcludeBots(eb.exclude_bots);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSettings(false);
    }
  }

  async function saveReposFromText(): Promise<boolean> {
    setError(null);
    const list = parseReposTextToList(reposText);
    if (list.length === 0) {
      setError("Repo list is empty.");
      return false;
    }
    const res = await callAction<any>("allgravy.repos.set", { repos: list });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to save repos"));
      return false;
    }
    const normalized = Array.isArray(res.repos) ? res.repos.map(String) : list;
    setRepos(normalized);
    setReposText(normalized.join("\n"));
    return true;
  }

  async function saveBrain(next: BrainDefault): Promise<boolean> {
    setError(null);
    setBrain(next);
    const res = await callAction<any>("allgravy.brain.set", { brain: next });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to set brain"));
      return false;
    }
    return true;
  }

  async function saveFilter(next: AllGravyPrFilter): Promise<boolean> {
    setError(null);
    setFilter(next);
    const res = await callAction<any>("allgravy.filter.set", { filter: next });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to set filter"));
      return false;
    }
    return true;
  }

  async function saveSinceDays(next: number): Promise<boolean> {
    if (!Number.isFinite(next) || next < 1 || next > 365) return false;
    setError(null);
    setSinceDays(next);
    const res = await callAction<any>("allgravy.since.set", { since_days: Math.round(next) });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to set since days"));
      return false;
    }
    return true;
  }

  async function saveExcludeBots(next: boolean): Promise<boolean> {
    setError(null);
    setExcludeBots(next);
    const res = await callAction<any>("allgravy.exclude_bots.set", { exclude_bots: next });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to set exclude bots"));
      return false;
    }
    return true;
  }

  const loadLatestQueue = React.useCallback(async (): Promise<void> => {
    setError(null);
    const res = await callAction<any>("allgravy.prs.latest", {});
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to load latest queue"));
      return;
    }
    setRunId(res.run_id ?? null);
    setPrs((res.prs ?? []) as AllGravyPrRow[]);
  }, []);

  async function refreshQueue(): Promise<void> {
    setError(null);
    setRefreshing(true);
    try {
      const res = await callAction<any>("allgravy.queue.refresh", {});
      if (!res?.ok) {
        setError(String(res?.error ?? "Failed to refresh queue"));
        return;
      }
      setRunId(res.run_id ?? null);
      setPrs((res.prs ?? []) as AllGravyPrRow[]);
      setQueueErrors(Array.isArray(res.errors) ? res.errors : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  const loadPrBundle = React.useCallback(
    async (
      prId: string,
      opts?: { silent?: boolean },
    ): Promise<{ pr: AllGravyPrRow; patches: PatchesPayload | null; proposals: AllGravyProposalRow[] } | null> => {
      const [prRes, ctx, props] = await Promise.all([
        callAction<any>("allgravy.pr.get", { pr_id: prId }),
        callAction<any>("allgravy.pr.context", { pr_id: prId }),
        callAction<any>("allgravy.proposals.list", { pr_id: prId }),
      ]);

      if (!prRes?.ok) {
        if (!opts?.silent) setError(String(prRes?.error ?? "Failed to load PR"));
        return null;
      }

      const patches = ctx?.ok ? (ctx.patches as PatchesPayload) : null;
      const proposals = props?.ok && Array.isArray(props.proposals) ? (props.proposals as AllGravyProposalRow[]) : [];
      return { pr: prRes.pr as AllGravyPrRow, patches, proposals };
    },
    [],
  );

  const selectPr = React.useCallback(
    async (prId: string): Promise<void> => {
      setError(null);
      selectedPrIdRef.current = prId;
      setSelectedPrId(prId);
      setSelectedPr(null);
      setSelectedPatches(null);
      setSelectedProposals([]);

      const next = await loadPrBundle(prId);
      if (!next) return;
      // Ignore stale response if user switched selection while request was in flight.
      if (selectedPrIdRef.current !== prId) return;
      setSelectedPr(next.pr);
      setSelectedPatches(next.patches);
      setSelectedProposals(next.proposals);
    },
    [loadPrBundle],
  );

  const refreshSelectedPrFromServer = React.useCallback(
    async (prId: string): Promise<void> => {
      const next = await loadPrBundle(prId, { silent: true });
      if (!next) return;
      if (selectedPrIdRef.current !== prId) return;
      setSelectedPr(next.pr);
      setSelectedPatches(next.patches);
      setSelectedProposals(next.proposals);
      setPrs((prev) => prev.map((p) => (p.id === prId ? next.pr : p)));
    },
    [loadPrBundle],
  );

  const flushQueuedSelectedPrRefresh = React.useCallback(async (): Promise<void> => {
    const state = wsRefreshStateRef.current;
    if (state.inFlight) return;

    const prId = state.queuedPrId;
    state.queuedPrId = null;
    if (!prId) return;

    state.inFlight = true;
    try {
      await refreshSelectedPrFromServer(prId);
    } finally {
      state.inFlight = false;
      if (state.queuedPrId && state.timer === null) {
        state.timer = window.setTimeout(() => {
          wsRefreshStateRef.current.timer = null;
          void flushQueuedSelectedPrRefresh();
        }, 120);
      }
    }
  }, [refreshSelectedPrFromServer]);

  const scheduleSelectedPrRefresh = React.useCallback(
    (prId: string | null | undefined): void => {
      const id = String(prId ?? "").trim();
      if (!id) return;

      const state = wsRefreshStateRef.current;
      state.queuedPrId = id;
      if (state.timer !== null) return;

      state.timer = window.setTimeout(() => {
        wsRefreshStateRef.current.timer = null;
        void flushQueuedSelectedPrRefresh();
      }, 180);
    },
    [flushQueuedSelectedPrRefresh],
  );

  React.useEffect(() => {
    return () => {
      const t = wsRefreshStateRef.current.timer;
      if (t !== null) window.clearTimeout(t);
      wsRefreshStateRef.current.timer = null;
    };
  }, []);

  async function generateProposals(prId: string): Promise<void> {
    setError(null);
    setGeneratingForPr((m) => ({ ...m, [prId]: true }));
    try {
      const res = await callAction<any>("allgravy.proposals.generate", { pr_id: prId });
      if (!res?.ok) {
        setError(String(res?.error ?? "Failed to generate proposals"));
        return;
      }

      if (selectedPrId === prId) {
        if (res.pr) setSelectedPr(res.pr as AllGravyPrRow);
        if (res.patches) setSelectedPatches(res.patches as PatchesPayload);
        if (Array.isArray(res.proposals)) setSelectedProposals(res.proposals as AllGravyProposalRow[]);
      }

      // Update PR row in list (if returned).
      if (res.pr?.id) {
        setPrs((prev) => prev.map((p) => (p.id === res.pr.id ? (res.pr as AllGravyPrRow) : p)));
      }
    } finally {
      setGeneratingForPr((m) => ({ ...m, [prId]: false }));
    }
  }

  async function applyProposal(proposalId: string, bodyOverride?: string): Promise<void> {
    setError(null);
    setApplyingProposal((m) => ({ ...m, [proposalId]: true }));
    try {
      const res = await callAction<any>("allgravy.comment.apply", { proposal_id: proposalId, body_override: bodyOverride });
      if (!res?.ok) {
        setError(String(res?.error ?? "Failed to apply proposal"));
        return;
      }
      const next = res.proposal as AllGravyProposalRow | undefined;
      if (next?.id) {
        setSelectedProposals((prev) => prev.map((p) => (p.id === next.id ? next : p)));
      }
    } finally {
      setApplyingProposal((m) => ({ ...m, [proposalId]: false }));
    }
  }

  async function discardProposal(proposalId: string): Promise<void> {
    setError(null);
    const res = await callAction<any>("allgravy.comment.discard", { proposal_id: proposalId });
    if (!res?.ok) {
      setError(String(res?.error ?? "Failed to discard proposal"));
      return;
    }
    const next = res.proposal as AllGravyProposalRow | undefined;
    if (next?.id) {
      setSelectedProposals((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    }
  }

  async function approve(prId: string): Promise<void> {
    setError(null);
    setApprovingPr((m) => ({ ...m, [prId]: true }));
    try {
      const res = await callAction<any>("allgravy.pr.approve", { pr_id: prId });
      if (!res?.ok) {
        setError(String(res?.error ?? "Failed to approve PR"));
        return;
      }
      // Optimistic UI: once approved, remove from review queue immediately.
      setPrs((prev) => prev.filter((p) => p.id !== prId));
      if (selectedPrId === prId) clearSelectedPr();
    } finally {
      setApprovingPr((m) => ({ ...m, [prId]: false }));
    }
  }

  const onWsMessage = React.useCallback(
    (m: WsMessage): void => {
      if (m.type === "allgravy.queue") {
        if (m.event === "failed") {
          setRefreshing(false);
          const msg = typeof m.error === "string" && m.error.trim() ? m.error : "Queue refresh failed";
          setError(msg);
          return;
        }
        if (m.event === "completed") {
          if (typeof m.run_id === "string" && m.run_id.trim()) setRunId(m.run_id);
          void loadLatestQueue();
          const selected = selectedPrIdRef.current;
          if (selected) scheduleSelectedPrRefresh(selected);
        }
        return;
      }

      if (m.type === "allgravy.proposals") {
        const prId = String(m.pr_id ?? "").trim();
        if (!prId) return;
        if (m.event === "started") {
          setGeneratingForPr((prev) => ({ ...prev, [prId]: true }));
          return;
        }
        if (m.event === "generated" || m.event === "failed") {
          setGeneratingForPr((prev) => ({ ...prev, [prId]: false }));
          if (selectedPrIdRef.current === prId) scheduleSelectedPrRefresh(prId);
        }
        return;
      }

      if (m.type === "allgravy.comment") {
        const proposalId = String(m.proposal_id ?? "").trim();
        if (!proposalId) return;
        setApplyingProposal((prev) => ({ ...prev, [proposalId]: false }));

        if (m.event === "applied" || m.event === "discarded" || m.event === "failed") {
          const nextStatus = m.event === "applied" ? "applied" : m.event === "discarded" ? "discarded" : "failed";
          setSelectedProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, status: nextStatus } : p)));

          // Multi-tab sync: hydrate full rows (including apply_result_json/comment URL) when a visible proposal changes.
          const isVisible = selectedProposalsRef.current.some((p) => p.id === proposalId);
          if (isVisible) scheduleSelectedPrRefresh(selectedPrIdRef.current);
        }
        return;
      }

      if (m.type === "allgravy.pr" && m.event === "approved") {
        const prId = String(m.pr_id ?? "").trim();
        if (!prId) return;
        setPrs((prev) => prev.filter((p) => p.id !== prId));
        if (selectedPrIdRef.current === prId) clearSelectedPr();
      }
    },
    [clearSelectedPr, loadLatestQueue, scheduleSelectedPrRefresh],
  );

  // Initial load.
  React.useEffect(() => {
    void loadSettings();
    void loadLatestQueue();
  }, []);

  const counts = React.useMemo(() => {
    const c = { new_unreviewed: 0, waiting: 0, ready_to_approve: 0 };
    for (const pr of prs) {
      if (pr.status === "new_unreviewed") c.new_unreviewed += 1;
      else if (pr.status === "waiting") c.waiting += 1;
      else if (pr.status === "ready_to_approve") c.ready_to_approve += 1;
    }
    return c;
  }, [prs]);

  return {
    reposText,
    setReposText,
    repos,
    brain,
    filter,
    sinceDays,
    excludeBots,
    loadingSettings,
    refreshing,
    generatingForPr,
    applyingProposal,
    approvingPr,
    runId,
    prs,
    queueErrors,
    selectedPrId,
    selectedPr,
    selectedPatches,
    selectedProposals,
    error,
    setError,
    loadSettings,
    saveReposFromText,
    saveBrain,
    saveFilter,
    saveSinceDays,
    saveExcludeBots,
    loadLatestQueue,
    refreshQueue,
    selectPr,
    generateProposals,
    applyProposal,
    discardProposal,
    approve,
    onWsMessage,
    counts,
  };
}
