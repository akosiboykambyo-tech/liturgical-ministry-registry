import { PublicStatusPage } from "@/components/public-status-page";

export default function NotFound() {
  return (
    <PublicStatusPage
      status="404 · Page not found"
      title="We couldn’t find that page."
      description="The page may have moved, or the address may be incorrect. You can return to the registry or continue with member verification."
      actions={[
        { href: "/", label: "Return to registry" },
        { href: "/verify", label: "Verify a minister" },
      ]}
    />
  );
}
