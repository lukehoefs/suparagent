import { GeneralSettings } from "@/components/settings/GeneralSettings";

export const metadata = { title: "Members · lukethomas" };

// Members is a section of the one General page (design: WorkspaceSettings.html); this address opens it there.
export default function Page() {
  return <GeneralSettings section="members" />;
}
