# COWL-DOK staff invitation, password setup, and Resend email delivery

## Identified problem

Previously, staff invited from Supabase Dashboard > Authentication > Users received the default Supabase invitation template. That invite confirmed their address and established a session, but the live app had no first-time invitation password screen. The existing Forgot Password page also used Supabase Auth email delivery rather than COWL-DOK's Resend API notification routes.

This change resolves the **website** portion of the problem. Authentication email delivery settings must be applied separately in the production Supabase dashboard.

## Website changes

- New /admin/accept-invite with the diocesan sign-in aesthetic. It calls Supabase Auth verifyOtp using the one-time invitation token hash, then shows a password setup form only for a successfully verified invitation. It checks password complexity, asks for confirmation, calls updateUser and signs out after successful setup.
- No existing authenticated session alone can unlock the invitation setup form. Expired/used invitation links instead point to /admin/forgot-password.
- /admin/reset-password verifies the **new branded recovery token hash** using verifyOtp(type: recovery), and retains the previous Supabase recovery-link path for compatibility with existing Registry users. A later isolated hardening pass should review the legacy recovery acceptance path before changing it.
- The unified login includes a visible password-setup option for already-invited users.
- Registry roles and COWL/Curia financial grants stay unchanged.

## Two branded Supabase email templates

Version-controlled, ready to paste into the corresponding Supabase Auth Email Templates fields:

1. **Invite user**: `emails/supabase-invite.html`. Subject: `COWL-DOK | Activate your staff account`.
   - Link: `https://www.cowl-dok.online/admin/accept-invite?token_hash={{ .TokenHash }}&type=invite`.
   - Supabase's `{{ .TokenHash }}` variable is replaced server-side. Do not paste a real user token into a template.
2. **Reset password**: `emails/supabase-recovery.html`. Subject: `COWL-DOK | Set or reset your password`.
   - Link: `https://www.cowl-dok.online/admin/reset-password?token_hash={{ .TokenHash }}&type=recovery`.

These emails use the COWL-DOK diocesan burgundy (#890022), institutional typography and neutral backgrounds. They are **new branded Auth templates**. Existing application Resend email notifications remain unaffected. Supabase SMTP does **not** automatically use HTML templates stored in the Resend dashboard: to get the same visual design, paste the HTML into Supabase's own Auth templates.

## Production Supabase setup — authorized project owner action

Go to `https://supabase.com/dashboard/project/zlvofcwnpdzfdnipvbbd/auth/templates`.

- Select **Invite user**, set subject and paste `emails/supabase-invite.html` contents. Save.
- Select **Reset password**, set subject and paste `emails/supabase-recovery.html` contents. Save.
- In Authentication > URL Configuration, make sure Site URL is `https://www.cowl-dok.online`; allow `https://www.cowl-dok.online/admin/accept-invite` and `https://www.cowl-dok.online/admin/reset-password`. Do not change unrelated redirects. Even though these templates use token hashes directly, keeping allowlisted URLs aligned avoids future flow failures.

Go to `https://supabase.com/dashboard/project/zlvofcwnpdzfdnipvbbd/settings/auth` (Auth Email/SMTP location in dashboard may be under Authentication > SMTP Settings):

- Enable custom SMTP with Resend credentials. Host: `smtp.resend.com`. Port: `465` (SSL); Username: `resend`. Password: the **Resend API key**, entered directly in the dashboard; never send it to ChatGPT or add it to GitHub.
- Sender name: `COWL-DOK Portal`; sender email: a **verified** address from your existing Resend sending domain, e.g. your actual `RESEND_FROM_EMAIL` identity. Verify the sender in Resend first and preserve SPF, DKIM, DMARC.
- Save and verify the provider configuration with a single controlled test email after deployment. Disable link tracking on authentication emails, if enabled in Resend.

SMTP enables Supabase **Auth** delivery through Resend. It is separate from Vercel `RESEND_API_KEY`, which is already used by application notification API routes; setting only Vercel variables does not modify Supabase Auth email delivery.

## Recovery for the two already-invited production accounts

These existing invitations were **already accepted**. Do not attempt to re-invite an already confirmed account or delete/recreate it.

1. After enabling Resend SMTP and the branded password recovery template, visit `https://www.cowl-dok.online/admin/forgot-password`.
2. For the COWL test email, request a password setup link. Click the new **COWL-DOK / Resend-delivered** email and complete the verified `/admin/reset-password` form.
3. Repeat for the Curia test email (prefer a separate private browser profile). Never share the recovery links or passwords.
4. Sign in to `/admin` separately with each email and new password; verify they land in COWL and Curia read-only workspaces. Test an existing Registry Administrator for no regression.

The production finance viewer grants are already assigned to these Auth identities and remain unaffected by password changes.

## Acceptance gates and safety

- No password, OTP, auth token or SMTP API key is stored in repository documentation or test fixtures.
- New invitations must arrive from the verified sender via Resend SMTP and open COWL-DOK's verified invitation page before allowing password setup.
- Reused/expired invitation links fail closed, with password recovery offered.
- Password recovery links must be verified by Supabase Auth before they allow updateUser.
- Do not send new invitations or test recovery until the branded templates and Resend SMTP are configured, to avoid more default Supabase emails.
- Existing Registry login, sign-in lockout, members, certificates, finance read-only permissions and production database are unchanged by these web-only changes.

## References

- Supabase Invite User and redirects: https://supabase.com/docs/guides/auth/users
- Supabase Auth Email Templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Resend SMTP settings: https://resend.com/changelog/smtp-service
