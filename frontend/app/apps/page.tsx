import { AuthGate } from "@/components/AuthGate";
import { AppsApp } from "@/components/AppsApp";

export const metadata = { title: "Apps · lukethomas" };

export default function AppsPage() {
  return (
    <AuthGate>
      <AppsApp />
    </AuthGate>
  );
}
