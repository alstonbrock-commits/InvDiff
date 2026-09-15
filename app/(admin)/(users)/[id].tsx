import React, { useMemo } from 'react';
import { View, ScrollView, Text, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, Eyebrow, EventCard } from '@/components';
import { displayRef } from '@/lib/db/queries';
import {
  fetchAdminReports,
  fetchAdminUserMetrics,
  type AdminReportItem,
} from '@/lib/remote';

const CARD = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E5E3DC',
  borderRadius: 12,
  padding: 13,
} as const;

const ROLE_LABEL: Record<string, string> = {
  facilitator: 'Facilitator',
  admin: 'Administrator',
};

function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function lastActive(iso: string | null | undefined): string {
  if (!iso) return 'Never active';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Active ${months} month${months === 1 ? '' : 's'} ago`;
}

function meta(r: AdminReportItem): string {
  const count =
    r.insight_count > 0
      ? `${r.insight_count} insight${r.insight_count === 1 ? '' : 's'}`
      : `${r.interviewee_count} interviewee${r.interviewee_count === 1 ? '' : 's'}`;
  return r.site ? `${r.site} · ${count}` : count;
}

// Everything one account has produced. Read-only, like the rest of the owner's
// view: the way in to a person's events without hunting the Reports list.
export default function AdminUserDetail() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const users = useQuery({
    queryKey: ['admin-user-metrics'],
    queryFn: fetchAdminUserMetrics,
    retry: 1,
  });
  const reports = useQuery({
    queryKey: ['admin-reports', id],
    queryFn: () => fetchAdminReports(id!),
    enabled: !!id,
    retry: 1,
  });

  const user = useMemo(
    () => (users.data ?? []).find((u) => u.id === id) ?? null,
    [users.data, id],
  );
  const rows = reports.data ?? [];
  const completed = rows.filter((r) => r.status === 'finalised').length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title={user?.full_name || name || 'Account'}
        subtitle={user?.email ?? ''}
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
        refreshControl={
          <RefreshControl
            refreshing={reports.isFetching && !reports.isLoading}
            onRefresh={() => {
              void users.refetch();
              void reports.refetch();
            }}
            tintColor="#E4772A"
          />
        }
      >
        <Eyebrow>Account</Eyebrow>
        <View style={{ ...CARD, gap: 6 }}>
          {(
            [
              ['Role', ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? '—'],
              ['Job title', user?.job_title || '—'],
              ['Joined', longDate(user?.created_at)],
              ['Last active', lastActive(user?.last_active_at)],
              ['Newsletter', user?.newsletter_opt_in ? 'Subscribed' : 'Not subscribed'],
            ] as [string, string][]
          ).map(([label, value]) => (
            <View
              key={label}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
            >
              <Text style={{ fontFamily: 'PublicSans-400', fontSize: 12.5, color: '#5D6B70' }}>
                {label}
              </Text>
              <Text
                style={{
                  fontFamily: 'PublicSans-600',
                  fontSize: 12.5,
                  color: '#17262D',
                  flexShrink: 1,
                  textAlign: 'right',
                }}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 4 }}>Activity</Eyebrow>
        <View
          style={{
            ...CARD,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {(
            [
              ['Events', user?.events_total ?? 0],
              ['Reports', user?.reports_total ?? 0],
              ['Interviews', user?.interviews_total ?? 0],
              ['Answers', user?.answers_recorded ?? 0],
            ] as [string, number][]
          ).map(([label, value]) => (
            <View key={label} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: 'Archivo-800', fontSize: 17, color: '#17262D' }}>
                {value}
              </Text>
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 10.5,
                  color: '#8A9499',
                  marginTop: 1,
                }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 4 }}>
          {rows.length === 0
            ? 'Events'
            : `Events (${completed} completed of ${rows.length})`}
        </Eyebrow>

        {reports.isLoading && (
          <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, color: '#5D6B70' }}>
            Loading…
          </Text>
        )}

        {reports.isError && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
            }}
          >
            This is online-only — reconnect to load it.
          </Text>
        )}

        {reports.data && rows.length === 0 && (
          <View style={CARD}>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12.5,
                lineHeight: 18.75,
                color: '#3A474D',
              }}
            >
              This account has not logged an event yet.
            </Text>
          </View>
        )}

        {rows.map((r) => (
          <EventCard
            key={r.id}
            eventId={displayRef(r.id)}
            title={r.title}
            meta={meta(r)}
            status={r.status === 'finalised' ? 'completed' : 'needs-review'}
            statusLabel={r.status === 'finalised' ? 'COMPLETED' : 'IN PROGRESS'}
            padding={13}
            onPress={() =>
              router.push({
                pathname: '/(admin)/(reports)/[id]',
                params: { id: r.id, title: r.title, owner: r.owner_name ?? '' },
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}
