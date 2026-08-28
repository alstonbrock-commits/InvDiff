import React, { useMemo } from 'react';
import { View, ScrollView, Text, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, StatTile, Eyebrow } from '@/components';
import {
  fetchAdminUsage,
  fetchAdminUsageDaily,
  type AdminUsageDay,
} from '@/lib/remote';

interface Week {
  label: string;
  reports: number;
  active: number;
  events: number;
}

// Roll the 90-day series up into the last 8 whole weeks, newest first.
function toWeeks(days: AdminUsageDay[]): Week[] {
  const weeks: Week[] = [];
  const sorted = [...days].sort((a, b) => (a.day < b.day ? 1 : -1));
  for (let i = 0; i < sorted.length; i += 7) {
    const slice = sorted.slice(i, i + 7);
    if (slice.length === 0) break;
    const start = new Date(slice[slice.length - 1].day);
    weeks.push({
      label: start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      reports: slice.reduce((n, d) => n + d.reports_finalised, 0),
      active: Math.max(...slice.map((d) => d.active_users), 0),
      events: slice.reduce((n, d) => n + d.events_created, 0),
    });
    if (weeks.length === 8) break;
  }
  return weeks;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

export default function AdminOverview() {
  const usage = useQuery({ queryKey: ['admin-usage'], queryFn: fetchAdminUsage, retry: 1 });
  const daily = useQuery({
    queryKey: ['admin-usage-daily'],
    queryFn: fetchAdminUsageDaily,
    retry: 1,
  });
  const u = usage.data;

  const weeks = useMemo(() => toWeeks(daily.data ?? []), [daily.data]);
  const busiest = useMemo(
    () => Math.max(1, ...weeks.map((w) => w.reports + w.events)),
    [weeks],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="brand" showWatermark />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={
              (usage.isFetching && !usage.isLoading) || (daily.isFetching && !daily.isLoading)
            }
            onRefresh={() => {
              void usage.refetch();
              void daily.refetch();
            }}
            tintColor="#E4772A"
          />
        }
      >
        <Eyebrow>App usage</Eyebrow>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile number={num(u?.total_reports)} caption="Reports produced" status="completed" />
          <StatTile number={num(u?.total_events)} caption="Events logged" status="needs-review" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile number={num(u?.total_interviews)} caption="Interviews" status="completed" />
          <StatTile number={num(u?.total_users)} caption="Accounts" status="completed" />
        </View>

        <Eyebrow style={{ marginTop: 4 }}>Active users</Eyebrow>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile number={num(u?.active_1d)} caption="Today" status="needs-review" />
          <StatTile number={num(u?.active_7d)} caption="This week" status="completed" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile number={num(u?.active_30d)} caption="This month" status="completed" />
          <StatTile
            number={u?.events_per_active_user_30d != null ? String(u.events_per_active_user_30d) : '—'}
            caption="Events per active user"
            status="completed"
          />
        </View>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            padding: 13,
            gap: 6,
          }}
        >
          {[
            ['Events in the last 30 days', num(u?.events_30d)],
            ['Reports in the last 30 days', num(u?.reports_30d)],
            [
              'Reports per account',
              u?.reports_per_user != null ? String(u.reports_per_user) : '—',
            ],
            [
              'Events per account',
              u?.events_per_user != null ? String(u.events_per_user) : '—',
            ],
          ].map(([label, value]) => (
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

        {weeks.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 4 }}>Last 8 weeks</Eyebrow>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E3DC',
                borderRadius: 12,
                padding: 13,
                gap: 9,
              }}
            >
              {weeks.map((w) => (
                <View key={w.label} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text
                      style={{
                        fontFamily: 'IBMPlexMono-400',
                        fontSize: 10,
                        color: '#8A9499',
                      }}
                    >
                      W/C {w.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PublicSans-400',
                        fontSize: 11.5,
                        color: '#5D6B70',
                      }}
                    >
                      {`${w.reports} report${w.reports === 1 ? '' : 's'} · ${w.events} event${
                        w.events === 1 ? '' : 's'
                      } · ${w.active} active`}
                    </Text>
                  </View>
                  {/* Bar is relative to the busiest week, so it reads at a glance. */}
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#EFEDE7',
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(((w.reports + w.events) / busiest) * 100)}%`,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#2CA5C0',
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
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
          A user counts as active on a day they logged an event, recorded an answer,
          approved a transcript, or changed a setting.
        </Text>

        {(usage.isError || daily.isError) && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
            }}
          >
            Usage figures are online-only — reconnect to load them.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
