import { api } from "@/lib/api";
import { clientIdsOf, withAgentClients } from "@/lib/agent-settings";

// After an agent is deleted, take its id out of every client's agent list (clients.json is not
// cleaned by the backend). Best effort: the delete stands even if this fails, and client lookups
// already ignore ids that no longer exist. Admin only, like GET and PUT /clients.
export async function removeAgentFromClients(agentId: number): Promise<void> {
  try {
    const { clients } = await api.getClients();
    if (clientIdsOf(clients, agentId).length > 0) await api.saveClients(withAgentClients(clients, agentId, []));
  } catch {
    // ignored: see above
  }
}
