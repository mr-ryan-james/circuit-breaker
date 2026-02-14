import React from "react";

import type { AllGravyPrFilter, AllGravyPrRow, AllGravyProposalRow, BrainDefault } from "@/app/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/NativeSelect";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime, tryParseJson } from "@/lib/format";
import { cn } from "@/lib/utils";

type PatchesPayload = {
  patches?: Record<string, { patch?: string; numbered_lines?: string[] }>;
  omitted?: string[];
};

function threadCountsLine(pr: AllGravyPrRow): string | null {
  const j = tryParseJson(pr.thread_summary_json);
  if (!j || typeof j !== "object") return null;
  const threads = Number((j as any).threadsWithMyComments ?? NaN);
  const resolved = Number((j as any).resolved ?? NaN);
  const replied = Number((j as any).repliedNotResolved ?? NaN);
  const noResp = Number((j as any).noResponse ?? NaN);
  if (![threads, resolved, replied, noResp].every((n) => Number.isFinite(n))) return null;
  return `threads=${threads} resolved=${resolved} replied=${replied} noResponse=${noResp}`;
}

function patchLinePreview(patches: PatchesPayload | null, path: string, position: number): string | null {
  const entry = patches?.patches?.[path];
  const patch = typeof entry?.patch === "string" ? entry.patch : null;
  if (!patch) return null;
  const lines = patch.split("\n");
  if (position <= 0 || position > lines.length) return null;
  const line = lines[position - 1] ?? "";
  return line.length > 240 ? line.slice(0, 240) + "…" : line;
}

