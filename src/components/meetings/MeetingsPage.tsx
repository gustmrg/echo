import React, { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Check,
  CircleStop,
  Copy,
  Headphones,
  Mic2,
  Pencil,
  RefreshCcw,
  Trash2,
  UsersRound,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type MeetingCaptureDevice,
  type MeetingDetail,
  type MeetingSummary,
} from "@/bindings";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { MeetingAudioPlayer } from "./MeetingAudioPlayer";

const PAGE_SIZE = 30;

const formatDuration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

export const MeetingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [active, setActive] = useState<MeetingSummary | null>(null);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [devices, setDevices] = useState<MeetingCaptureDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [supported, setSupported] = useState(true);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const [audioSources, setAudioSources] = useState<[string, string] | null>(
    null,
  );

  const loadMeetings = useCallback(async () => {
    const result = await commands.listMeetings(0, PAGE_SIZE);
    if (result.status === "ok") setMeetings(result.data);
  }, []);

  const loadSelected = useCallback(async (id: number) => {
    const result = await commands.getMeeting(id);
    if (result.status === "ok") {
      setSelected(result.data);
      setEditingTitle(null);
      if (
        result.data.meeting.status === "completed" ||
        result.data.meeting.status === "failed" ||
        result.data.meeting.status === "interrupted"
      ) {
        const paths = await commands.getMeetingAudioPaths(id);
        if (paths.status === "ok") {
          setAudioSources([
            convertFileSrc(paths.data[0], "asset"),
            convertFileSrc(paths.data[1], "asset"),
          ]);
        }
      } else {
        setAudioSources(null);
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const capabilities = await commands.getMeetingCapabilities();
      setSupported(capabilities.supported);
      setUnsupportedReason(capabilities.reason);
      if (!capabilities.supported) return;
      const [deviceResult, selectedDevice, stateResult] = await Promise.all([
        commands.getMeetingCaptureDevices(),
        commands.getMeetingOutputDevice(),
        commands.getMeetingState(),
      ]);
      if (deviceResult.status === "ok") setDevices(deviceResult.data);
      setDeviceId(selectedDevice ?? "");
      if (stateResult.status === "ok") setActive(stateResult.data);
      await loadMeetings();
    })();
  }, [loadMeetings]);

  useEffect(() => {
    const unlisten = events.meetingStateEvent.listen((event) => {
      void loadMeetings();
      if (
        event.payload.status === "completed" ||
        event.payload.status === "failed"
      ) {
        setActive(null);
        void loadSelected(event.payload.meeting_id);
      } else {
        void commands.getMeetingState().then((result) => {
          if (result.status === "ok") setActive(result.data);
        });
      }
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [loadMeetings, loadSelected]);

  useEffect(() => {
    if (active?.status !== "recording") return;
    const startedAt = active.started_at;
    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const defaultDevice = useMemo(
    () => devices.find((device) => device.is_default),
    [devices],
  );

  const beginRecording = async () => {
    setBusy(true);
    const result = await commands.startMeeting();
    setBusy(false);
    if (result.status === "ok") {
      setActive(result.data);
      setSelected(null);
      toast.success(t("meetings.toast.started"));
    } else {
      toast.error(result.error);
    }
  };

  const requestStart = () => {
    if (localStorage.getItem("meeting-recording-consent") === "accepted") {
      void beginRecording();
    } else {
      setConfirmConsent(true);
    }
  };

  const stopRecording = async () => {
    setBusy(true);
    const result = await commands.stopMeeting();
    setBusy(false);
    if (result.status === "ok") {
      if (result.data.status === "transcribing") {
        setActive(result.data);
        toast.success(t("meetings.toast.transcribing"));
      } else {
        setActive(null);
        await loadSelected(result.data.id);
      }
      await loadMeetings();
    } else {
      toast.error(result.error);
    }
  };

  const cancelRecording = async () => {
    setConfirmCancel(false);
    setBusy(true);
    const result = await commands.cancelMeeting();
    setBusy(false);
    if (result.status === "ok") {
      setActive(null);
      toast.success(t("meetings.toast.discarded"));
      await loadMeetings();
    } else {
      toast.error(result.error);
    }
  };

  const selectOutput = async (nextId: string) => {
    const result = await commands.setMeetingOutputDevice(nextId || null);
    if (result.status === "ok") setDeviceId(nextId);
    else toast.error(result.error);
  };

  const retry = async (id: number) => {
    const result = await commands.retryMeetingTranscription(id);
    if (result.status === "ok") {
      toast.success(t("meetings.toast.retrying"));
      const state = await commands.getMeetingState();
      if (state.status === "ok") setActive(state.data);
      await loadSelected(id);
      await loadMeetings();
    } else toast.error(result.error);
  };

  const remove = async (id: number) => {
    setDeleteTarget(null);
    const result = await commands.deleteMeeting(id);
    if (result.status === "ok") {
      if (selected?.meeting.id === id) {
        setSelected(null);
        setAudioSources(null);
      }
      await loadMeetings();
    } else toast.error(result.error);
  };

  const saveTitle = async () => {
    if (!selected || editingTitle === null) return;
    const result = await commands.renameMeeting(
      selected.meeting.id,
      editingTitle,
    );
    if (result.status === "ok") {
      setSelected({ ...selected, meeting: result.data });
      setEditingTitle(null);
      toast.success(t("meetings.toast.renamed"));
      await loadMeetings();
    } else toast.error(result.error);
  };

  if (!supported) {
    return (
      <div className="w-full max-w-2xl rounded-xl border border-mid-gray/20 bg-mid-gray/5 p-6 text-center">
        <UsersRound className="mx-auto mb-3 text-text/40" size={34} />
        <h2 className="text-lg font-semibold">
          {t("meetings.unsupported.title")}
        </h2>
        <p className="mt-2 text-sm text-text/60">
          {t(
            `meetings.unsupported.${unsupportedReason ?? "meeting_unsupported_platform"}`,
          )}
        </p>
      </div>
    );
  }

  const recording = active?.status === "recording";
  const transcribing = active?.status === "transcribing";

  return (
    <div className="w-full max-w-2xl space-y-4">
      <section className="overflow-hidden rounded-xl border border-mid-gray/20 bg-mid-gray/5">
        <div className="flex items-center justify-between border-b border-mid-gray/20 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">{t("meetings.title")}</h1>
            <p className="text-xs text-text/55">{t("meetings.subtitle")}</p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${recording ? "bg-red-500/15 text-red-400" : transcribing ? "bg-logo-primary/15 text-logo-primary" : "bg-mid-gray/10 text-text/55"}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${recording ? "bg-red-500 animate-pulse" : transcribing ? "bg-logo-primary animate-pulse" : "bg-text/30"}`}
            />
            {recording
              ? formatDuration(elapsed)
              : transcribing
                ? t("meetings.status.transcribing")
                : t("meetings.status.ready")}
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-logo-primary/20 bg-logo-primary/5 px-3 py-2">
              <Mic2 className="text-logo-primary" size={18} />
              <div>
                <div className="text-xs font-medium">
                  {t("meetings.sources.you")}
                </div>
                <div className="text-[11px] text-text/50">
                  {t("meetings.sources.microphone")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-purple-400/20 bg-purple-400/5 px-3 py-2">
              <Volume2 className="text-purple-400" size={18} />
              <div>
                <div className="text-xs font-medium">
                  {t("meetings.sources.meeting")}
                </div>
                <div className="text-[11px] text-text/50">
                  {t("meetings.sources.system")}
                </div>
              </div>
            </div>
          </div>

          <label className="block text-xs font-medium text-text/70">
            {t("meetings.output.label")}
            <select
              value={deviceId}
              onChange={(event) => void selectOutput(event.target.value)}
              disabled={Boolean(active) || busy}
              className="mt-1 w-full rounded-lg border border-mid-gray/20 bg-background px-3 py-2 text-sm focus:border-logo-primary focus:outline-none"
            >
              <option value="">
                {t("meetings.output.default", {
                  device: defaultDevice?.name ?? "",
                })}
              </option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2 rounded-lg bg-mid-gray/5 px-3 py-2 text-xs text-text/60">
            <Headphones size={16} className="shrink-0" />
            {t("meetings.headphones")}
          </div>

          <div className="flex justify-end gap-2">
            {recording ? (
              <>
                <Button
                  variant="danger-ghost"
                  onClick={() => setConfirmCancel(true)}
                  disabled={busy}
                >
                  {t("meetings.actions.cancel")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void stopRecording()}
                  disabled={busy}
                  className="flex items-center gap-2"
                >
                  <CircleStop size={16} />
                  {t("meetings.actions.stop")}
                </Button>
              </>
            ) : (
              <Button
                onClick={requestStart}
                disabled={busy || transcribing}
                className="flex items-center gap-2"
              >
                <span className="h-2 w-2 rounded-full bg-red-400" />
                {t("meetings.actions.start")}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-mid-gray/20 bg-mid-gray/5 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          {t("meetings.previous.title")}
        </h2>
        {meetings.length === 0 ? (
          <p className="py-6 text-center text-sm text-text/45">
            {t("meetings.previous.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {meetings.map((meeting) => (
              <button
                type="button"
                key={meeting.id}
                onClick={() => void loadSelected(meeting.id)}
                className="flex w-full items-center justify-between rounded-lg border border-mid-gray/15 px-3 py-2 text-start transition-colors hover:border-logo-primary/40 hover:bg-logo-primary/5"
              >
                <div>
                  <div className="text-sm font-medium">
                    {meeting.title || t("meetings.previous.untitled")}
                  </div>
                  <div className="text-xs text-text/45">
                    {new Date(meeting.started_at).toLocaleString()} ·{" "}
                    {formatDuration(meeting.duration_ms)}
                  </div>
                </div>
                <span className="text-xs text-text/55">
                  {t(`meetings.status.${meeting.status}`)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="rounded-xl border border-mid-gray/20 bg-mid-gray/5 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              {editingTitle === null ? (
                <h2 className="text-sm font-semibold">
                  {selected.meeting.title || t("meetings.previous.untitled")}
                </h2>
              ) : (
                <input
                  value={editingTitle}
                  maxLength={200}
                  autoFocus
                  aria-label={t("meetings.actions.rename")}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveTitle();
                    if (event.key === "Escape") setEditingTitle(null);
                  }}
                  className="w-full rounded-md border border-logo-primary/40 bg-background px-2 py-1 text-sm focus:outline-none"
                />
              )}
              <p className="text-xs text-text/45">
                {new Date(selected.meeting.started_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-1">
              {editingTitle === null ? (
                <button
                  type="button"
                  title={t("meetings.actions.rename")}
                  className="p-1.5 text-text/50 hover:text-logo-primary"
                  onClick={() => setEditingTitle(selected.meeting.title)}
                >
                  <Pencil size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  title={t("meetings.actions.save")}
                  className="p-1.5 text-logo-primary"
                  onClick={() => void saveTitle()}
                >
                  <Check size={16} />
                </button>
              )}
              {selected.meeting.transcript_text && (
                <button
                  type="button"
                  title={t("meetings.actions.copy")}
                  className="p-1.5 text-text/50 hover:text-logo-primary"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      selected.meeting.transcript_text,
                    );
                    toast.success(t("meetings.toast.copied"));
                  }}
                >
                  <Copy size={16} />
                </button>
              )}
              {(selected.meeting.status === "failed" ||
                selected.meeting.status === "interrupted") && (
                <button
                  type="button"
                  title={t("meetings.actions.retry")}
                  className="p-1.5 text-text/50 hover:text-logo-primary"
                  onClick={() => void retry(selected.meeting.id)}
                >
                  <RefreshCcw size={16} />
                </button>
              )}
              <button
                type="button"
                title={t("meetings.actions.delete")}
                className="p-1.5 text-text/50 hover:text-red-400"
                onClick={() => setDeleteTarget(selected.meeting.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {audioSources && (
            <MeetingAudioPlayer
              microphoneSrc={audioSources[0]}
              systemSrc={audioSources[1]}
            />
          )}
          {selected.meeting.error_message && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
              {selected.meeting.error_message}
            </div>
          )}
          <div className="space-y-2">
            {selected.segments.map((segment) => (
              <div
                key={`${segment.source}-${segment.start_ms}-${segment.id}`}
                className={`border-s-2 ps-3 py-1 ${segment.source === "microphone" ? "border-logo-primary" : "border-purple-400"}`}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[11px] font-medium text-text/45">
                  <span>
                    {segment.source === "microphone"
                      ? t("meetings.sources.you")
                      : t("meetings.sources.meeting")}
                  </span>
                  <span>{formatDuration(segment.start_ms)}</span>
                </div>
                <p className="select-text text-sm leading-relaxed">
                  {segment.text}
                </p>
              </div>
            ))}
            {selected.segments.length === 0 &&
              selected.meeting.status === "completed" && (
                <p className="py-4 text-center text-sm text-text/45">
                  {t("meetings.transcript.empty")}
                </p>
              )}
          </div>
        </section>
      )}

      <Dialog
        open={confirmConsent}
        onOpenChange={setConfirmConsent}
        title={t("meetings.consent.title")}
        description={t("meetings.consent.description")}
        closeLabel={t("meetings.actions.close")}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmConsent(false)}
            >
              {t("meetings.actions.close")}
            </Button>
            <Button
              onClick={() => {
                localStorage.setItem("meeting-recording-consent", "accepted");
                setConfirmConsent(false);
                void beginRecording();
              }}
              className="flex items-center gap-2"
            >
              <Check size={15} />
              {t("meetings.consent.accept")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text/70">{t("meetings.consent.body")}</p>
      </Dialog>
      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("meetings.cancel.title")}
        description={t("meetings.cancel.description")}
        closeLabel={t("meetings.actions.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              {t("meetings.actions.keep")}
            </Button>
            <Button variant="danger" onClick={() => void cancelRecording()}>
              {t("meetings.actions.discard")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text/70">{t("meetings.cancel.body")}</p>
      </Dialog>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("meetings.delete.title")}
        description={t("meetings.delete.description")}
        closeLabel={t("meetings.actions.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t("meetings.actions.keepMeeting")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteTarget !== null) void remove(deleteTarget);
              }}
            >
              {t("meetings.actions.confirmDelete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text/70">{t("meetings.delete.body")}</p>
      </Dialog>
    </div>
  );
};
