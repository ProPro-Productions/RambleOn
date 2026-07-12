import {
  callAction,
  useActionMutation,
  useActionQuery,
  useT,
} from "@agent-native/core/client";
import { IconEye, IconRestore, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type EditVersionStatus = "proposed" | "accepted" | "rejected" | "superseded";

interface EditVersion {
  id: string;
  title: string;
  note: string | null;
  authorName: string | null;
  authorKind: "user" | "ai";
  status: EditVersionStatus;
  createdAt: string;
}

/**
 * A version being previewed in the player: the route swaps this editsJson
 * into VideoPlayer so the owner watches the actual cut before deciding.
 */
export interface EditVersionPreview {
  versionId: string;
  title: string;
  status: EditVersionStatus;
  editsJson: string;
}

const STATUS_CHIP: Record<EditVersionStatus, string> = {
  proposed: "bg-primary/15 text-primary",
  accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
  superseded: "bg-muted text-muted-foreground",
};

const STATUS_LABEL_KEY: Record<EditVersionStatus, string> = {
  proposed: "editVersions.statusProposed",
  accepted: "editVersions.statusAccepted",
  rejected: "editVersions.statusRejected",
  superseded: "editVersions.statusSuperseded",
};

/**
 * The owner's review surface for edit versions — how AI or human editors
 * hand an edited cut back to the recording's owner. A quiet banner appears
 * while a proposal is pending; "Preview cut" swaps the proposed edits into
 * the player (via the route) so the owner watches the actual result before
 * accepting; the history dialog browses every version and can restore a
 * past one. Accept/restore archive the replaced edits automatically —
 * nothing ever touches the original media.
 */
export function EditVersionReview({
  recordingId,
  canEdit,
  historyOpen,
  onHistoryOpenChange,
  preview,
  onPreviewChange,
}: {
  recordingId: string;
  canEdit: boolean;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  preview: EditVersionPreview | null;
  onPreviewChange: (preview: EditVersionPreview | null) => void;
}) {
  const t = useT();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const query = useActionQuery(
    "list-edit-versions" as any,
    { recordingId } as any,
  ) as {
    data?: { versions?: EditVersion[] };
    refetch: () => void;
  };
  const review = useActionMutation("review-edit-version" as any);
  const restore = useActionMutation("restore-edit-version" as any);

  const versions = query.data?.versions ?? [];
  const proposed = versions.filter((v) => v.status === "proposed");
  const current = proposed[0];
  if (!canEdit) return null;

  const authorLabel = (v: EditVersion) =>
    v.authorName ?? (v.authorKind === "ai" ? "AI" : t("editVersions.editor"));

  const startPreview = async (v: EditVersion) => {
    setPreviewLoading(v.id);
    try {
      const result = (await callAction(
        "get-edit-version" as any,
        { id: v.id } as any,
        { method: "GET" } as any,
      )) as any;
      onPreviewChange({
        versionId: v.id,
        title: v.title,
        status: v.status,
        editsJson: String(result?.version?.editsJson ?? ""),
      });
      setReviewOpen(false);
      onHistoryOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? t("editVersions.previewFailed"));
    } finally {
      setPreviewLoading(null);
    }
  };

  const decide = (versionId: string, decision: "accept" | "reject") => {
    review.mutate(
      { id: versionId, decision } as any,
      {
        onSuccess: () => {
          toast.success(
            decision === "accept"
              ? t("editVersions.accepted")
              : t("editVersions.rejected"),
          );
          setReviewOpen(false);
          onPreviewChange(null);
          query.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message ?? t("editVersions.reviewFailed")),
      } as any,
    );
  };

  const restoreVersion = (versionId: string) => {
    restore.mutate(
      { id: versionId } as any,
      {
        onSuccess: () => {
          toast.success(t("editVersions.restored"));
          onPreviewChange(null);
          onHistoryOpenChange(false);
          query.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message ?? t("editVersions.restoreFailed")),
      } as any,
    );
  };

  return (
    <>
      {preview ? (
        <div className="flex items-center gap-3 rounded-lg border border-ring/40 bg-ring/10 px-3 py-2 shadow-3d-sm">
          <IconEye className="h-4 w-4 shrink-0 text-ring" />
          <div className="min-w-0 flex-1 truncate text-sm">
            {t("editVersions.previewing", { title: preview.title })}
          </div>
          {preview.status === "proposed" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => decide(preview.versionId, "reject")}
              >
                {t("editVersions.reject")}
              </Button>
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() => decide(preview.versionId, "accept")}
              >
                {t("editVersions.accept")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={restore.isPending}
              onClick={() => restoreVersion(preview.versionId)}
            >
              {t("editVersions.restore")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPreviewChange(null)}
          >
            {t("editVersions.exitPreview")}
          </Button>
        </div>
      ) : current ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-3d-sm">
          <IconSparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{current.title}</span>{" "}
            <span className="text-muted-foreground">
              {t("editVersions.pendingFrom", { author: authorLabel(current) })}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setReviewOpen(true)}
          >
            {t("editVersions.review")}
          </Button>
        </div>
      ) : null}

      {current ? (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription>
                {t("editVersions.pendingFrom", {
                  author: authorLabel(current),
                })}
              </DialogDescription>
            </DialogHeader>
            {current.note ? (
              <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm shadow-3d-inner-sm">
                {current.note}
              </div>
            ) : null}
            <DialogFooter className="sm:justify-between">
              <Button
                variant="secondary"
                disabled={previewLoading === current.id}
                onClick={() => void startPreview(current)}
              >
                <IconEye className="me-1.5 h-4 w-4" />
                {t("editVersions.preview")}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => decide(current.id, "reject")}
                >
                  {t("editVersions.reject")}
                </Button>
                <Button
                  disabled={review.isPending}
                  onClick={() => decide(current.id, "accept")}
                >
                  {t("editVersions.accept")}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("editVersions.historyTitle")}</DialogTitle>
            <DialogDescription>
              {t("editVersions.historyDescription")}
            </DialogDescription>
          </DialogHeader>
          {versions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("editVersions.historyEmpty")}
            </div>
          ) : (
            <div className="-mx-1 max-h-96 space-y-2 overflow-auto px-1 py-0.5">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-3d-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          STATUS_CHIP[v.status],
                        )}
                      >
                        {t(STATUS_LABEL_KEY[v.status])}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {v.title}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {authorLabel(v)} ·{" "}
                      {new Date(v.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    {v.note ? (
                      <div
                        className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground"
                        title={v.note}
                      >
                        {v.note}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={previewLoading === v.id}
                      onClick={() => void startPreview(v)}
                    >
                      <IconEye className="me-1.5 h-3.5 w-3.5" />
                      {t("editVersions.preview")}
                    </Button>
                    {v.status !== "proposed" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={restore.isPending}
                        onClick={() => restoreVersion(v.id)}
                      >
                        <IconRestore className="me-1.5 h-3.5 w-3.5" />
                        {t("editVersions.restore")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
