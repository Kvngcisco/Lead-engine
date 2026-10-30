export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import nodemailer from 'nodemailer';
import type { Lead } from '@/lib/types';

const NO_EMAIL = 'no email - phone/DM';
function escapeCsv(value: string) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function makeCsv(leads: Lead[]) {
  const columns: (keyof Lead)[] = ['id','business_name','business_type','town_city','address','website','email','phone','issue','recommended_fix','pitch_opener','offer','status','created_at'];
  return [columns.join(','), ...leads.map(lead => columns.map(column => escapeCsv(lead[column] as string)).join(','))].join('\r\n');
}
function escapeHtml(value: string) { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c)); }
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const leads = (await readStore()).leads.filter(lead => lead.created_at.slice(0, 10) === date);
  const contacts = leads.filter(lead => lead.email !== NO_EMAIL);
  return NextResponse.json({ configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.LEAD_ALERT_EMAIL), date, leads: leads.length, emailContacts: contacts.length, preview: contacts.slice(0, 5).map(lead => ({ business_name: lead.business_name, email: lead.email, town_city: lead.town_city })) });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, LEAD_ALERT_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !LEAD_ALERT_EMAIL) return NextResponse.json({ ok: true, sent: false, reason: 'SMTP is not fully configured' });
  try {
    const payload = await request.json().catch(() => ({}));
    const date = typeof payload.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10);
    const leads = (await readStore()).leads.filter(lead => lead.created_at.slice(0, 10) === date);
    const emailCount = leads.filter(lead => lead.email !== NO_EMAIL).length;
    const preview = leads.filter(lead => lead.email !== NO_EMAIL).slice(0, 12);
    const rows = preview.map(lead => `<tr><td>${escapeHtml(lead.business_name)}</td><td>${escapeHtml(lead.business_type)}</td><td>${escapeHtml(lead.town_city)}</td><td>${escapeHtml(lead.email)}</td><td>${escapeHtml(lead.issue)}</td></tr>`).join('');
    const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: SMTP_SECURE === 'true', auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 12000 });
    await transporter.sendMail({ from: SMTP_USER, to: LEAD_ALERT_EMAIL, subject: `Lead Engine: ${leads.length} leads for ${date}`, text: `${leads.length} leads were pulled. ${emailCount} have public email addresses. See attached CSV.`, html: `<h2>Lead Engine daily leads</h2><p>${leads.length} leads pulled. <b>${emailCount}</b> have public email addresses.</p><p>Here are up to 12 email contacts:</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Business</th><th>Type</th><th>Town</th><th>Email</th><th>Opportunity</th></tr></thead><tbody>${rows}</tbody></table><p>CSV is attached. Review and personalize before any outreach.</p>`, attachments: [{ filename: `lead-engine-${date}.csv`, content: makeCsv(leads), contentType: 'text/csv' }] });
    return NextResponse.json({ ok: true, sent: true, date, leads: leads.length, emailContacts: emailCount });
  } catch (error) {
    console.error('Digest delivery failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ ok: false, error: 'Digest delivery failed. Check SMTP configuration and logs.' }, { status: 502 });
  }
}
