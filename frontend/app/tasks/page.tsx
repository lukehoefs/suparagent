import { TasksPage } from "@/components/tasks/TasksPage";

export const metadata = { title: "Tasks · lukethomas" };

// The Tasks board (design: Tasks.html). The legacy Telegram and Boat task page that lived here
// moved to /boat-tasks/ (Settings > Channels > Boat tasks links there).
export default function Page() {
  return <TasksPage />;
}
