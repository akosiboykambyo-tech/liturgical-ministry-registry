import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { PublicStatusPage } from "@/components/public-status-page";

/**
 * If maintenance is enabled, the gate renders the active maintenance screen.
 * Otherwise this fallback uses the same public status layout as other utility pages.
 */
export default function MaintenancePage() {
  return (
    <PublicMaintenanceGate>
      <PublicStatusPage
        status="Service available"
        title="The registry is available."
        description="Maintenance mode is not currently active. You can return to the public registry and continue as usual."
        actions={[{ href: "/", label: "Return to registry" }]}
      />
    </PublicMaintenanceGate>
  );
}
