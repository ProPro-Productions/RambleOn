import {
  ShareButton,
  useActionMutation,
  useActionQuery,
  useT,
} from "@agent-native/core/client";
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import enMessages from "@/i18n/en-US";

// The editor pulls in Remotion's player + mediabunny — keep it out of the SSR
// bundle and off every other route's critical path.
const VideoProjectEditor = lazy(
  () => import("@/components/video-projects/video-project-editor"),
);

export function meta() {
  return [{ title: enMessages.videoProjects.editorPageTitle }];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function VideoProjectRoute() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [mounted, setMounted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => setMounted(true), []);

  const projectQ = useActionQuery(
    "get-video-project",
    { id: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const project = projectQ.data as
    | {
        id: string;
        title: string;
        stateJson: string;
        pendingImportsJson: string;
      }
    | undefined;

  // Snapshot the editor payload once per project: the editor owns the state
  // after mount, so refetches (polling/agent writes) must not remount it.
  const editorPayloadRef = useRef<{
    id: string;
    stateJson: string;
    pendingImportsJson: string;
  } | null>(null);
  if (project && editorPayloadRef.current?.id !== project.id) {
    editorPayloadRef.current = {
      id: project.id,
      stateJson: project.stateJson,
      pendingImportsJson: project.pendingImportsJson,
    };
  }

  const onSaveStateChange = useCallback(
    (status: "saving" | "saved" | "error") => {
      setSaveStatus(status);
    },
    [],
  );

  if (!projectId) return null;

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/video-projects")}
          aria-label={t("videoProjects.back")}
        >
          <IconArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {project ? (
            <ProjectTitle projectId={project.id} title={project.title} />
          ) : (
            <div className="h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
          )}
          <span className="shrink-0 text-xs text-muted-foreground">
            {saveStatus === "saving"
              ? t("videoProjects.saving")
              : saveStatus === "saved"
                ? t("videoProjects.saved")
                : saveStatus === "error"
                  ? t("videoProjects.saveFailed")
                  : null}
          </span>
        </div>
        {project ? (
          <ShareButton
            resourceType="video-project"
            resourceId={project.id}
            resourceTitle={project.title}
          />
        ) : null}
      </header>

      <div className="flex-1 min-h-0">
        {projectQ.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-muted-foreground">
              {t("videoProjects.loadFailed")}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              {t("videoProjects.backToLibrary")}
            </Button>
          </div>
        ) : mounted && editorPayloadRef.current ? (
          <Suspense fallback={<EditorLoading />}>
            <VideoProjectEditor
              key={editorPayloadRef.current.id}
              project={editorPayloadRef.current}
              onSaveStateChange={onSaveStateChange}
            />
          </Suspense>
        ) : (
          <EditorLoading />
        )}
      </div>
    </div>
  );
}

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProjectTitle({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const update = useActionMutation("update-video-project");

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) {
      update.mutate({ id: projectId, title: next } as any);
    } else {
      setDraft(title);
    }
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className="h-7 max-w-xs text-sm font-medium"
      />
    );
  }

  return (
    <button
      type="button"
      className="truncate text-sm font-medium hover:underline text-start"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      title={t("videoProjects.renameProject")}
    >
      {title}
    </button>
  );
}
