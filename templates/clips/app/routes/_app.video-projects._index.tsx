import {
  useActionMutation,
  useActionQuery,
  useT,
} from "@agent-native/core/client";
import {
  IconDotsVertical,
  IconLoader2,
  IconMovie,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/library/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import enMessages from "@/i18n/en-US";

export function meta() {
  return [{ title: enMessages.videoProjects.listPageTitle }];
}

interface VideoProjectListItem {
  id: string;
  title: string;
  sourceRecordingIds: string[];
  visibility: string;
  updatedAt: string;
}

export default function VideoProjectsRoute() {
  const t = useT();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<VideoProjectListItem | null>(
    null,
  );

  const projectsQ = useActionQuery("list-video-projects", { limit: 100 });
  const createProject = useActionMutation("create-video-project");
  const deleteProject = useActionMutation("delete-video-project");

  const projects: VideoProjectListItem[] =
    (projectsQ.data as { projects?: VideoProjectListItem[] } | undefined)
      ?.projects ?? [];

  const handleCreate = () => {
    createProject.mutate({} as any, {
      onSuccess: (result: any) => {
        if (typeof result?.id === "string") {
          navigate(`/video-projects/${result.id}`);
        }
      },
      onError: (error: unknown) => {
        toast.error(t("videoProjects.createFailed"), {
          description: error instanceof Error ? error.message : String(error),
        });
      },
    });
  };

  return (
    <>
      <PageHeader>
        <h1 className="text-base font-semibold tracking-tight truncate">
          {t("videoProjects.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleCreate}
            disabled={createProject.isPending}
          >
            {createProject.isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconPlus className="h-4 w-4" />
            )}
            {t("videoProjects.newProject")}
          </Button>
        </div>
      </PageHeader>

      <p className="mb-6 text-sm text-muted-foreground">
        {t("videoProjects.intro")}
      </p>

      {projectsQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <IconMovie className="h-8 w-8 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium">
              {t("videoProjects.emptyTitle")}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("videoProjects.emptyDescription")}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/video-projects/${project.id}`)}
              className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-start gap-2">
                <IconMovie className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate text-sm font-medium">
                  {project.title}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label={t("videoProjects.projectOptions")}
                    >
                      <IconDotsVertical className="h-4 w-4" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleteTarget(project)}
                    >
                      <IconTrash className="me-2 h-4 w-4" />
                      {t("videoProjects.moveToTrash")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t("videoProjects.sourceCount", {
                    count: project.sourceRecordingIds.length,
                  })}
                </span>
                <span>·</span>
                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("videoProjects.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("videoProjects.deleteDescription", {
                title: deleteTarget?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("videoProjects.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                deleteProject.mutate({ id: deleteTarget.id } as any, {
                  onError: (error: unknown) => {
                    toast.error(t("videoProjects.deleteFailed"), {
                      description:
                        error instanceof Error ? error.message : String(error),
                    });
                  },
                });
                setDeleteTarget(null);
              }}
            >
              {t("videoProjects.moveToTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
