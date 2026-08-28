import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, Eyebrow, Button, alertDialog } from '@/components';
import { useAuth } from '@/lib/auth';
import { displayRef } from '@/lib/db/queries';
import {
  fetchAnalysingEvents,
  fetchFailedInsightEvents,
  fetchInsightsFeed,
  type InsightFeedItem,
} from '@/lib/remote';
import { generateInsights } from '@/lib/ai';

function Badge({ label, analysing }: { label: string; analysing?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: analysing ? '#EFEDE7' : 'rgba(44,165,192,0.14)',
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
          color: analysing ? '#8A9499' : '#2CA5C0',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// Same date buckets as the Events list, so the two screens read as siblings.
function groupHeading(iso: string | null, now: Date): string {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (days < 7) return 'Earlier this week';
  return 'Earlier';
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type ScopeId = 'everyone' | 'mine' | 'team';

export default function Insights() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const supervisor = profile?.org_role === 'supervisor';
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeId>('everyone');

  const feed = useQuery({ queryKey: ['insights-feed'], queryFn: fetchInsightsFeed });
  const analysing = useQuery({
    queryKey: ['analysing-events'],
    queryFn: fetchAnalysingEvents,
    // Poll while a generation job is in flight so the card resolves itself.
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 5000 : 30000),
  });

  // A job flipping to done means new insights — keep the feed in step.
  React.useEffect(() => {
    if ((analysing.data?.length ?? 0) === 0) void feed.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysing.data?.length]);

  const jobs = analysing.data ?? [];

  // Failed background jobs, and the retry that restarts one.
  const failedQuery = useQuery({
    queryKey: ['failed-insight-jobs'],
    queryFn: fetchFailedInsightEvents,
    refetchInterval: 60_000,
  });
  // Only the owner can restart a synthesis, so a supervisor sees just their own.
  const failed = (failedQuery.data ?? []).filter((f) => !userId || f.owner_id === userId);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (eventId: string) => {
    if (retrying) return;
    setRetrying(eventId);
    try {
      await generateInsights(eventId);
      await Promise.all([analysing.refetch(), failedQuery.refetch()]);
    } catch (e) {
      alertDialog('Could not start the analysis', String(e));
    } finally {
      setRetrying(null);
    }
  };

  // Search across the insight text and the event's identity.
  const filtered = useMemo(() => {
    let items = feed.data ?? [];
    if (supervisor && scope !== 'everyone') {
      items = items.filter((i) => (scope === 'mine' ? i.owner_id === userId : i.owner_id !== userId));
    }
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.title, i.body, i.event_title, i.event_site ?? '', i.owner_name ?? '', displayRef(i.event_id)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [feed.data, search, scope, supervisor, userId]);

  // Bucket the (already newest-first) list into runs, Events-style.
  const groups = useMemo(() => {
    const now = new Date();
    const out: { heading: string; items: InsightFeedItem[] }[] = [];
    for (const item of filtered) {
      const heading = groupHeading(item.generated_at, now);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.items.push(item);
      else out.push({ heading, items: [item] });
    }
    return out;
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Insights"
        subtitle="AI analysis for each completed event"
        searchPlaceholder="Search insights, events, IDs"
        searchValue={search}
        onSearchChange={setSearch}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isFetching && !feed.isLoading}
            onRefresh={() => void feed.refetch()}
            tintColor="#E4772A"
          />
        }
      >
        {supervisor && (
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {(
              [
                { id: 'everyone', label: 'Everyone' },
                { id: 'mine', label: 'Mine' },
                { id: 'team', label: 'Team' },
              ] as { id: ScopeId; label: string }[]
            ).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setScope(s.id)}
                style={{
                  backgroundColor: scope === s.id ? '#1B2B3A' : '#EFEDE7',
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PublicSans-700',
                    fontSize: 11,
                    color: scope === s.id ? '#FFFFFF' : '#5D6B70',
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {feed.isError && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
            }}
          >
            Insights are online-only — reconnect to load them.
          </Text>
        )}

        {!feed.isError && !feed.isLoading && filtered.length === 0 && jobs.length === 0 && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
            }}
          >
            {search.trim()
              ? 'Nothing matches that search.'
              : "No insights yet — approve an event's transcripts to generate its analysis."}
          </Text>
        )}

        {jobs.map((job) => (
          <View
            key={job.event_id}
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E5E3DC',
              borderRadius: 12,
              padding: 14,
              opacity: 0.72,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'IBMPlexMono-400',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  color: '#8A9499',
                  flex: 1,
                }}
              >
                {job.event_title}
              </Text>
              <Badge label="ANALYSING" analysing />
            </View>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12,
                lineHeight: 17.4,
                color: '#5D6B70',
                marginTop: 7,
              }}
            >
              Transcript approved — insight ready in a few minutes.
            </Text>
          </View>
        ))}

        {/* The synthesis runs in the background, so a failure has to be
            visible here with a way to start it again. */}
        {failed.map((f) => (
          <View
            key={f.event_id}
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E5E3DC',
              borderLeftWidth: 4,
              borderLeftColor: '#E4772A',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'IBMPlexMono-400',
                fontSize: 10,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: '#5D6B70',
              }}
            >
              {f.event_title}
            </Text>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12,
                lineHeight: 17.4,
                color: '#5D6B70',
                marginTop: 7,
              }}
            >
              The analysis did not finish. Your transcripts are safe — try again.
            </Text>
            <View style={{ marginTop: 10 }}>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                disabled={retrying === f.event_id}
                onPress={() => void retry(f.event_id)}
              >
                {retrying === f.event_id ? 'Starting…' : 'Try again'}
              </Button>
            </View>
          </View>
        ))}

        {groups.map((group, groupIndex) => (
          <React.Fragment key={group.heading}>
            <Eyebrow style={{ marginTop: groupIndex > 0 || jobs.length > 0 ? 4 : 0 }}>
              {group.heading}
            </Eyebrow>

            {group.items.map((insight) => (
              <Pressable
                key={insight.id}
                onPress={() =>
                  router.push({
                    pathname: '/insight-detail',
                    params: { eventId: insight.event_id, insightId: insight.id },
                  })
                }
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E5E3DC',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                {/* Event name + date lead; EVT ref lives bottom right */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  {/* Title shrinks, date does not — on a long event name the
                      date was the part being truncated away. */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flex: 1,
                      gap: 4,
                    }}
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
                      {insight.event_title}
                    </Text>
                    {!!shortDate(insight.event_date) && (
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
                        · {shortDate(insight.event_date)}
                      </Text>
                    )}
                  </View>
                  <Badge label="AI INSIGHT" />
                </View>

                <Text
                  style={{
                    fontFamily: 'Archivo-700',
                    fontSize: 15,
                    lineHeight: 18.75,
                    color: '#17262D',
                    marginTop: 7,
                    marginBottom: 5,
                  }}
                >
                  {insight.title}
                </Text>

                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 12,
                    lineHeight: 17.4,
                    color: '#5D6B70',
                  }}
                >
                  {insight.body}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  {insight.recommendation_count > 0 && (
                    <View
                      style={{
                        backgroundColor: 'rgba(228,119,42,0.12)',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{ fontFamily: 'Archivo-700', fontSize: 10, color: '#E4772A' }}>
                        {insight.recommendation_count} ACTION
                        {insight.recommendation_count === 1 ? '' : 'S'}
                      </Text>
                    </View>
                  )}
                  {!!insight.event_site && (
                    <View
                      style={{
                        backgroundColor: '#EFEDE7',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{ fontFamily: 'PublicSans-600', fontSize: 10, color: '#5D6B70' }}>
                        {insight.event_site}
                      </Text>
                    </View>
                  )}
                  {supervisor && insight.owner_id !== userId && (
                    <View
                      style={{
                        backgroundColor: '#E7EEF0',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 20,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: 'PublicSans-600', fontSize: 10, color: '#1E7F94' }}
                      >
                        {insight.owner_name ?? 'Team'}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={{
                      fontFamily: 'IBMPlexMono-400',
                      fontSize: 9.5,
                      color: '#8A9499',
                      marginLeft: 'auto',
                    }}
                  >
                    {displayRef(insight.event_id)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}
