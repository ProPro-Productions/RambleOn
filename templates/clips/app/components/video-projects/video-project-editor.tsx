import { callAction } from "@agent-native/core/client";
import { useEffect, useMemo } from "react";

import {
  setClipsProjectBridge,
  type ClipsProjectBridge,
  type PendingRecordingImport,
} from "@/video-editor/clips/bridge";
import { Editor } from "@/video-editor/editor/editor";
import type { UndoableState } from "@/video-editor/editor/state/types";

export interface VideoProjectEditorProps {
  project: {
    id: string;
    stateJson: string;
    pendingImportsJson: string;
  };
  onSaveStateChange?: (status: "saving" | "saved" | "error") => void;
}

function parseInitialState(raw: string): UndoableState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UndoableState;
  } catch {
    console.error("Ignoring corrupt video project state");
    return null;
  }
}

function parsePendingImports(raw: string): PendingRecordingImport[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry?.kind === "recording")
      : [];
  } catch {
    return [];
  }
}

// Connects the vendored full editor to a Clips video project: the bridge
// feeds it the initial state + queued recording imports, and persists saves
// through the update-video-project action.
export function VideoProjectEditor({
  project,
  onSaveStateChange,
}: VideoProjectEditorProps) {
  // The bridge must be in place before <Editor/> initializes (it reads the
  // initial state in a mount effect) — set it during render, keyed remount
  // isolates projects from each other.
  useMemo(() => {
    const bridge: ClipsProjectBridge = {
      projectId: project.id,
      initialState: parseInitialState(project.stateJson),
      pendingImports: parsePendingImports(project.pendingImportsJson),
      save: async (state: UndoableState) => {
        await callAction("update-video-project", {
          id: project.id,
          stateJson: JSON.stringify(state),
        });
      },
      clearPendingImports: async () => {
        await callAction("update-video-project", {
          id: project.id,
          clearPendingImports: true,
        });
      },
      onSaveStateChange,
    };
    setClipsProjectBridge(bridge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    return () => setClipsProjectBridge(null);
  }, []);

  return <Editor />;
}

export default VideoProjectEditor;
