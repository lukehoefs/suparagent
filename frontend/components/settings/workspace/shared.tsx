"use client";

import { useCallback } from "react";
import { LANGUAGE_TAGS } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { PERMISSION_INFO, togglePermission, type Permission } from "@/lib/permissions";
import { roleChoices, type RoleChoice, type Viewer } from "@/lib/workspace-settings";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Input";

/** Dates in the chosen language: "Nov 17, 2026", or with the time. */
export function useDateFormat(withTime = false): (iso: string) => string {
  const tag = LANGUAGE_TAGS[useLanguageChoice()];
  return useCallback((iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    try {
      return new Intl.DateTimeFormat(tag, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
    } catch {
      return withTime ? date.toLocaleString() : date.toLocaleDateString();
    }
  }, [tag, withTime]);
}

/** The round letter avatar on a member's row (design: 32 px, the selected-grey fill). */
export function MemberAvatar({ initial }: { initial: string }) {
  return (
    <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-hover text-label font-semibold text-ink">
      {initial}
    </span>
  );
}

/** The role menu's width: sized to its text like the design's native select (about 100 px), never
 *  narrower than the longest English choice ("Reply only"), so it does not jump between roles. */
export const ROLE_SELECT_WIDTH = "w-auto min-w-[7.5rem]";

/** The role menu: the four roles as the access presets (Admin, Member, Reply only, Viewer) and Custom. */
export function RoleSelect({
  value,
  viewer,
  current,
  onChange,
  disabled,
  label,
  id,
  className,
}: {
  value: RoleChoice;
  viewer: Viewer;
  current?: { role: string; permissions: readonly string[] };
  onChange: (choice: RoleChoice) => void;
  disabled?: boolean;
  // An accessible name when no visible label points at it.
  label?: string;
  id?: string;
  className?: string;
}) {
  const t = useT();
  const choices = roleChoices(viewer, current);
  return (
    <Select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as RoleChoice)}
      className={className}
      triggerClassName="h-control touch:h-touch"
    >
      {choices.map((choice) => <option key={choice} value={choice}>{t(`members.role.${choice}`)}</option>)}
    </Select>
  );
}

/** What a member may do, one box each. Standing rules are the owner's to give (the server refuses
 *  anyone else), so the box is locked for an admin unless the member already has it. */
export function PermissionChecklist({
  value,
  onChange,
  owner,
  disabled,
  legend,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  owner: boolean;
  disabled?: boolean;
  legend: string;
}) {
  const t = useT();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-field border border-line bg-raised p-3" disabled={disabled}>
      <legend className="px-1 text-small font-medium text-muted">{legend}</legend>
      {PERMISSION_INFO.map((permission) => (
        <Checkbox
          key={permission.id}
          label={t(`members.permission.${permission.id}`)}
          description={t(`members.permissionHelp.${permission.id}`)}
          checked={value.includes(permission.id)}
          disabled={permission.id === "rules" && !owner && !value.includes("rules")}
          onChange={() => onChange(togglePermission(value, permission.id))}
        />
      ))}
    </fieldset>
  );
}