function statusPill(status: string): { label: string; className: string } {
  switch (status) {
    case "new_unreviewed":
      return { label: "New", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200" };
    case "waiting":
      return { label: "Waiting", className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200" };
    case "ready_to_approve":
      return { label: "Ready", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" };
    case "proposed":
      return { label: "Proposed", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200" };
    case "applied":
      return { label: "Applied", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" };
    case "discarded":
      return { label: "Discarded", className: "border-muted-foreground/30 bg-muted/20 text-muted-foreground" };
    case "failed":
      return { label: "Failed", className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200" };
    default:
      return { label: status, className: "border-muted-foreground/30 bg-muted/20 text-muted-foreground" };
  }
}

export function AllGravyTab(props: {
  reposText: string;
  setReposText: (v: string) => void;
  repos: string[];
  brain: BrainDefault;
  filter: AllGravyPrFilter;
  sinceDays: number;
  excludeBots: boolean;
  loadingSettings: boolean;
  refreshing: boolean;
  generatingForPr: Record<string, boolean>;
  applyingProposal: Record<string, boolean>;
  approvingPr: Record<string, boolean>;

  runId: string | null;
  prs: AllGravyPrRow[];
  queueErrors: Array<{ repo: string; error: string }>;

  selectedPrId: string | null;
  selectedPr: AllGravyPrRow | null;
  selectedPatches: PatchesPayload | null;
  selectedProposals: AllGravyProposalRow[];

  error: string | null;
  setError: (v: string | null) => void;

  saveReposFromText: () => Promise<boolean>;
  saveBrain: (b: BrainDefault) => Promise<boolean>;
  saveFilter: (f: AllGravyPrFilter) => Promise<boolean>;
  saveSinceDays: (n: number) => Promise<boolean>;
  saveExcludeBots: (v: boolean) => Promise<boolean>;
  loadLatestQueue: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  selectPr: (id: string) => Promise<void>;
  generateProposals: (prId: string) => Promise<void>;
  applyProposal: (proposalId: string, bodyOverride?: string) => Promise<void>;
  discardProposal: (proposalId: string) => Promise<void>;
  approve: (prId: string) => Promise<void>;

  counts: { new_unreviewed: number; waiting: number; ready_to_approve: number };
}) {
  const {
    reposText,
    setReposText,
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
    counts,
  } = props;

  const [sinceDaysInput, setSinceDaysInput] = React.useState<string>(String(sinceDays));
  React.useEffect(() => setSinceDaysInput(String(sinceDays)), [sinceDays]);

  const [draftBodies, setDraftBodies] = React.useState<Record<string, string>>({});
  const [saveFeedback, setSaveFeedback] = React.useState<string | null>(null);
  const [approveTarget, setApproveTarget] = React.useState<AllGravyPrRow | null>(null);
  const [applyTarget, setApplyTarget] = React.useState<AllGravyProposalRow | null>(null);

  React.useEffect(() => {
    setDraftBodies((prev) => {
      const next = { ...prev };
      for (const p of selectedProposals) {
        if (next[p.id] === undefined) next[p.id] = p.body ?? "";
      }
      const visible = new Set(selectedProposals.map((p) => p.id));
      for (const k of Object.keys(next)) {
        if (!visible.has(k)) delete next[k];
      }
      return next;
    });
  }, [selectedProposals]);

  React.useEffect(() => {
    if (!saveFeedback) return;
    const t = window.setTimeout(() => setSaveFeedback(null), 2000);
    return () => window.clearTimeout(t);
  }, [saveFeedback]);

  const byStatus = React.useMemo(() => {
    const ready: AllGravyPrRow[] = [];
    const waiting: AllGravyPrRow[] = [];
    const fresh: AllGravyPrRow[] = [];
    for (const pr of prs) {
      if (pr.status === "ready_to_approve") ready.push(pr);
      else if (pr.status === "waiting") waiting.push(pr);
      else fresh.push(pr);
    }
    return { ready, waiting, fresh };
  }, [prs]);

  const latestRefreshedAt = React.useMemo(() => {
    let latest: string | null = null;
    for (const pr of prs) {
      if (!pr.refreshed_at) continue;
      if (!latest || Date.parse(pr.refreshed_at) > Date.parse(latest)) latest = pr.refreshed_at;
    }
    return latest;
  }, [prs]);

  const humanRunInfo = latestRefreshedAt ? formatRelativeTime(latestRefreshedAt) : null;

  async function onSaveReposClick() {
    const ok = await saveReposFromText();
    if (ok) setSaveFeedback("Saved!");
  }

  async function onBrainChange(next: BrainDefault) {
    const ok = await saveBrain(next);
    if (ok) setSaveFeedback("Saved!");
  }

  async function onFilterChange(next: AllGravyPrFilter) {
    const ok = await saveFilter(next);
    if (ok) setSaveFeedback("Saved!");
  }

  function commitSinceDays() {
    const n = Number(sinceDaysInput);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setSinceDaysInput(String(sinceDays));
      return;
    }
    const rounded = Math.round(n);
    if (rounded !== sinceDays) {
      void saveSinceDays(rounded).then((ok) => { if (ok) setSaveFeedback("Saved!"); });
    }
  }

  async function onExcludeBotsChange(next: boolean) {
    const ok = await saveExcludeBots(next);
    if (ok) setSaveFeedback("Saved!");
  }

  function renderPrCard(pr: AllGravyPrRow, opts?: { showApprove?: boolean; showGenerate?: boolean }) {
    return (
      <div
        key={pr.id}
        className={cn("rounded-md border p-2 cursor-pointer hover:bg-muted/20", selectedPrId === pr.id && "border-primary/40 bg-primary/5")}
        onClick={() => void selectPr(pr.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{pr.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground font-mono">
              {pr.repo}#{pr.pr_number}
            </div>
            {threadCountsLine(pr) ? <div className="mt-1 text-[11px] text-muted-foreground font-mono">{threadCountsLine(pr)}</div> : null}
          </div>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", statusPill(pr.status).className)}>
            {statusPill(pr.status).label}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <a className="text-xs text-primary underline" href={pr.pr_url} target="_blank" rel="noreferrer">
            open
          </a>

          <div className="flex items-center gap-2">
            {opts?.showGenerate ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void generateProposals(pr.id);
                }}
                disabled={Boolean(generatingForPr[pr.id])}
              >
                {generatingForPr[pr.id] ? "Thinking…" : "Propose"}
              </Button>
            ) : null}

            {opts?.showApprove ? (
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setApproveTarget(pr);
                }}
                disabled={Boolean(approvingPr[pr.id])}
              >
                {approvingPr[pr.id] ? "Approving…" : "Approve"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>All Gravy</CardTitle>
              <CardDescription>PR review queue + AI proposals + per-comment apply.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                title="PRs where all your review threads are addressed"
                className={cn("rounded-full border px-2 py-0.5 text-xs", statusPill("ready_to_approve").className)}
              >
                Ready: {counts.ready_to_approve}
              </span>
              <span
                title="PRs with unresolved review threads"
                className={cn("rounded-full border px-2 py-0.5 text-xs", statusPill("waiting").className)}
              >
                Waiting: {counts.waiting}
              </span>
              <span
                title="PRs not yet reviewed by the brain"
                className={cn("rounded-full border px-2 py-0.5 text-xs", statusPill("new_unreviewed").className)}
              >
                New: {counts.new_unreviewed}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="ag-repos">Repos (owner/repo), one per line</Label>
              <Textarea
                id="ag-repos"
                value={reposText}
                onChange={(e) => setReposText(e.target.value)}
                placeholder={"buttersolutions/api\nbuttersolutions/native\nbuttersolutions/org-admin"}
                disabled={loadingSettings}
                className="min-h-[120px] font-mono text-xs"
              />
              {!reposText.trim() ? <div className="text-sm text-muted-foreground">Add repos above, then click Save to get started.</div> : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void onSaveReposClick()} disabled={loadingSettings}>
                  Save repos
                </Button>
                <Button variant="outline" onClick={() => void loadLatestQueue()} disabled={refreshing}>
                  Load cached
                </Button>
                <Button variant="secondary" onClick={() => void refreshQueue()} disabled={refreshing}>
                  {refreshing ? "Fetching…" : "Fetch from GitHub"}
                </Button>

                {saveFeedback ? <span className="text-xs text-emerald-700 dark:text-emerald-300">{saveFeedback}</span> : null}

                <span className="text-xs text-muted-foreground" title={runId ?? ""}>
                  Last fetched: {humanRunInfo ?? "(none)"}
                </span>
              </div>

              {queueErrors.length > 0 ? (
                <Alert>
                  <AlertTitle>Queue warnings</AlertTitle>
                  <AlertDescription className="text-xs">
                    <div className="space-y-1">
                      {queueErrors.slice(0, 8).map((e, idx) => (
                        <div key={`${e.repo}-${idx}`} className="font-mono">
                          {e.repo}: {e.error}
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ag-filter">PR filter</Label>
                <NativeSelect id="ag-filter" value={filter} onChange={(e) => void onFilterChange(e.target.value as AllGravyPrFilter)}>
                  <option value="review_requested">Review requested</option>
                  <option value="all_by_others">All PRs by others</option>
                  <option value="all_open">All open PRs</option>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-since">Since (days)</Label>
                <Input
                  id="ag-since"
                  type="number"
                  min={1}
                  max={365}
                  value={sinceDaysInput}
                  onChange={(e) => setSinceDaysInput(e.target.value)}
                  onBlur={commitSinceDays}
                  onKeyDown={(e) => { if (e.key === "Enter") commitSinceDays(); }}
                  className="w-[100px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ag-exclude-bots" checked={excludeBots} onCheckedChange={(v) => void onExcludeBotsChange(Boolean(v))} />
                <Label htmlFor="ag-exclude-bots">Exclude bots</Label>
              </div>
              <div className="text-xs text-muted-foreground">Applies on next Fetch from GitHub.</div>
              <div className="space-y-2">
                <Label htmlFor="ag-brain">Brain</Label>
                <NativeSelect id="ag-brain" value={brain} onChange={(e) => void onBrainChange(e.target.value as BrainDefault)}>
                  <option value="codex">Codex (recommended)</option>
                  <option value="claude">Claude (may fail on large diffs)</option>
                </NativeSelect>
                <div className="text-xs text-muted-foreground">
                  Comments are only posted to GitHub when you click <b>Apply</b> and confirm.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>Click a PR to view diffs and proposals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">READY TO APPROVE</div>
              {byStatus.ready.length === 0 ? <div className="text-sm text-muted-foreground">No ready PRs yet.</div> : <div className="space-y-2">{byStatus.ready.map((pr) => renderPrCard(pr, { showApprove: true }))}</div>}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">WAITING</div>
              {byStatus.waiting.length === 0 ? <div className="text-sm text-muted-foreground">No waiting PRs.</div> : <div className="space-y-2">{byStatus.waiting.map((pr) => renderPrCard(pr))}</div>}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">NEW (UNREVIEWED)</div>
              {byStatus.fresh.length === 0 ? (
                <div className="text-sm text-muted-foreground">No new PRs.</div>
              ) : (
                <div className="space-y-2">{byStatus.fresh.map((pr) => renderPrCard(pr, { showGenerate: true }))}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>PR context + comment proposals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedPr ? (
              <div className="text-sm text-muted-foreground">Select a PR from the queue to view diffs and manage review comments.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold leading-tight">{selectedPr.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">
                      {selectedPr.repo}#{selectedPr.pr_number} • head {selectedPr.head_sha.slice(0, 8)}
                    </div>
                    {threadCountsLine(selectedPr) ? <div className="mt-1 text-xs text-muted-foreground font-mono">{threadCountsLine(selectedPr)}</div> : null}
                    <div className="mt-2">
                      <a className="text-sm text-primary underline" href={selectedPr.pr_url} target="_blank" rel="noreferrer">
                        Open PR on GitHub
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-1 text-xs", statusPill(selectedPr.status).className)}>
                      {statusPill(selectedPr.status).label}
                    </span>
                    {selectedPr.status === "new_unreviewed" ? (
                      <Button
                        variant="secondary"
                        onClick={() => void generateProposals(selectedPr.id)}
                        disabled={Boolean(generatingForPr[selectedPr.id])}
                      >
                        {generatingForPr[selectedPr.id] ? "Thinking…" : "Generate proposals"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-md border">
                  <div className="border-b px-3 py-2 text-sm font-medium">Changed Files</div>
                  <ScrollArea className="h-[260px]">
                    <div className="p-3 space-y-4">
                      {selectedPatches?.omitted?.length ? (
                        <Alert>
                          <AlertTitle>Omitted files</AlertTitle>
                          <AlertDescription className="text-xs">
                            No patch was available (or patch was too large): <span className="font-mono">{selectedPatches.omitted.join(", ")}</span>
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {selectedPatches?.patches ? (
                        Object.entries(selectedPatches.patches)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([filename, entry]) => {
                            const lines =
                              Array.isArray(entry.numbered_lines) && entry.numbered_lines.length > 0
                                ? entry.numbered_lines
                                : typeof entry.patch === "string"
                                  ? entry.patch.split("\n").map((l, i) => `${String(i + 1).padStart(4, " ")} ${l}`)
                                  : [];
                            return (
                              <div key={filename} className="rounded-md border bg-muted/10">
                                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                  <div className="font-mono text-xs">{filename}</div>
                                  <span className="text-xs text-muted-foreground">{lines.length} lines</span>
                                </div>
                                <ScrollArea className="h-[160px]">
                                  <pre className="p-3 text-xs whitespace-pre font-mono">{lines.join("\n")}</pre>
                                </ScrollArea>
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-sm text-muted-foreground">No patches loaded yet.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="rounded-md border">
                  <div className="border-b px-3 py-2 text-sm font-medium">
                    Proposals ({selectedProposals.filter((p) => p.status === "proposed").length} pending)
                  </div>
                  <div className="p-3 space-y-4">
                    {selectedProposals.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No proposals yet. Generate proposals from this panel for New PRs.</div>
                    ) : (
                      selectedProposals.map((p) => {
                        const preview = patchLinePreview(selectedPatches, p.path, p.position);
                        const applyMeta = tryParseJson(p.apply_result_json);
                        const appliedUrl = typeof applyMeta?.comment_url === "string" ? applyMeta.comment_url : null;
                        return (
                          <div key={p.id} className="rounded-md border p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-mono">
                                {p.path}:{p.position}
                              </div>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusPill(p.status).className)}>
                                {statusPill(p.status).label}
                              </span>
                            </div>
                            {preview ? <div className="rounded-md bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap">{preview}</div> : null}
                            <Textarea
                              value={draftBodies[p.id] ?? p.body ?? ""}
                              onChange={(e) => setDraftBodies((m) => ({ ...m, [p.id]: e.target.value }))}
                              disabled={p.status !== "proposed"}
                              className="min-h-[90px] text-sm"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => setApplyTarget(p)}
                                  disabled={p.status !== "proposed" || Boolean(applyingProposal[p.id])}
                                >
                                  {applyingProposal[p.id] ? "Applying…" : "Apply"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => void discardProposal(p.id)} disabled={p.status !== "proposed"}>
                                  Discard
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {appliedUrl ? (
                                  <a className="text-primary underline" href={appliedUrl} target="_blank" rel="noreferrer">
                                    view comment
                                  </a>
                                ) : p.status === "applied" ? (
                                  <span>applied</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={approveTarget !== null} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this PR?</DialogTitle>
            <DialogDescription>
              Approve PR {approveTarget ? `${approveTarget.repo}#${approveTarget.pr_number}` : ""} on GitHub. This submits an approving review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (approveTarget) void approve(approveTarget.id);
                setApproveTarget(null);
              }}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyTarget !== null} onOpenChange={(open) => !open && setApplyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post comment to GitHub?</DialogTitle>
            <DialogDescription>
              {applyTarget ? `Post inline comment at ${applyTarget.path}:${applyTarget.position}.` : "Post this comment to GitHub."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (applyTarget) {
                  const body = draftBodies[applyTarget.id] ?? applyTarget.body ?? "";
                  void applyProposal(applyTarget.id, body);
                }
                setApplyTarget(null);
              }}
            >
              Post comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
