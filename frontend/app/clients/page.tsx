import { AuthGate } from "@/components/AuthGate";
import { ClientsApp } from "@/components/ClientsApp";

export const metadata = { title: "Clients · lukethomas" };

export default function ClientsPage() {
  return (
    <AuthGate>
      <ClientsApp />
    </AuthGate>
  );
}
