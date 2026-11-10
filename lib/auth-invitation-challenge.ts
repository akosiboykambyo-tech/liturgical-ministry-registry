/** Validate an untrusted Supabase invitation link without authenticating it.
 * The client MUST still verify the token hash with Supabase auth.verifyOtp.
 */
export function parseInviteChallenge(href: string): string | null {
  try {
    const url = new URL(href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const queryType = url.searchParams.get("type");
    const fragmentType = fragment.get("type");
    const queryToken = url.searchParams.get("token_hash");
    const fragmentToken = fragment.get("token_hash");
    if (queryType && fragmentType && queryType !== fragmentType) return null;
    if (queryToken && fragmentToken && queryToken !== fragmentToken) return null;
    const type = queryType ?? fragmentType;
    const token = queryToken ?? fragmentToken;
    return type === "invite" && token && /^[a-f0-9]{40,128}$/i.test(token) ? token : null;
  } catch {
    return null;
  }
}
