import { AuthGate } from "@/components/AuthGate";
import { MarketplaceApp } from "@/components/MarketplaceApp";

export const metadata = { title: "MCP Marketplace · lukethomas" };

export default function MarketplacePage() {
  return <AuthGate><MarketplaceApp /></AuthGate>;
}
