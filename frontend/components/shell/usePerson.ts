"use client";

import { useEffect, useState } from "react";
import { profileApi, readCachedProfile } from "@/lib/profile";
import { signedInPerson, wantsProfileName } from "@/lib/sidebar";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";

// One read of the profile at a time, shared by every footer on the page.
let reading: Promise<string | null> | null = null;

function readProfileName(): Promise<string | null> {
  reading ??= profileApi.getProfile()
    .then((profile) => profile.name?.trim() || null)
    .finally(() => { reading = null; });
  return reading;
}

/**
 * Who the sidebar footer names (design: "Luke · LH Tech", "Owner · LH Tech" on the phone): the
 * session's own name, else the owner's profile name (as Today's greeting reads it), else the
 * session's label, else "You"; `detail` is the role. The profile is read only for an owner or
 * admin whose session carries no name.
 */
export function useSignedInPerson(): { name: string; detail: string | null } {
  const t = useT();
  const { session } = useSession();
  const wants = wantsProfileName(session);
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    if (!wants) return;
    let alive = true;
    // The name saved with the last read shows at once; the read then confirms or changes it.
    const cached = readCachedProfile()?.name?.trim() || null;
    if (cached) queueMicrotask(() => { if (alive) setProfileName((current) => current ?? cached); });
    readProfileName().then((name) => { if (alive) setProfileName(name); }).catch(() => undefined);
    return () => { alive = false; };
  }, [wants]);
  const person = signedInPerson(session, profileName);
  return { name: person.name ?? t("sidebar.you"), detail: person.role ? t(`members.role.${person.role}`) : null };
}
