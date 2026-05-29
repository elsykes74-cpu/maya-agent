export const DEMO_LEADS = [
  { id: 1, sellerName: 'Sarah Johnson', propertyAddress: '142 Maple St, Springfield, MA', phone: '(413) 555-0123', motivationLevel: 'hot', timeline: '30 days', askingPrice: '185000', arv: '280000', estimatedRepairs: '25000', beds: 3, baths: 1.5, condition: 'medium_rehab', keyPainPoints: 'Inherited property, lives out of state, wants quick cash sale' },
  { id: 2, sellerName: 'Mike Chen', propertyAddress: '78 Oak Avenue, Holyoke, MA', phone: '(413) 555-0456', motivationLevel: 'hot', timeline: '2 weeks', askingPrice: '120000', arv: '195000', estimatedRepairs: '35000', beds: 2, baths: 1, condition: 'heavy_rehab', keyPainPoints: 'Behind on mortgage payments, facing foreclosure' },
  { id: 3, sellerName: 'Emma Davis', propertyAddress: '256 Elm Street, Chicopee, MA', phone: '(413) 555-0789', motivationLevel: 'warm', timeline: '60 days', askingPrice: '220000', arv: '310000', estimatedRepairs: '15000', beds: 4, baths: 2, condition: 'light_rehab', keyPainPoints: 'Downsizing, already purchased new home' },
  { id: 4, sellerName: 'Robert Wilson', propertyAddress: '89 Pine Road, Westfield, MA', phone: '(413) 555-0321', motivationLevel: 'cold', timeline: '6 months', askingPrice: '350000', arv: '420000', estimatedRepairs: '5000', beds: 4, baths: 2.5, condition: 'move_in_ready', keyPainPoints: 'Testing market, not urgent' },
];

export const DEMO_CALLS = [
  { id: 1, leadName: 'Sarah Johnson', outcome: 'connected', duration: 184, transcript: 'Hi Sarah, this is the AI assistant calling about your property on Maple Street. I understand you inherited the property and are looking for a quick sale. She said the house needs about $25k in repairs. Wants to close within 30 days. Score: HOT lead.', createdAt: new Date(Date.now() - 3600000).toISOString(), notes: 'Wants quick cash sale. $25k repairs needed.' },
  { id: 2, leadName: 'Mike Chen', outcome: 'voicemail', duration: 32, transcript: 'Hi Mike, this is calling about your property on Oak Avenue. Please call back at your earliest convenience.', createdAt: new Date(Date.now() - 7200000).toISOString(), notes: 'Pre-foreclosure, time sensitive' },
  { id: 3, leadName: 'Emma Davis', outcome: 'connected', duration: 245, transcript: "Hi Emma, I understand you're downsizing. We can close in 14 days. She said $220k would work. Score: HOT lead.", createdAt: new Date(Date.now() - 10800000).toISOString(), notes: 'Ready to sell, flexible on price' },
];

export const DEMO_CAMPAIGNS = [
  { id: 1, name: 'Springfield Motivated Sellers', description: 'Vacant and inherited properties in Springfield', status: 'active', progress: 68, callsMade: 34, totalLeads: 50 },
  { id: 2, name: 'Holyoke Foreclosure List', description: 'Pre-foreclosure leads from Holyoke area', status: 'paused', progress: 42, callsMade: 21, totalLeads: 50 },
  { id: 3, name: 'Chicopee Cash Buyers', description: 'Absentee owners in Chicopee', status: 'completed', progress: 100, callsMade: 50, totalLeads: 50 },
];
