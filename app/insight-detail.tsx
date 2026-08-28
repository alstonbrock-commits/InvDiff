import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Eyebrow, alertDialog } from '@/components';
import { displayRef } from '@/lib/db/queries';
import { fetchEventReport, fetchInsights, recordExport } from '@/lib/remote';
import { generateAndSharePdf } from '@/lib/pdf';

export default function InsightDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, insightId } = useLocalSearchParams<{
    eventId: string;
    insightId?: string;
  }>();
  const [sharing, setSharing] = useState(false);

  const insightsQuery = useQuery({
    queryKey: ['insights', eventId],
    queryFn: () => fetchInsights(eventId!),
    enabled: !!eventId,
  });

  // Report-level content (description, summary, limitations, next steps).
  const reportQuery = useQuery({
    queryKey: ['event-report', eventId],
    queryFn: () => fetchEventReport(eventId!),
    enabled: !!eventId,
  });

  const insights = insightsQuery.data ?? [];
  const report = reportQuery.data ?? null;
  const insight =
    insights.find((i) => i.id === insightId) ?? insights[0] ?? null;

  const sharePdf = async () => {
    if (sharing || !eventId) return;
    setSharing(true);
    try {
      // Transcripts are deliberately not passed: the report must stand alone
      // and must not carry raw transcript material.
      const uri = await generateAndSharePdf({
        eventTitle: insight?.event_title ?? displayRef(eventId),
        eventDate: insight?.event_date
          ? new Date(insight.event_date).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : null,
        eventRef: displayRef(eventId),
        generatedAt: new Date().toLocaleString('en-AU'),
        report,
        insights,
      });
      await recordExport(eventId, uri, false).catch(() => {});
    } catch (e) {
      alertDialog('Could not share the PDF', String(e));
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(15,30,36,0.8)', justifyContent: 'flex-end' }}>
      {/* Scrim — tapping outside dismisses */}
      <Pressable style={{ flex: 1 }} onPress={() => router.back()} />

      <View
        style={{
          backgroundColor: '#F6F5F1',
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          paddingBottom: 22 + insets.bottom,
          maxHeight: '92%',
        }}
      >
        {/* Grab handle */}
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 38, height: 4, borderRadius: 3, backgroundColor: '#C7C3B9' }} />
        </View>

        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#E5E3DC',
          }}
        >
          {/* Event name + date lead; the EVT ref moved to the bottom right. */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Title shrinks, date does not — a long event name was truncating
                the date away entirely. */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'IBMPlexMono-400',
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: '#5D6B70',
                  flexShrink: 1,
                }}
              >
                {insight?.event_title ?? (eventId ? displayRef(eventId) : '')}
              </Text>
              {!!insight?.event_date && (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'IBMPlexMono-400',
                    fontSize: 10,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: '#8A9499',
                  }}
                >
                  ·{' '}
                  {new Date(insight.event_date).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: 'rgba(44,165,192,0.14)',
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Archivo-700',
                  fontSize: 9.5,
                  letterSpacing: 0.57,
                  color: '#2CA5C0',
                }}
              >
                AI INSIGHT
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: 21,
              lineHeight: 25.2,
              letterSpacing: -0.42,
              color: '#17262D',
              marginTop: 8,
            }}
          >
            {insight?.title ??
              (insightsQuery.isLoading
                ? 'Loading…'
                : report
                  ? 'No insights could be drawn'
                  : 'No insight yet')}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, gap: 16 }}>
          {/* A finished event can legitimately produce no insights — when the
              interviews carried too little to learn from, the analysis says so
              in the limitations instead of inventing findings. Show that,
              rather than an empty sheet. */}
          {!insight && !insightsQuery.isLoading && report && (
            <>
              <View>
                <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                  What the analysis found
                </Eyebrow>
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 13,
                    lineHeight: 19.5,
                    color: '#3A474D',
                  }}
                >
                  {report.executive_summary?.trim() ||
                    'The analysis did not identify any insights for this event.'}
                </Text>
              </View>

              {!!report.limitations && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Limitations and validation needs
                  </Eyebrow>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 12.5,
                      lineHeight: 18.75,
                      color: '#5D6B70',
                    }}
                  >
                    {report.limitations}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 12,
                  lineHeight: 18,
                  color: '#8A9499',
                }}
              >
                Adding more interviews and re-running the analysis from the roster
                usually resolves this.
              </Text>

              <Text
                style={{
                  fontFamily: 'IBMPlexMono-400',
                  fontSize: 9.5,
                  color: '#8A9499',
                  textAlign: 'right',
                }}
              >
                {eventId ? displayRef(eventId) : ''}
              </Text>
            </>
          )}

          {insight && (
            <>
              <View>
                <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                  Key finding
                </Eyebrow>
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 13,
                    lineHeight: 19.5,
                    color: '#3A474D',
                  }}
                >
                  {insight.body}
                </Text>
              </View>

              {!!insight.theme && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 6 }}>
                    Theme
                  </Eyebrow>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-600',
                      fontSize: 13,
                      lineHeight: 19.5,
                      color: '#17262D',
                    }}
                  >
                    {insight.theme}
                  </Text>
                </View>
              )}

              {(insight.factors?.length ?? 0) > 0 && !insight.theme && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Contributing factors
                  </Eyebrow>
                  <View style={{ gap: 7 }}>
                    {insight.factors!.map((factor) => (
                      <View key={factor} style={{ flexDirection: 'row', gap: 9 }}>
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 2.5,
                            backgroundColor: '#E4772A',
                            marginTop: 6,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: 'PublicSans-400',
                            fontSize: 13,
                            lineHeight: 18.85,
                            color: '#3A474D',
                            flex: 1,
                          }}
                        >
                          {factor}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {insight.recommendations.length > 0 && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Recommended actions
                  </Eyebrow>
                  <View style={{ gap: 7 }}>
                    {insight.recommendations.map((rec) => (
                      <View
                        key={rec.id}
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E5E3DC',
                          borderRadius: 11,
                          paddingVertical: 11,
                          paddingHorizontal: 12,
                        }}
                      >
                        {rec.is_option && (
                          <Text
                            style={{
                              fontFamily: 'Archivo-700',
                              fontSize: 9.5,
                              letterSpacing: 0.5,
                              color: '#E4772A',
                              marginBottom: 4,
                            }}
                          >
                            OPTION TO CONSIDER
                          </Text>
                        )}
                        <Text
                          style={{
                            fontFamily: 'PublicSans-400',
                            fontSize: 12.5,
                            lineHeight: 17.5,
                            color: '#17262D',
                          }}
                        >
                          {rec.body}
                        </Text>
                        {!!rec.risk_reduction_rationale && (
                          <Text
                            style={{
                              fontFamily: 'PublicSans-400',
                              fontSize: 11.5,
                              lineHeight: 16.5,
                              color: '#5D6B70',
                              marginTop: 6,
                            }}
                          >
                            Why: {rec.risk_reduction_rationale}
                          </Text>
                        )}
                        {!!rec.verification_method && (
                          <Text
                            style={{
                              fontFamily: 'PublicSans-400',
                              fontSize: 11.5,
                              lineHeight: 16.5,
                              color: '#5D6B70',
                              marginTop: 3,
                            }}
                          >
                            Verify: {rec.verification_method}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {!!insight.system_significance && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    System significance
                  </Eyebrow>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 13,
                      lineHeight: 19.5,
                      color: '#3A474D',
                    }}
                  >
                    {insight.system_significance}
                  </Text>
                </View>
              )}

              {/* De-identified patterns and examples — never attributed. */}
              {(insight.supporting_examples ?? []).filter(
                (e) => e.include_in_report !== false && e.text?.trim(),
              ).length > 0 && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Supporting examples
                  </Eyebrow>
                  <View style={{ gap: 7 }}>
                    {(insight.supporting_examples ?? [])
                      .filter((e) => e.include_in_report !== false && e.text?.trim())
                      .map((ex, i) => (
                        <View
                          key={i}
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: '#2CA5C0',
                            paddingLeft: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'PublicSans-400',
                              fontSize: 12.5,
                              lineHeight: 18.75,
                              color: '#5D6B70',
                            }}
                          >
                            {ex.text}
                          </Text>
                        </View>
                      ))}
                  </View>
                </View>
              )}

              {/* Report-level context — shown once, on the first insight. */}
              {!!report?.executive_summary && insight.position === 1 && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Executive summary
                  </Eyebrow>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 13,
                      lineHeight: 19.5,
                      color: '#3A474D',
                    }}
                  >
                    {report.executive_summary}
                  </Text>
                </View>
              )}

              {(report?.next_steps?.length ?? 0) > 0 && insight.position === 1 && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Suggested next steps
                  </Eyebrow>
                  <View style={{ gap: 7 }}>
                    {report!.next_steps!.map((step, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
                        <Text
                          style={{
                            fontFamily: 'IBMPlexMono-400',
                            fontSize: 11,
                            color: '#E4772A',
                            marginTop: 1,
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </Text>
                        <Text
                          style={{
                            fontFamily: 'PublicSans-400',
                            fontSize: 13,
                            lineHeight: 18.85,
                            color: '#3A474D',
                            flex: 1,
                          }}
                        >
                          {step}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {!!report?.limitations && insight.position === 1 && (
                <View>
                  <Eyebrow color="#2CA5C0" style={{ marginBottom: 8 }}>
                    Limitations and validation needs
                  </Eyebrow>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 12.5,
                      lineHeight: 18.75,
                      color: '#5D6B70',
                    }}
                  >
                    {report.limitations}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontFamily: 'IBMPlexMono-400',
                  fontSize: 9.5,
                  color: '#8A9499',
                  textAlign: 'right',
                }}
              >
                {eventId ? displayRef(eventId) : ''}
              </Text>
            </>
          )}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingTop: 14,
            paddingHorizontal: 20,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="sm" fullWidth onPress={() => router.back()}>
              Close
            </Button>
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              disabled={(!insight && !report) || sharing}
              onPress={() => void sharePdf()}
            >
              {sharing ? 'Preparing…' : 'Share PDF'}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
