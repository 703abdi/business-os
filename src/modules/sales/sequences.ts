// Follow-up sequences. Starting one on a client creates a dated follow-up task
// for each step (shown on Today and the client page). Edit the steps here.
export type SequenceStep = { day: number; hour: number; title: string };
export type Sequence = { key: string; name: string; when: string; steps: SequenceStep[] };

export const SEQUENCES: Sequence[] = [
  {
    key: "new_lead",
    name: "New lead, no booking",
    when: "Lead asked for a price but didn't book",
    steps: [
      { day: 0, hour: 0, title: "Text back within 5 min: price + 2 open days" },
      { day: 0, hour: 4, title: "Call if no reply to the first text" },
      { day: 1, hour: 0, title: "Text: before/after photo of a similar service" },
      { day: 3, hour: 0, title: "Text: 'Still want to get it done this week?'" },
      { day: 7, hour: 0, title: "Last text: offer next open slot, then mark Lost if silent" },
    ],
  },
  {
    key: "quote_sent",
    name: "Quote sent",
    when: "Sent a quote (high-value job) and waiting",
    steps: [
      { day: 1, hour: 0, title: "Check they got the quote, answer questions" },
      { day: 3, hour: 0, title: "Send a client success story or a review" },
      { day: 6, hour: 0, title: "Ask for a yes/no, offer 2 dates" },
    ],
  },
  {
    key: "after_job",
    name: "After a one-off job",
    when: "Right after a one-time job",
    steps: [
      { day: 0, hour: 2, title: "Send the Google review link" },
      { day: 2, hour: 0, title: "Pitch the maintenance plan (founding rate)" },
      { day: 14, hour: 0, title: "Check in: how is the service holding up?" },
      { day: 30, hour: 0, title: "Rebook reminder: time for the next service" },
    ],
  },
  {
    key: "win_back",
    name: "Win back old client",
    when: "Past client, no job in 60+ days",
    steps: [
      { day: 0, hour: 0, title: "Text: 'Been a minute, want a slot this week?'" },
      { day: 5, hour: 0, title: "Text: member rate offer" },
    ],
  },
];
