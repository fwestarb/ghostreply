const toPublicEntry = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const toPublicProfile = (row) => ({
  companyName: row?.company_name || '',
  businessSummary: row?.business_summary || '',
  toneOfVoice: row?.tone_of_voice || '',
  escalationNote: row?.escalation_note || '',
  updatedAt: row?.updated_at || null
});

module.exports = { toPublicEntry, toPublicProfile };
