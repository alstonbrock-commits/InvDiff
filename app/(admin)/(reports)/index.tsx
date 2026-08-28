import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, EventCard, Eyebrow } from '@/components';
import { displayRef } from '@/lib/db/queries';
import { fetchAdminReports, type AdminReportItem } from '@/lib/remote';

type FilterId = 'all' | 'done' | 'progress';

function groupHeading(iso: string, now: Date): string {
  const d = new Date(iso);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfDay) return 'Today';
  const weekAgo = new Date(startOfDay);
  weekAgo.setDate(weekAgo.getDate() - 6);
  if (d >= weekAgo) return 'Earlier this week';
  return 'Earlier';
}

function meta(r: AdminReportItem): string {
  const parts = [r.site, r.owner_name].filter(Boolean) as string[];
  const who = parts.join(' · ');
  const count =
    r.insight_count > 0
      ? `${r.insight_count} insight${r.insight_count === 1 ? '' : 's'}`
      : `${r.interviewee_count} interviewee${r.interviewee_count === 1 ? '' : 's'}`;
  return who ? `${who} · ${count}` : count;
}

// Read-only: every report the app has produced, newest first.
export default function AdminReports() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');

  // One retry, not three: offline the screen should say so promptly rather
  // than sitting on an empty list through the backoff.
  const reports = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => fetchAdminReports(),
    retry: 1,
  });
  const items = useMemo(() => reports.data ?? [], [reports.data]);

  const counts = {
    all: items.length,
    done: items.filter((r) => r.status === 'finalised').length,
    progress: items.filter((r) => r.status !== 'finalised').length,
  };
  const filters: { id: FilterId; label: string; color: string; bg: string }[] = [
    { id: 'all', label: `All ${counts.all}`, color: '#FFFFFF', bg: '#1B2B3A' },
    {
      id: 'done',
      label: `Completed ${counts.done}`,
      color: '#2CA5C0',
      bg: 'rgba(44,165,192,0.14)',
    },
    {
      id: 'progress',
      label: `In progress ${counts.progress}`,
      color: '#E4772A',
      bg: 'rgba(228,119,42,0.12)',
    },
  ];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((r) =>
        filter === 'all'
          ? true
          : filter === 'done'
            ? r.status === 'finalised'
            : r.status !== 'finalised',
      )
      .filter(
        (r) =>
          !q ||
          [
            r.title,
            r.site ?? '',
            r.owner_name ?? '',
            r.executive_summary ?? '',
            displayRef(r.id),
          ]
            .join(' ')
            .toLowerCase()
            .includes(q),
      );
  }, [items, filter, search]);

  const groups = useMemo(() => {
    const now = new Date();
    const out: { heading: string; rows: AdminReportItem[] }[] = [];
    for (const r of visible) {
      const heading = groupHeading(r.sort_at, now);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.rows.push(r);
      else out.push({ heading, rows: [r] });
    }
    return out;
  }, [visible]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Reports"
        subtitle="Every event across the organisation"
        searchPlaceholder="Search reports, sites, people, IDs"
        searchValue={search}
        onSearchChange={setSearch}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={reports.isFetching && !reports.isLoading}
            onRefresh={() => void reports.refetch()}
            tintColor="#E4772A"
          />
        }
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 7,
            paddingTop: 14,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          {filters.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                backgroundColor: f.bg,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 20,
                opacity: filter === f.id ? 1 : 0.55,
              }}
            >
              <Text style={{ fontFamily: 'PublicSans-700', fontSize: 11, color: f.color }}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {reports.isLoading && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              Loading reports…
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
              Reports are online-only — reconnect to load them.
            </Text>
          )}

          {reports.data && visible.length === 0 && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              Nothing matches that search.
            </Text>
          )}

          {groups.map((group, groupIndex) => (
            <React.Fragment key={group.heading}>
              <Eyebrow style={{ marginTop: groupIndex > 0 ? 4 : 0 }}>{group.heading}</Eyebrow>
              {group.rows.map((r) => (
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
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
