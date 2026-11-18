import { GeneralSettings } from "@/components/settings/GeneralSettings";

export const metadata = { title: "Engines · lukethomas" };

// Engines is a section of the one General page (design: WorkspaceSettings.html); this address opens it there.
export default function Page() {
  return <GeneralSettings section="engines" />;
}
