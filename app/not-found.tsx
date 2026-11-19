import { PublicErrorPage } from "@/components/public-error-page";

export default function NotFound() {
  return (
    <PublicErrorPage
      status="404"
      title="Seek, and ye shall find. Just not here."
      description="We left the ninety-nine and went looking for this page, but it has wandered off. Check the address for typos, or return home."
      actions={[{ href: "/", label: "Return Home" }]}
    />
  );
}
