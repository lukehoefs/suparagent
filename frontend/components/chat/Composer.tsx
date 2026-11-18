"use client";

import { ArrowUp, BookmarkPlus, Check, ChevronDown, FileText, Image as ImageIcon, Link2, Loader2, Mic, Music, Paperclip, Sparkles, Square, Video as VideoIcon, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useDeferredValue, type ReactNode } from "react";
import type { ChatState } from "@/lib/chat-state";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { isLongPaste, isSendKey, livePastes, removePaste } from "@/lib/composer";
import { loadDraft, saveDraft } from "@/lib/drafts";
import { useT } from "@/lib/use-i18n";
import { MAX_SKILLS_PER_MESSAGE, skillCompletions, suggestSkills, type SkillSummary } from "@/lib/skills";
import { Button } from "@/components/ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { PendingAttachments } from "./Attachments";

const MAX_HEIGHT_PX = 200;

const UPLOAD_CATEGORIES = [
  {
    id: "documents",
    label: "chatPage.attach.document",
    icon: FileText,
    accept: ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.md,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,.ts,.tsx,.py,.sh,.sql,.toml,.ini,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.ms-excel",
  },
  {
    id: "images",
    label: "chatPage.attach.image",
    icon: ImageIcon,
    accept: "image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp",
  },
  {
    id: "videos",
    label: "chatPage.attach.video",
    icon: VideoIcon,
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.mkv",
  },
  {
    id: "audio",
    label: "chatPage.attach.audio",
    icon: Music,
    accept: "audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm",
  },
];

