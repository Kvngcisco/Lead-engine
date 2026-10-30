# Lead Engine

A beginner-friendly prospecting dashboard for UK aesthetic clinics and med spas, dentists, hair salons, and beauty businesses. It uses OpenStreetMap Overpass for the free lead source, looks for public email addresses on business websites, flags simple website issues, drafts tailored outreach and lets you track status and notes. It does not send prospect outreach automatically.

## Run locally

1. Install Node.js 18.17+ (Node 20 LTS recommended).
2. Open a terminal in this `lead-engine` folder and run `npm install`.
3. Copy `.env.example` to `.env.local`. Generate a long random `CRON_SECRET`; keep it private.
4. Run `npm run dev` and open http://localhost:3000.
5. Click **Find new leads**. Internet access to Overpass and target websites is needed.
6. Verify production with `npm run build`, then `npm run start`.

## Push to GitHub

1. Create an empty repository on GitHub.
2. In this folder run:

   ```bash
   git init
   git add .
   git commit -m "Build Lead Engine"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

Replace the sample repository URL with your own. Never commit `.env.local`, secrets, or lead data. If Git says this folder already has a repository, keep its history and add, commit, and push the new app files instead.

## Deploy to Vercel

1. Import the GitHub repository into Vercel, keep the Next.js preset, then deploy.
2. In Project Settings > Environment Variables set a strong `CRON_SECRET` and the Upstash variables below, then redeploy.
3. `vercel.json` schedules `/api/generate` at `0 6 * * *` (06:00 UTC, 11:00 AM in Nigeria during WAT).

Vercel Hobby Cron is once daily. Each run is bounded to a target of 80 leads (configurable up to 120) and a 38-second email-site crawl budget. This does not guarantee 500 daily leads. Use the dashboard button or a protected API call for another batch. If you need multiple scheduled batches, confirm Vercel's current cron plan limits first.

## Environment variables

| Variable | Needed | Use |
| --- | --- | --- |
| `CRON_SECRET` | Recommended | Protects lead generation, updates, exports, messages and digest. Send as `Authorization: Bearer <secret>`. |
| `LEAD_TOWNS` | Optional | Comma-separated UK towns. Defaults: Manchester, Birmingham, Leeds, Bristol, Nottingham, Liverpool, London, Sheffield, Newcastle upon Tyne, Cardiff. |
| `LEAD_BATCH_SIZE` | Optional | Number to attempt per run, default 80, capped at 120. |
| `KV_REST_API_URL` | Recommended on Vercel | Upstash Redis REST URL for durable storage. |
| `KV_REST_API_TOKEN` | Recommended on Vercel | Upstash REST token. Configure both KV variables together. |
| `SMTP_HOST` | Optional | SMTP server for a daily digest email. |
| `SMTP_PORT` | Optional | SMTP port, defaults to 587. |
| `SMTP_SECURE` | Optional | `true` for implicit TLS, often port 465. |
| `SMTP_USER` | Optional | SMTP username and sender address. |
| `SMTP_PASS` | Optional | SMTP password or app password. |
| `LEAD_ALERT_EMAIL` | Optional | Your inbox for the digest. |
| `EMAIL_FINDER_API_KEY` | Future | Reserved for a paid email-finder API; free website scraping does not use it. |
| `MESSAGE_MODEL_API_KEY` | Future | Reserved if you later connect an LLM for draft generation. |

## Storage, dedupe, and limits

For local work, with no KV variables the app stores data in `data/leads.json`. That file is ignored by Git. Vercel serverless files are ephemeral/read-only, so JSON fallback is not durable in production. Create an Upstash Redis REST database and configure both KV variables. The app stores its document at `lead-engine:store:v1`.

Every candidate has a fingerprint based on business, town and type. Previously processed businesses are skipped across new runs. The store retains up to 15,000 leads and 100,000 seen fingerprints. Because Overpass data is community-maintained and rate-limited, actual lead yield varies by town and tag quality.

## Daily digest email

When the Vercel cron invokes the protected generation endpoint, the app sends a digest to `LEAD_ALERT_EMAIL` only if all four SMTP settings are present. It includes lead counts, a short sample of email contacts and a CSV attachment. Missing SMTP settings disable the digest without affecting the lead pull. The app never automatically emails prospects.

## Dashboard and outreach workflow

- Search and filter by email availability, business type, town and pipeline status; export CSV.
- Mobile-friendly layout with dark/light theme.
- Click a lead to open contact methods, status, notes, website issue and message drafts.
- Statuses: new, contacted, replied, won, lost. Notes/status are saved with the lead.
- First-touch email, WhatsApp note and follow-up plus day 3, day 7, and day 14 email sequence are editable drafts. Buttons copy text or open the user's email/WhatsApp app with the draft. Review and send yourself.
- The website-preview block displays a domain and link, not a screenshot.

## Plug in a paid email finder later

Email enrichment is in `lib/email-scraper.js`, especially `inspectWebsite` and `enrichCandidates`. Add the provider request there using server-side `process.env.EMAIL_FINDER_API_KEY`, retain website scraping as fallback, and never expose the key to client code. Check the vendor's terms, costs, data handling and rate limits. The free scraper checks a homepage and common `/contact`, `/contact-us`, and `/about` paths with short timeouts, six concurrent workers, and a shared runtime budget. Found emails are not deliverability-verified.

Pitch heuristics and message templates are in `lib/pitch.js`; they can later be replaced with a hosted generator using a server-only environment variable while keeping the local template fallback. Never send AI-generated outreach without a human review.

## Limitations and responsible use

- Overpass coverage is community-maintained; missing or stale tags and contact details are possible.
- Email lookup extracts public email text only. The scraper does not visit social-media pages. OSM social links may appear in the lead drawer.
- Website issue heuristics identify missing site, HTTP-only URL, missing viewport meta tag when readable, or missing listed phone. Confirm before contacting a business.
- Use public business details responsibly. Review and personalize messages, and comply with applicable privacy and anti-spam rules.

## API routes

- `GET /api/leads`: today's leads. `PATCH /api/leads`: update status or notes.
- `GET /api/export`: CSV for today's leads.
- `GET|POST /api/generate`: pull a bounded batch, enrich, dedupe and store.
- `GET /api/messages?id=LEAD_ID`: generate drafts for a lead.
- `GET /api/morning-digest`: report digest configuration and counts, without sending.
- `POST /api/morning-digest`: send a digest if SMTP is configured.

