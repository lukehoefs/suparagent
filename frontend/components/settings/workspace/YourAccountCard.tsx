"use client";

import { useCallback, useEffect, useState } from "react";
import { people, type Person } from "@/lib/people";
import { useSession } from "@/components/AuthGate";
import { YourAccount } from "@/components/PeopleAccount";

// Your own name and password (it sat with the people list on Account & privacy; the list moved to
// Members). Only for a signed-in member of a self-hosted workspace: the desktop app is one person,
// and a hosted workspace signs people in through the account service.
export function YourAccountCard() {
  const { session } = useSession();
  const present = session !== null && session.kind !== "desktop" && session.kind !== "grant" && session.person_id != null;
  const [me, setMe] = useState<Person | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!present) return;
    let alive = true;
    people.list()
      .then((list) => { if (alive) setMe(list.find((person) => person.is_you) ?? null); })
      .catch(() => { if (alive) setMe(null); });
    return () => { alive = false; };
  }, [present, tick]);

  if (!present || !session || !me) return null;
  return <YourAccount session={session} me={me} onChanged={refresh} />;
}