// The message box (design: Chat.html): chips on top (files, an audio link, pasted blocks, the skills
// picked for this message), the text, and a bar with the paperclip menu (files by kind, an audio or
// podcast link, pick skills, save as skill), the "Type / for skills" hint, the model and effort,
// dictation and Send or Stop.
// Enter sends, Shift+Enter adds a line, and Enter during IME composition does neither.
export function Composer({
  value,
  onChange,
  onSend,
  sending,
  blockedReason,
  blockedAction,
  error,
  running,
  workingMode = null,
  stopping,
  onStop,
  files = [],
  onAddFiles,
  onRemoveFile,
  attachNotice = null,
  focusRequested = false,
  onFocused,
  skills,
  chosenSkills = [],
  onToggleSkill,
  onSaveAsSkill,
  draftKey = null,
  state,
  modelSwitch,
  above,
  placeholder,
  onAudioLink,
  audioLink = null,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  // Why a message cannot be sent right now (a turn is running, the session is
  // broken, ...). Null when it can.
  blockedReason: string | null;
  // A way to clear the block, such as signing the engine in (shown while the box is blocked).
  blockedAction?: { label: string; onClick: () => void } | null;
  error: string | null;
  // An answer is being written: the button becomes Stop.
  running: boolean;
  // While running, text is steered into the live turn or queued for the next one.
  workingMode?: "steer" | "queue" | null;
  // Stop was pressed and the answer has not ended yet.
  stopping: boolean;
  onStop: () => void;
  // Files chosen for the next message (docs/EVERYDAY.md). Without onAddFiles
  // the composer offers no attachments.
  files?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  // Why an attachment was refused or cannot be sent, if anything.
  attachNotice?: string | null;
  // New chat asks for the box to take focus; onFocused clears the request.
  focusRequested?: boolean;
  onFocused?: () => void;
  // The agent's skills. With onToggleSkill the box offers a picker and `/name` completion;
  // chosen ones are sent with the next message only. A skill never starts on its own.
  skills?: SkillSummary[];
  chosenSkills?: string[];
  onToggleSkill?: (name: string) => void;
  // Opens the skill editor seeded from this conversation. Sends and saves nothing.
  onSaveAsSkill?: () => void;
  // Identifies the conversation (its id, or "new"). With it the unsent text is kept per
  // conversation and put back when you return. Without it nothing is stored.
  draftKey?: string | null;
  // The chat's state (lib/chat-state.ts), shared with the header pill so the two always agree:
  // waiting shows Send (a message steers or queues; Deny on the card ends the wait), working shows
  // Stop, idle shows Send. Defaults from `running` alone.
  state?: ChatState;
  // The engine, model and effort for this chat ("Opus · High"); opens the model dialog.
  modelSwitch?: { label: string; onClick: () => void; disabled: boolean };
  // Docked above the box, in the same column (the waiting approval card).
  above?: ReactNode;
  // What the empty box says ("Message Atlas"); a reason the box is blocked comes first.
  placeholder?: string;
  // Opens the audio or podcast link dialog, from the paperclip menu.
  onAudioLink?: () => void;
  // The audio link the next message carries, as a chip that opens the dialog again or removes it.
  audioLink?: { label: string; onEdit: () => void; onRemove: () => void } | null;
}) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const menuId = useId();
  // Long pasted blocks show as a chip; the text stays in the box so Send still includes it.
  const [pasted, setPasted] = useState<{ key: string | null; list: string[] }>({ key: draftKey, list: [] });
  const latestValue = useRef(value);
  useEffect(() => { latestValue.current = value; }, [value]);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const chips = pasted.key === draftKey ? livePastes(value, pasted.list) : [];
  const setPastes = (update: (all: string[]) => string[]) => setPasted({ key: draftKey, list: update(pasted.key === draftKey ? pasted.list : []) });
  // Drafts: put the saved text back when the conversation changes, then keep saving edits.
  // `restored` stops the old text being written under the new key before it is swapped.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    restored.current = draftKey;
    const saved = loadDraft(draftKey);
    if (draftKey && saved) onChange(saved);
    // Only a change of conversation restores; later edits flow through `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (draftKey && restored.current === draftKey) saveDraft(draftKey, value);
  }, [draftKey, value]);
  const [menu, setMenu] = useState({ context: "", index: 0, dismissed: false });
  const enabledSkills = (skills ?? []).filter((s) => s.enabled);
  const completions = onToggleSkill ? skillCompletions(value, enabledSkills, chosenSkills) : [];
  // Skills whose trigger phrase appears in the draft: offered as chips, never picked or run for the person.
  const deferredValue = useDeferredValue(value);
  const suggested = onToggleSkill && !sending && !running && deferredValue.trim().length >= 3 && !deferredValue.startsWith("/")
    && enabledSkills.some((s) => (s.triggers?.length ?? 0) > 0)
    ? suggestSkills(deferredValue, enabledSkills, chosenSkills) : [];
  // A changed query or available list starts at the first result, even after Escape.
  const menuContext = JSON.stringify([value, completions.map((s) => s.name)]);
  const activeIndex = menu.context === menuContext ? Math.min(menu.index, Math.max(0, completions.length - 1)) : 0;
  const slashOpen = focused && !sending && !running && !pickerOpen && !!onToggleSkill && /^\/[a-z0-9-]*$/.test(value)
    && !(menu.context === menuContext && menu.dismissed);
  const activeOption = slashOpen && completions.length > 0 ? `${menuId}-${activeIndex}` : undefined;
  const dismissMenu = () => setMenu({ context: menuContext, index: activeIndex, dismissed: true });
  const pick = (name: string) => {
    if (sending || running || (!chosenSkills.includes(name) && chosenSkills.length >= MAX_SKILLS_PER_MESSAGE)) return;
    onToggleSkill?.(name);
    onChange("");
    box.current?.focus();
  };

  useEffect(() => {
    if (!focusRequested) return;
    box.current?.focus();
    onFocused?.();
  }, [focusRequested, onFocused]);

  // Grows with the text up to a limit.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const triggerUploadCategory = (acceptPattern: string) => {
    if (!picker.current) return;
    picker.current.accept = acceptPattern;
    picker.current.click();
  };

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
          setRecording(false);
          setTranscribing(false);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (blob.size === 0) {
          setRecording(false);
          setTranscribing(false);
          return;
        }

        setTranscribing(true);
        setDictationError(null);
        try {
          const res = await api.dictateAudio(blob, "recording.webm");
          const text = res.text?.trim();
          if (text) {
            const current = latestValue.current;
            onChange(current.trim() ? `${current.trim()} ${text}` : text);
          }
        } catch (err) {
          console.error("Dictation failed:", err);
          setDictationError(t("chatPage.dictationFailed"));
        } finally {
          setTranscribing(false);
          setRecording(false);
          box.current?.focus();
        }
      };

      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to access microphone:", err);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    audioChunksRef.current = [];
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorderRef.current.stop();
      }
    }
    setRecording(false);
    setTranscribing(false);
    setRecordSeconds(0);
  };

  const canSend = !sending && blockedReason === null && value.trim() !== "";
  const shown: ChatState = state ?? (running ? "working" : "idle");
  const carriesFiles = (types: readonly string[]) => types.includes("Files");

  return (
    <div
      className="shrink-0 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      onDragOver={(e) => {
        if (!onAddFiles || !carriesFiles(Array.from(e.dataTransfer.types))) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!onAddFiles || !carriesFiles(Array.from(e.dataTransfer.types))) return;
        e.preventDefault();
        setDragging(false);
        onAddFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="mx-auto max-w-[712px]">
        {above}
        {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
        {attachNotice && <p role="status" className="mb-2 text-sm text-warning">{attachNotice}</p>}
        <div
          className={cn(
            // A floating panel: shadow, no border (design tokens). The focus ring is the accent.
            "flex flex-col gap-2 rounded-chat bg-raised px-3.5 py-3 shadow-float transition-shadow duration-(--dur-fast) focus-within:ring-2 focus-within:ring-accent/40",
            dragging && "ring-2 ring-accent bg-accent-bg",
          )}
        >
          {onRemoveFile && files.length > 0 && (
            <div>
              <PendingAttachments files={files} onRemove={onRemoveFile} disabled={sending} />
            </div>
          )}
          {audioLink && (
            <ul aria-label={t("chat.audioLink")} className="flex flex-wrap gap-1.5">
              <li className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-line bg-inset py-0.5 pl-0.5 pr-1 text-xs text-ink">
                <button type="button" onClick={audioLink.onEdit} disabled={sending} aria-label={t("chatPage.audioChipEdit", { link: audioLink.label })} title={t("chatPage.audioChipEdit", { link: audioLink.label })} className="inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-hover touch:min-h-8">
                  <Link2 size={12} aria-hidden="true" className="shrink-0 text-muted" />
                  <span className="truncate">{audioLink.label}</span>
                </button>
                <button type="button" disabled={sending} onClick={audioLink.onRemove} aria-label={t("chatPage.audioChipRemove")} className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink touch:size-8">
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            </ul>
          )}
          {chips.length > 0 && (
            <ul aria-label={t("composer.pastedList")} className="flex flex-wrap gap-1.5">
              {chips.map((text, i) => (
                <li key={`${i}-${text.length}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-inset py-0.5 pl-2.5 pr-1 text-xs text-ink">
                  <span className="truncate" title={text.slice(0, 200)}>{t("composer.pasted", { count: text.length.toLocaleString() })}</span>
                  <button type="button" disabled={sending} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(removePaste(value, text)); setPastes((all) => all.filter((p) => p !== text)); }} aria-label={t("composer.removePasted")} className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink touch:size-8">
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosenSkills.length > 0 && onToggleSkill && (
            <ul aria-label={t("composer.skillsForMessage")} className="flex flex-wrap gap-1.5">
              {chosenSkills.map((name) => (
                <li key={name} className="inline-flex max-w-full items-center gap-1 rounded-inner bg-accent-bg py-0.5 pl-2 pr-1 font-mono text-small font-medium text-accent-text">
                  <span className="truncate">/{name}</span>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onToggleSkill(name)} aria-label={t("composer.removeSkill", { name })} className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-inner text-current hover:bg-accent/15 touch:size-8">
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {suggested.length > 0 && chosenSkills.length < MAX_SKILLS_PER_MESSAGE && onToggleSkill && (
            <ul aria-label={t("composer.skills")} className="flex flex-wrap gap-1.5">
              {suggested.map((sk) => (
                <li key={sk.name} className="max-w-full">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onToggleSkill(sk.name)} title={sk.description} className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-line bg-raised py-0.5 pl-2 pr-2.5 text-xs text-muted hover:bg-hover hover:text-ink">
                    <Sparkles size={12} aria-hidden="true" className="shrink-0 text-accent-text" />
                    <span className="truncate">{t("composer.useSkill", { name: sk.name })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {slashOpen && completions.length > 0 && (
            <ul id={menuId} role="listbox" aria-label={t("composer.skills")} className="max-h-48 overflow-y-auto rounded-field border border-line bg-raised text-sm shadow-md">
              {completions.map((s, i) => (
                <li key={s.name} role="presentation">
                  <button id={`${menuId}-${i}`} type="button" role="option" aria-selected={i === activeIndex}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setMenu({ context: menuContext, index: i, dismissed: false })}
                    onClick={() => pick(s.name)}
                    className={cn("flex w-full min-w-0 cursor-pointer flex-col px-3 py-1.5 text-left hover:bg-hover", i === activeIndex && "bg-hover")}>
                    <span className="font-mono text-xs">/{s.name}</span>
                    <span className="truncate text-xs text-muted">{s.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {slashOpen && completions.length === 0 && (
            <p role="status" className="py-1 text-xs text-muted">
              {chosenSkills.length >= MAX_SKILLS_PER_MESSAGE
                ? t("composer.skillsLimitReached", { max: MAX_SKILLS_PER_MESSAGE })
                : enabledSkills.length === 0
                  ? t("composer.noEnabledSkills")
                  : t("composer.noMatchingSkills")}
            </p>
          )}
          {pickerOpen && onToggleSkill && (
            <div role="group" aria-label={t("composer.pickSkillsButton")} className="max-h-48 overflow-y-auto rounded-field border border-line bg-raised text-sm shadow-md">
              {enabledSkills.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">{t("composer.noEnabledSkills")}</p>
              ) : (
                enabledSkills.map((s) => {
                  const on = chosenSkills.includes(s.name);
                  const full = !on && chosenSkills.length >= MAX_SKILLS_PER_MESSAGE;
                  return (
                    <label key={s.name} className={cn("flex min-w-0 items-start gap-2 px-3 py-1.5", full ? "opacity-50" : "cursor-pointer hover:bg-hover")}>
                      <input type="checkbox" className="mt-1" checked={on} disabled={full} onChange={() => onToggleSkill(s.name)} />
                      <span className="min-w-0">
                        <span className="block font-mono text-xs">/{s.name}</span>
                        <span className="block truncate text-xs text-muted">{s.description}</span>
                      </span>
                    </label>
                  );
                })
              )}
              {enabledSkills.length > 0 && <p className="px-3 py-1 text-xs text-faint">{t("composer.skillsLimit", { max: MAX_SKILLS_PER_MESSAGE })}</p>}
            </div>
          )}
          {dragging && <p className="text-xs text-accent-text">{t("composer.dropAttach")}</p>}

          {/* Full-width textarea */}
          <div className="relative w-full">
            <textarea
              ref={box}
              value={value}
              onChange={(e) => {
                setMenu({ context: "", index: 0, dismissed: false });
                onChange(e.target.value);
              }}
              onFocus={() => {
                setFocused(true);
                setMenu({ context: "", index: 0, dismissed: false });
              }}
              onBlur={() => { setFocused(false); dismissMenu(); }}
              aria-autocomplete={onToggleSkill ? "list" : undefined}
              aria-haspopup={onToggleSkill ? "listbox" : undefined}
              aria-controls={activeOption ? menuId : undefined}
              aria-activedescendant={activeOption}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length === 0) {
                  const text = e.clipboardData.getData("text");
                  if (isLongPaste(text) && !sending) {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const at = el.selectionStart;
                    onChange(value.slice(0, at) + text + value.slice(el.selectionEnd));
                    setPastes((all) => [...all, text]);
                  }
                  return;
                }
                if (!onAddFiles) return;
                e.preventDefault();
                if (!running) onAddFiles(pasted);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                if (slashOpen && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && completions.length > 0) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const index = (activeIndex + (e.key === "ArrowDown" ? 1 : -1) + completions.length) % completions.length;
                    setMenu({ context: menuContext, index, dismissed: false });
                    document.getElementById(`${menuId}-${index}`)?.scrollIntoView({ block: "nearest" });
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pick(completions[activeIndex].name);
                    return;
                  }
                }
                if (e.key === "Escape" && (slashOpen || pickerOpen)) {
                  e.preventDefault();
                  e.stopPropagation();
                  dismissMenu();
                  setPickerOpen(false);
                  return;
                }
                if (isSendKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode })) {
                  e.preventDefault();
                  if (canSend) onSend();
                }
              }}
              rows={1}
              placeholder={blockedReason ?? (workingMode === "steer" ? t("composer.steerPlaceholder") : workingMode === "queue" ? t("composer.queuePlaceholder") : placeholder ?? t("composer.placeholder"))}
              aria-label={t("composer.label")}
              className="block w-full max-h-52 min-h-11 resize-none bg-transparent p-0 text-body text-ink outline-none placeholder:text-faint focus-visible:outline-none"
            />
          </div>

          {/* The bar: the paperclip menu and the hint; the model, dictation and Send or Stop. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {onAddFiles && (
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  aria-hidden
                  tabIndex={-1}
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.wav,.mp3,.m4a,.ogg,.flac,.webm,image/png,image/jpeg,image/gif,image/webp,.mp4,.mov,.txt,.md,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,.ts,.tsx,.py,.sh,.sql,.toml,.ini"
                  onChange={(e) => {
                    onAddFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              )}
              {(onAddFiles || onAudioLink || onToggleSkill || onSaveAsSkill) && (
                <Menu
                  open={attachMenuOpen}
                  onOpenChange={setAttachMenuOpen}
                  side="top"
                  align="start"
                  className="w-56"
                  trigger={
                    <button
                      type="button"
                      onClick={() => { dismissMenu(); setPickerOpen(false); }}
                      disabled={sending || running}
                      aria-label={t("chatPage.attachMenu")}
                      title={attachMenuOpen ? t("chatPage.closeMenu") : t("composer.attach")}
                      className={cn(
                        "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 touch:size-11",
                        attachMenuOpen && "bg-hover text-ink",
                      )}
                    >
                      <Paperclip size={16} aria-hidden="true" />
                    </button>
                  }
                >
                  {onAddFiles && UPLOAD_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <MenuItem key={cat.id} onSelect={() => triggerUploadCategory(cat.accept)} icon={<Icon size={15} className="text-muted" />}>
                        {t(cat.label)}
                      </MenuItem>
                    );
                  })}
                  {onAudioLink && <MenuItem onSelect={onAudioLink} icon={<Link2 size={15} className="text-muted" />}>{t("chatPage.audioLinkItem")}</MenuItem>}
                  {(onToggleSkill || onSaveAsSkill) && (onAddFiles || onAudioLink) && <MenuSeparator />}
                  {onToggleSkill && (
                    <MenuItem onSelect={() => { dismissMenu(); setPickerOpen(true); }} icon={<Sparkles size={15} className="text-muted" />}>
                      {t("composer.pickSkillsButton")}
                    </MenuItem>
                  )}
                  {onSaveAsSkill && <MenuItem onSelect={onSaveAsSkill} icon={<BookmarkPlus size={15} className="text-muted" />}>{t("composer.saveSkill")}</MenuItem>}
                </Menu>
              )}
              {pickerOpen && onToggleSkill && (
                <button type="button" onClick={() => setPickerOpen(false)} className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-field bg-accent-bg px-2 text-small font-medium text-accent-text hover:opacity-90 touch:h-touch">
                  {t("chatPage.closeSkills")}
                  <X size={12} aria-hidden="true" />
                </button>
              )}
              {onToggleSkill && !pickerOpen && <span className="hidden truncate text-small text-faint sm:inline">{t("composer.skillsHint")}</span>}
            </div>

            <div className="flex items-center gap-2">
              {modelSwitch && (
                <button
                  type="button"
                  onClick={modelSwitch.onClick}
                  disabled={modelSwitch.disabled}
                  aria-label={t("composer.model", { label: modelSwitch.label })}
                  title={t("composer.model", { label: modelSwitch.label })}
                  className="inline-flex h-control max-w-48 min-w-0 cursor-pointer items-center gap-1 rounded-field px-2.5 text-label font-medium text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 touch:h-touch"
                >
                  <span className="truncate">{modelSwitch.label}</span>
                  <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
                </button>
              )}
              {recording ? (
                <div className="flex items-center gap-2 rounded-full border border-danger/40 bg-danger/10 px-3 py-1 text-xs font-medium text-danger animate-pulse">
                  <span className="size-2 rounded-full bg-danger animate-ping" />
                  <span>
                    {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-danger-fill text-white hover:opacity-90 cursor-pointer"
                    title={t("chatPage.finishDictation")}
                    aria-label={t("chatPage.finishDictation")}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="inline-flex size-5 items-center justify-center rounded-full bg-danger/20 text-danger hover:bg-danger/30 cursor-pointer"
                    title={t("chatPage.cancelDictation")}
                    aria-label={t("chatPage.cancelDictation")}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : transcribing ? (
                <div className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-muted shadow-xs">
                  <Loader2 size={13} className="animate-spin text-accent-text" />
                  <span>{t("chatPage.transcribing")}</span>
                </div>
              ) : (
                !running && (
                  <Tooltip content={t("chatPage.dictateHint")}>
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={sending}
                      aria-label={t("chatPage.dictate")}
                      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 touch:size-11"
                    >
                      <Mic size={16} aria-hidden="true" />
                    </button>
                  </Tooltip>
                )
              )}

              {shown === "working" ? (
                <>
                  {workingMode && (
                    <Tooltip content={workingMode === "steer" ? t("composer.steerHint") : t("composer.queueHint")}>
                      <span>
                        <button
                          type="button"
                          onClick={onSend}
                          disabled={!canSend}
                          aria-label={workingMode === "steer" ? t("composer.steerHint") : t("composer.queueHint")}
                          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 touch:size-11"
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </Tooltip>
                  )}
                  <Button
                    variant="primary"
                    onClick={onStop}
                    disabled={stopping}
                    aria-label={stopping ? t("composer.stoppingLabel") : t("composer.stopGenerating")}
                    title={stopping ? t("composer.stopping") : t("composer.stopGenerating")}
                    icon={<Square size={12} aria-hidden="true" className="fill-current" />}
                  >
                    {t("composer.stop")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={onSend}
                  disabled={!canSend}
                  aria-label={t("composer.sendMessage")}
                  title={sending ? t("composer.sending") : canSend ? (shown === "waiting" && workingMode === "queue" ? t("composer.queueHint") : shown === "waiting" && workingMode === "steer" ? t("composer.steerHint") : t("composer.sendHint")) : (blockedReason ?? t("composer.enterMessageHint"))}
                  icon={<ArrowUp size={15} aria-hidden="true" />}
                >
                  {t("composer.send")}
                </Button>
              )}
            </div>
          </div>
        </div>
        {blockedAction && blockedReason && (
          <div className="mt-2 px-3">
            <Button variant="primary" size="sm" onClick={blockedAction.onClick}>{blockedAction.label}</Button>
          </div>
        )}
        {dictationError && <p role="alert" className="mt-1.5 px-3 text-xs text-muted">{dictationError}</p>}
        {blockedReason && value.trim() !== "" && <p className="mt-1.5 px-3 text-xs text-muted">{blockedReason}</p>}
      </div>
    </div>
  );
}
