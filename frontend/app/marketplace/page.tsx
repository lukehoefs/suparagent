import { MarketplaceRedirect } from "@/components/apps/MarketplaceRedirect";

// The MCP marketplace and custom MCP servers are part of the Apps page now; old links land there.
export const metadata = { title: "Apps · lukethomas" };

export default function Page() {
  return <MarketplaceRedirect />;
}
