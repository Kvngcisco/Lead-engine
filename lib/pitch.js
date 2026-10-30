const PILOT = 'a 2-week AI front desk pilot in exchange for a short testimonial';

export function createPitch(business, signals = {}) {
  const issues = [];
  const fixes = [];
  if (!business.website) { issues.push('no website at all'); fixes.push('launch a fast, mobile-friendly website with a clear booking call to action'); }
  else {
    if (business.website.startsWith('http://')) { issues.push('insecure site'); fixes.push('move the site to HTTPS so visitors see a secure connection'); }
    if (signals.hasViewport === false) { issues.push('not mobile friendly'); fixes.push('add a responsive mobile layout and viewport setting'); }
  }
  if (!business.phone) { issues.push('no phone number listed'); fixes.push('add a prominent contact number and a simple enquiry path'); }
  if (!issues.length) { issues.push('no obvious website issue detected from a quick check'); fixes.push('review the booking journey and follow up with new enquiries faster'); }
  const issue = issues.join('; ');
  const recommended_fix = fixes.join('; ');
  const pitch_opener = `Hi, I was looking at ${business.business_name} in ${business.town_city} and noticed ${issues[0]}.`;
  return { issue, recommended_fix, pitch_opener, offer: `I can make the first fix free, then run ${PILOT}.` };
}

function businessName(lead) { return lead.business_name || 'your business'; }
export function generateMessages(lead) {
  const name = businessName(lead);
  const town = lead.town_city || 'your area';
  const type = (lead.business_type || 'business').toLowerCase();
  const issue = lead.issue || 'a quick improvement opportunity';
  const fix = lead.recommended_fix || 'improve the customer enquiry journey';
  const offer = lead.offer || `I can do the first fix free and run ${PILOT}.`;
  const subject = `Quick idea for ${name}`;
  const email = {
    subject,
    body: `Hi,\n\nI was looking at ${name} in ${town} and noticed ${issue}. For a ${type}, that could make it harder for a new client to get in touch.\n\nI can ${fix}. ${offer}\n\nWould a quick chat be useful?\n\nBest,\nSukuna`,
  };
  const whatsapp = `Hi! I was checking out ${name} in ${town} and noticed ${issue}. I help ${type} businesses ${fix}. I can do the first fix free and run a 2-week AI front desk pilot in exchange for a short testimonial. Would it be useful if I sent a quick idea?`;
  const followup = `Hi, just following up on my note about ${issue} at ${name}. I can make the first fix free, then run a 2-week AI front desk pilot in exchange for a short testimonial. No pressure either way. Should I send over the quick outline?`;
  const sequences = [
    { day: 3, subject: `Following up: ${name}`, body: `Hi,\n\nJust checking this didn't get buried. I noticed ${issue} at ${name} and had a simple idea: ${fix}.\n\nI can do that first fix free and run a 2-week AI front desk pilot in exchange for a short testimonial. Would you like me to send a short outline?\n\nBest,\nSukuna` },
    { day: 7, subject: `A quick idea for ${name}`, body: `Hi,\n\nOne more thought for ${name}: a smoother enquiry path could help more ${town} customers take the next step. I can ${fix}.\n\nI have room to do the first fix free, followed by a 2-week AI front desk pilot in exchange for a short testimonial. Happy to share a no-obligation outline.\n\nBest,\nSukuna` },
    { day: 14, subject: `Should I close the loop?`, body: `Hi,\n\nI'll close the loop after this. If improving ${name}'s website or enquiry follow-up becomes a priority, I'm happy to help. My offer is a free first fix and a 2-week AI front desk pilot in exchange for a short testimonial.\n\nEither way, wishing you and the team well.\n\nBest,\nSukuna` },
  ];
  return { email, whatsapp, followup, sequences };
}
