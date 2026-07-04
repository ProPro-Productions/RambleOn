import {
  useActionMutation,
  useActionQuery,
  useT,
} from "@agent-native/core/client";
import { IconLoader2, IconMovie, IconPlus } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const NEW_PROJECT_VALUE = "__new__";

interface VideoProjectListItem {
  id: string;
  title: string;
  updatedAt: string;
  sourceRecordingIds: string[];
}

export function OpenInVideoProjectDialog({
  recordingId,
  hasTranscript,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  recordingId: string;
  hasTranscript?: boolean;
  /** Trigger element; omit when using controlled open/onOpenChange. */
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [target, setTarget] = useState<string>(NEW_PROJECT_VALUE);
  const [respectEdits, setRespectEdits] = useState(true);
  const [includeCaptions, setIncludeCaptions] = useState(false);

  const projectsQ = useActionQuery(
    "list-video-projects",
    { limit: 50 },
    { enabled: open },
  );
  const addToProject = useActionMutation("add-recording-to-video-project");

  const projects: VideoProjectListItem[] =
    (projectsQ.data as { projects?: VideoProjectListItem[] } | undefined)
      ?.projects ?? [];

  const handleConfirm = () => {
    addToProject.mutate(
      {
        recordingId,
        projectId: target === NEW_PROJECT_VALUE ? undefined : target,
        respectEdits,
        includeCaptions,
      } as any,
      {
        onSuccess: (result: any) => {
          setOpen(false);
          const projectId = result?.projectId;
          if (typeof projectId === "string") {
            navigate(`/video-projects/${projectId}`);
          }
        },
        onError: (error: unknown) => {
          toast.error(t("videoProjects.addFailed"), {
            description: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("videoProjects.openInProject")}</DialogTitle>
          <DialogDescription>
            {t("videoProjects.openInProjectDescription")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={target} onValueChange={setTarget} className="gap-1">
          <label
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
              target === NEW_PROJECT_VALUE
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <RadioGroupItem value={NEW_PROJECT_VALUE} />
            <IconPlus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t("videoProjects.newProject")}
            </span>
          </label>

          {projectsQ.isLoading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground">
              <IconLoader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : projects.length > 0 ? (
            <ScrollArea className="max-h-56">
              <div className="flex flex-col gap-1">
                {projects.map((project) => (
                  <label
                    key={project.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
                      target === project.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <RadioGroupItem value={project.id} />
                    <IconMovie className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {project.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("videoProjects.sourceCount", {
                        count: project.sourceRecordingIds.length,
                      })}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          ) : null}
        </RadioGroup>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="video-project-respect-edits"
              checked={respectEdits}
              onCheckedChange={(v) => setRespectEdits(v === true)}
            />
            <Label
              htmlFor="video-project-respect-edits"
              className="text-sm font-normal"
            >
              {t("videoProjects.respectEdits")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="video-project-include-captions"
              checked={includeCaptions}
              disabled={hasTranscript === false}
              onCheckedChange={(v) => setIncludeCaptions(v === true)}
            />
            <Label
              htmlFor="video-project-include-captions"
              className="text-sm font-normal"
            >
              {t("videoProjects.includeCaptions")}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={addToProject.isPending}
          >
            {t("videoProjects.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={addToProject.isPending}>
            {addToProject.isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {target === NEW_PROJECT_VALUE
              ? t("videoProjects.createAndOpen")
              : t("videoProjects.addAndOpen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
