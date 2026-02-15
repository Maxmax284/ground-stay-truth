

# Add Privacy Policy and Terms of Service for Compliance

The platform currently has no privacy policy, terms of service, or data handling disclosure anywhere. For compliance (GDPR, Thai PDPA, general hospitality best practices), these need to be visible and easily accessible from multiple places.

---

## What Gets Built

A single public page at `/legal` with two sections: **Privacy Policy** and **Terms of Service**, written specifically for a hospitality/property management platform. The page will be accessible without logging in.

---

## Where Links Will Appear

Links to the legal page will be placed in **4 locations** so it's always easy to find:

1. **Guest registration page** (`GuestAuth.tsx`) -- "By signing up, you agree to our Terms of Service and Privacy Policy" text below the sign-up button
2. **Staff login page** (`Auth.tsx`) -- Same treatment
3. **Guest portal footer** (`GuestLayout.tsx`) -- Small footer with Privacy Policy and Terms links
4. **Profile / Account page** (`ProfileEditor.tsx`) -- Link near the Danger Zone / account deletion section, so users reviewing their account can easily find the data policy

---

## Privacy Policy Content Highlights

The privacy policy will cover:
- What personal data is collected (name, email, phone, ID documents, booking history)
- How data is used (booking management, communication, identity verification)
- Data retention periods
- Guest rights (access, correction, deletion -- linking to the existing account deletion feature)
- Third-party data sharing (AI services for translation/verification)
- Cookie/local storage usage
- Contact information for data requests

## Terms of Service Content Highlights

- Booking and cancellation policies (referencing the configurable policy settings)
- Guest responsibilities during stay
- Liability limitations
- Account termination rights
- Dispute resolution

---

## Technical Details

### New Files
| File | Purpose |
|------|---------|
| `src/pages/Legal.tsx` | Public page with Privacy Policy and Terms of Service sections, using tabs or anchor links. Styled consistently with the rest of the app. Wrapped in a minimal layout (not requiring auth). |

### Modified Files
| File | Change |
|------|--------|
| `src/App.tsx` | Add public route: `/legal` |
| `src/pages/GuestAuth.tsx` | Add "By signing up you agree to..." text with links below sign-up form |
| `src/pages/Auth.tsx` | Same treatment for staff auth |
| `src/components/GuestLayout.tsx` | Add small footer with Privacy and Terms links |
| `src/components/ProfileEditor.tsx` | Add a link to Privacy Policy near the Danger Zone section |
| `src/i18n/locales/en.json` | Add translation keys for legal page content and link text |
| All other locale files (th, fr, de, ru, zh, ja, es) | Add translated legal link text (the full legal content will remain in English as the canonical version, with a note that translations are for convenience) |

### Route Configuration
- `/legal` -- public, no auth required
- `/legal#privacy` -- jumps to Privacy Policy section
- `/legal#terms` -- jumps to Terms of Service section

### No database changes needed

---

## Summary

This adds the compliance foundation the platform is missing. The legal page is public, linkable, and accessible from every key touchpoint: sign-up, login, guest portal, and account settings. The existing account deletion feature will be referenced in the privacy policy as the mechanism for exercising data deletion rights.

