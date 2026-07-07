import {
  useActionMutation,
  useActionQuery,
  useT,
} from "@agent-native/core/client";
import { IconSparkles } from "@tabler/icons-react";
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

interface EditVersion {
  id: string;
  title: string;
  note: string | null;
  authorName: string | null;
  authorKind: "user" | "ai";
  status: "proposed" | "accepted" | "rejected" | "superseded";
  createdAt: string;
}

/**
 * The owner's review surface for proposed edit versions — how AI or human
 * editors hand an edited cut back to the recording's owner. A quiet banner
 * appears while a proposal is pending; the dialog shows the author's note
 * and applies the decision through review-edit-version (accept swaps the
 * live edits and archives the previous set; reject just flips status —
 * nothing ever touches the original media).
 */
export function EditVersionReview({
  recordingId,
  canEdit,
}: {
  recordingId: string;
  canEdit: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const query = useActionQuery(
    "list-edit-versions" as any,
    { recordingId } as any,
  ) as {
    data?: { versions?: EditVersion[] };
    refetch: () => void;
  };
  const review = useActionMutation("review-edit-version" as any);

  const proposed = (query.data?.versions ?? []).filter(
    (v) => v.status === "proposed",
  );
  if (!canEdit || proposed.length === 0) return null;
  const current = proposed[0];

  const decide = (decision: "accept" | "reject") => {
    review.mutate(
      { id: current.id, decision } as any,
      {
        onSuccess: () => {
          toast.success(
            decision === "accept"
              ? t("editVersions.accepted")
              : t("editVersions.rejected"),
          );
          setOpen(false);
          query.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message ?? t("editVersions.reviewFailed")),
      } as any,
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-3d-sm">
        <IconSparkles className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{current.title}</span>{" "}
          <span className="text-muted-foreground">
            {t("editVersions.pendingFrom", {
              author:
                current.authorName ??
                (current.authorKind === "ai" ? "AI" : t("editVersions.editor")),
            })}
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {t("editVersions.review")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{current.title}</DialogTitle>
            <DialogDescription>
              {t("editVersions.pendingFrom", {
                author:
                  current.authorName ??
                  (current.authorKind === "ai"
                    ? "AI"
                    : t("editVersions.editor")),
              })}
            </DialogDescription>
          </DialogHeader>
          {current.note ? (
            <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm shadow-3d-inner-sm">
              {current.note}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={review.isPending}
              onClick={() => decide("reject")}
            >
              {t("editVersions.reject")}
            </Button>
            <Button
              disabled={review.isPending}
              onClick={() => decide("accept")}
            >
              {t("editVersions.accept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
