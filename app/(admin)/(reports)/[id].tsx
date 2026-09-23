import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, Eyebrow, Button, alertDialog } from '@/components';
import { displayRef } from '@/lib/db/queries';
import {
  fetchAdminEventState,
  fetchEventReport,
  fetchInsights,
  recordExport,
  type TranscriptDetail,
} from '@/lib/remote';
import { generateAndSharePdf } from '@/lib/pdf';

const CARD = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E5E3DC',
  borderRadius: 12,
  padding: 13,
} as const;

function Body({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: 'PublicSans-400',
        fontSize: 12.5,
        lineHeight: 18.75,
        color: '#3A474D',
      }}
    >
      {children}
    </Text>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: 'PublicSans-700', fontSize: 11.5, color: '#17262D' }}>
      {children}
    </Text>
  );
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// The whole process behind one report — meta, the report itself, and every
// interview transcript. Owner oversight only: nothing here is editable.
export default function AdminReportDetail() {
  const router = useRouter();
  const { id, title, owner } = useLocalSearchParams<{
    id: string;
    title?: string;
    owner?: string;
  }>();
  const [sharing, setSharing] = useState(false);

  const state = useQuery({
    queryKey: ['admin-event-state', id],
    queryFn: () => fetchAdminEventState(id!),
    enabled: !!id,
  });
  const insightsQuery = useQuery({
    queryKey: ['insights', id],
    queryFn: () => fetchInsights(id!),
    enabled: !!id,
  });
  const reportQuery = useQuery({
    queryKey: ['event-report', id],
    queryFn: () => fetchEventReport(id!),
    enabled: !!id,
  });

  const s = state.data;
  const insights = insightsQuery.data ?? [];
  const report = reportQuery.data ?? null;

  // Transcripts grouped by person, in question order.
  const interviews = useMemo(() => {
    const byPerson = new Map<string, TranscriptDetail[]>();
    for (const t of s?.transcripts ?? []) {
      const list = byPerson.get(t.interviewee_name) ?? [];
      list.push(t);
      byPerson.set(t.interviewee_name, list);
    }
    return [...byPerson.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, rows]) => ({
        name,
        rows: rows.sort((a, b) => a.question_position - b.question_position),
      }));
  }, [s?.transcripts]);

  const eventDate = insights[0]?.event_date ?? null;

  const sharePdf = async () => {
    if (sharing || !id) return;
    setSharing(true);
    try {
      const uri = await generateAndSharePdf({
        eventTitle: title ?? insights[0]?.event_title ?? displayRef(id),
        eventDate: eventDate ? longDate(eventDate) : null,
        eventRef: displayRef(id),
        generatedAt: new Date().toLocaleString('en-AU'),
        report,
        insights,
      });
      await recordExport(id, uri, false);
    } catch (e) {
      alertDialog('Could not share the PDF', String(e));
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title={title ?? 'Report'}
        subtitle={id ? displayRef(id) : ''}
        titleSize={20}
        subtitleMarginTop={3}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 10,
        }}
      >
        {state.isLoading && (
          <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, color: '#5D6B70' }}>
            Loading…
          </Text>
        )}

        {s && (
          <>
            <Eyebrow>Event</Eyebrow>
            <View style={{ ...CARD, gap: 6 }}>
              {(
                [
                  ['Date', longDate(eventDate)],
                  // Older reports predate facilitator_name — fall back to the
                  // event's owner, which the list already knows.
                  ['Facilitator', report?.facilitator_name || owner || '—'],
                  ['Interviewees', String(s.interviewees.length)],
                  [
                    'Answers recorded',
                    `${s.answers.filter((a) => a.recorded_at).length} of ${
                      s.interviewees.length * s.questionCount
                    }`,
                  ],
                  [
                    'Transcripts approved',
                    `${s.transcripts.filter((t) => t.status === 'approved').length} of ${
                      s.transcripts.length
                    }`,
                  ],
                ] as [string, string][]
              ).map(([label, value]) => (
                <View
                  key={label}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text
                    style={{ fontFamily: 'PublicSans-400', fontSize: 12.5, color: '#5D6B70' }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{ fontFamily: 'PublicSans-600', fontSize: 12.5, color: '#17262D' }}
                  >
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            {report?.executive_summary && (
              <>
                <Eyebrow style={{ marginTop: 4 }}>Executive summary</Eyebrow>
                <View style={CARD}>
                  <Body>{report.executive_summary}</Body>
                </View>
              </>
            )}

            {report?.event_description && (
              <>
                <Eyebrow style={{ marginTop: 4 }}>Event description</Eyebrow>
                <View style={CARD}>
                  <Body>{report.event_description}</Body>
                </View>
              </>
            )}

            {insights.length > 0 && (
              <>
                <Eyebrow style={{ marginTop: 4 }}>
                  {`Key insights (${insights.length})`}
                </Eyebrow>
                {insights.map((i) => {
                  const examples = (i.supporting_examples ?? []).filter(
                    (e) => e.include_in_report !== false && e.text?.trim(),
                  );
                  return (
                    <View key={i.id} style={{ ...CARD, gap: 7 }}>
                      {!!i.theme && (
                        <Text
                          style={{
                            fontFamily: 'IBMPlexMono-400',
                            fontSize: 9.5,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                            color: '#2CA5C0',
                          }}
                        >
                          {i.theme}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: 'Archivo-700',
                          fontSize: 15,
                          lineHeight: 20,
                          color: '#17262D',
                        }}
                      >
                        {i.title}
                      </Text>
                      <Body>{i.body}</Body>

                      {examples.length > 0 && (
                        <View style={{ gap: 4, marginTop: 2 }}>
                          <Label>Supporting examples</Label>
                          {examples.map((e, n) => (
                            <Body key={n}>• {e.text}</Body>
                          ))}
                        </View>
                      )}

                      {!!i.system_significance && (
                        <View style={{ gap: 3, marginTop: 2 }}>
                          <Label>Why it matters</Label>
                          <Body>{i.system_significance}</Body>
                        </View>
                      )}

                      {i.recommendations.length > 0 && (
                        <View style={{ gap: 6, marginTop: 4 }}>
                          <Label>Recommended actions</Label>
                          {i.recommendations.map((r) => (
                            <View
                              key={r.id}
                              style={{
                                backgroundColor: '#F6F5F1',
                                borderRadius: 8,
                                padding: 10,
                                gap: 3,
                              }}
                            >
                              <Body>
                                {r.is_option ? 'Option to consider — ' : ''}
                                {r.body}
                              </Body>
                              {!!r.risk_reduction_rationale && (
                                <Body>Why: {r.risk_reduction_rationale}</Body>
                              )}
                              {!!r.verification_method && (
                                <Body>Verify: {r.verification_method}</Body>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {!!report?.limitations && (
              <>
                <Eyebrow style={{ marginTop: 4 }}>Limitations</Eyebrow>
                <View style={CARD}>
                  <Body>{report.limitations}</Body>
                </View>
              </>
            )}

            {(report?.next_steps ?? []).length > 0 && (
              <>
                <Eyebrow style={{ marginTop: 4 }}>Suggested next steps</Eyebrow>
                <View style={{ ...CARD, gap: 4 }}>
                  {(report?.next_steps ?? []).map((step, n) => (
                    <Body key={n}>• {String(step)}</Body>
                  ))}
                </View>
              </>
            )}

            <Eyebrow style={{ marginTop: 4 }}>Interviews</Eyebrow>
            {interviews.length === 0 && (
              <View style={CARD}>
                <Body>No transcripts yet for this event.</Body>
              </View>
            )}
            {interviews.map((person) => (
              <View key={person.name} style={{ ...CARD, gap: 9 }}>
                <Text
                  style={{ fontFamily: 'PublicSans-700', fontSize: 13.5, color: '#17262D' }}
                >
                  {person.name}
                </Text>
                {person.rows.map((t) => (
                  <View key={t.id} style={{ gap: 3 }}>
                    <Text
                      style={{
                        fontFamily: 'IBMPlexMono-400',
                        fontSize: 9.5,
                        color: '#8A9499',
                      }}
                    >
                      Q{t.question_position}
                      {t.edited_text ? ' · CORRECTED' : ''}
                      {t.status === 'approved' ? ' · APPROVED' : ''}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PublicSans-600',
                        fontSize: 12,
                        lineHeight: 17,
                        color: '#17262D',
                      }}
                    >
                      {t.question_text}
                    </Text>
                    <Body>{t.edited_text ?? t.text ?? '(not transcribed yet)'}</Body>
                  </View>
                ))}
              </View>
            ))}

            {/* A report with no insights is a valid outcome — the analysis
                found too little to learn from and said so in the limitations.
                It is still a shareable report. */}
            {report && insights.length === 0 && (
              <View style={{ ...CARD, marginTop: 4 }}>
                <Body>
                  No insights were drawn from this event. The reasoning is in the
                  limitations above.
                </Body>
              </View>
            )}

            {(report || insights.length > 0) && (
              <View style={{ marginTop: 8 }}>
                <Button
                  variant="primary"
                  fullWidth
                  disabled={sharing}
                  onPress={() => void sharePdf()}
                >
                  {sharing ? 'Preparing…' : 'Share PDF'}
                </Button>
              </View>
            )}

            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 11,
                lineHeight: 16.5,
                color: '#8A9499',
                marginTop: 2,
              }}
            >
              Owner view — read only. Corrections are made by the facilitator who ran
              the event.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
