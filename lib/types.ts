export type LeadStatus = 'new' | 'contacted' | 'replied' | 'won' | 'lost';
export type Lead = {
  id: string; business_name: string; business_type: string; town_city: string; address?: string;
  website: string; email: string; phone: string; whatsapp?: string; socials?: string[];
  issue: string; recommended_fix: string; pitch_opener: string; offer: string; created_at: string;
  status?: LeadStatus; notes?: string; hasViewport?: boolean | null;
};
export type Candidate = Omit<Lead, 'id' | 'email' | 'issue' | 'recommended_fix' | 'pitch_opener' | 'offer' | 'created_at' | 'status' | 'notes'> & { lat?: number; lon?: number };
export type Store = { leads: Lead[]; seen: string[]; pool: Candidate[]; poolIndex: number; poolDate: string; townIndex: number };
